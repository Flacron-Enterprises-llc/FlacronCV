import type { Pool } from 'pg';
import { PLAN_ORDER } from '@flacroncv/career-shared';
import type { PlanId } from '@flacroncv/career-shared';
import { lockAccount, openBalances } from '../billing/accounts';
import type { AccountRow } from '../billing/accounts';
import { CatalogStore, includedUnitsFor } from '../billing/catalog';
import { withTransaction } from '../billing/db';
import type { Db } from '../billing/db';
import { periodContaining } from '../billing/periods';

/**
 * FlacronCV V1 owns identity, plans, subscriptions and credits. The career
 * features (the former V2 product) run beside it and never sell a plan of
 * their own. Which career allowances a V1 customer receives is a client
 * decision, so it is configuration: `CAREER_PLAN_MAP`.
 *
 * Every V1 plan maps to `none` unless the map says otherwise, so a missing
 * or empty map switches the career features off for everyone.
 */
export const V1_PLANS = ['free', 'pro', 'career_accelerator', 'enterprise'] as const;
export type V1Plan = (typeof V1_PLANS)[number];

export type CareerPlanMap = Record<V1Plan, PlanId | null>;

export function isV1Plan(value: unknown): value is V1Plan {
  return typeof value === 'string' && (V1_PLANS as readonly string[]).includes(value);
}

/**
 * `free:none,pro:professional,career_accelerator:career_pro,enterprise:business`.
 * Unknown V1 plans or career plans are a boot error (named, never echoed
 * with a secret). Omitted V1 plans are `none`.
 */
export function parseCareerPlanMap(raw: string | undefined): CareerPlanMap {
  const map: CareerPlanMap = { free: null, pro: null, career_accelerator: null, enterprise: null };
  const text = raw?.trim() ?? '';
  if (text.length === 0) return map;
  for (const entry of text.split(',')) {
    const [rawKey, rawValue, extra] = entry.split(':').map((part) => part.trim());
    if (!rawKey || rawValue === undefined || extra !== undefined) {
      throw new Error('CAREER_PLAN_MAP entries must look like v1plan:careerplan');
    }
    if (!isV1Plan(rawKey)) throw new Error(`CAREER_PLAN_MAP names an unknown V1 plan: ${rawKey}`);
    if (rawValue === 'none') {
      map[rawKey] = null;
      continue;
    }
    if (!(PLAN_ORDER as readonly string[]).includes(rawValue)) {
      throw new Error(`CAREER_PLAN_MAP names an unknown career plan: ${rawValue}`);
    }
    map[rawKey] = rawValue as PlanId;
  }
  return map;
}

/** What the career service reads about a V1 customer. Read-only; V1 stays the owner. */
export interface V1AccountSnapshot {
  uid: string;
  /** The V1 *effective* plan (`resolveEffectivePlan`), not the stored label. */
  plan: V1Plan;
  /** False once V1 soft-deleted or deactivated the account. */
  active: boolean;
}

export interface V1AccountSource {
  read(uid: string): Promise<V1AccountSnapshot | null>;
}

export type CareerAccess =
  | { enabled: true; v1Plan: V1Plan; careerPlan: PlanId }
  | { enabled: false; v1Plan: V1Plan | null; reason: 'plan_not_mapped' | 'v1_account_missing' | 'v1_account_inactive' };

export function decideCareerAccess(account: V1AccountSnapshot | null, map: CareerPlanMap): CareerAccess {
  if (!account) return { enabled: false, v1Plan: null, reason: 'v1_account_missing' };
  if (!account.active) return { enabled: false, v1Plan: account.plan, reason: 'v1_account_inactive' };
  const careerPlan = map[account.plan];
  if (!careerPlan) return { enabled: false, v1Plan: account.plan, reason: 'plan_not_mapped' };
  return { enabled: true, v1Plan: account.plan, careerPlan };
}

/**
 * Brings one career billing account in line with the mapped plan.
 *
 * - Runs under the account row lock, so concurrent requests serialise.
 * - Idempotent: a second call with the same plan changes nothing.
 * - A plan change re-grants the current period as "new grant minus units
 *   already used" (floored at 0). Flipping plans therefore never hands out a
 *   second month; it can only move the ceiling.
 * - A unit the new plan does not include loses its remaining balance.
 * - While the V1 plan stays mapped the allowance renews each anniversary
 *   month, as V2 did for an active subscription. Nothing is charged here,
 *   and V1 credits, balances and subscriptions are never read for writing.
 */
export async function applyMappedPlan(
  pool: Pool,
  billingAccountId: string,
  access: Extract<CareerAccess, { enabled: true }>,
  catalogVersion: string,
  now: Date,
  catalogs: CatalogStore = new CatalogStore(),
): Promise<{ changed: boolean; renewed: boolean }> {
  return withTransaction(pool, async (db) => {
    const account = await lockAccount(db, billingAccountId);
    const snapshot = await catalogs.get(db, account.catalog_version || catalogVersion);
    const renewed = await renewIfDue(db, account, now);
    const changed = account.plan_id !== access.careerPlan;
    if (changed) {
      await db.query(
        `UPDATE billing_accounts
            SET plan_id = $2, interval = 'monthly', status = 'active', trial_end = NULL,
                provider = NULL, provider_customer_id = NULL, provider_subscription_id = NULL,
                cancel_at_period_end = false, scheduled_plan_id = NULL, scheduled_interval = NULL,
                updated_at = now()
          WHERE id = $1`,
        [account.id, access.careerPlan],
      );
      account.plan_id = access.careerPlan;
      const kept = includedUnitsFor(snapshot, access.careerPlan).map(([unit]) => unit);
      await db.query(
        `UPDATE usage_balances SET included_remaining = 0, updated_at = now()
          WHERE billing_account_id = $1 AND allowance_period_start = $2
            AND candidate_auth_user_id IS NULL AND NOT (unit = ANY($3::text[]))`,
        [account.id, account.allowance_period_start, kept],
      );
      await openBalances(db, account, snapshot, { regrant: true });
    } else if (renewed) {
      await openBalances(db, account, snapshot);
    }
    // A mapped paid plan keeps a paid period equal to the allowance period, so
    // V2's worker renewal never grants past what V1 currently says.
    await db.query(
      `UPDATE billing_accounts
          SET plan_source = 'v1_mapping', v1_plan = $2, v1_plan_synced_at = $3,
              period_start = CASE WHEN plan_id = 'free' THEN NULL ELSE allowance_period_start END,
              period_end = CASE WHEN plan_id = 'free' THEN NULL ELSE allowance_period_end END
        WHERE id = $1`,
      [account.id, access.v1Plan, now],
    );
    return { changed, renewed };
  });
}

async function renewIfDue(db: Db, account: AccountRow, now: Date): Promise<boolean> {
  if (now < account.allowance_period_end) return false;
  const period = periodContaining(account.allowance_anchor, now);
  await db.query(
    `UPDATE billing_accounts SET allowance_period_start = $2, allowance_period_end = $3, updated_at = now() WHERE id = $1`,
    [account.id, period.start, period.end],
  );
  account.allowance_period_start = period.start;
  account.allowance_period_end = period.end;
  return true;
}
