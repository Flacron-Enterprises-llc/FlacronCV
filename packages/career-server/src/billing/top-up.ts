import type { Addon, PlanId, UsageUnit } from '@flacroncv/career-shared';
import type { AccountRow } from './accounts';
import { includedFor, isUsageUnit, isV2Plan, planRank } from './catalog';
import type { CatalogSnapshot } from './catalog';
import type { Db } from './db';
import { BillingError } from './errors';

/**
 * Optional automatic top-ups (spec section 11): "Automatic overages are
 * disabled by default. Optional top-ups require explicit consent,
 * compatible packs, and a monthly spending cap."
 *
 * This decides only. Charging is V1's job (it owns Stripe), and the pack is
 * granted from V1's verified payment like any other pack.
 */
export interface TopUpSettings {
  enabled: boolean;
  spendingCapCents: number | null;
  consentAt: Date | null;
  /** Preferred pack per unit (`{ document_credit: 'document_m' }`). */
  addons: Partial<Record<string, string>>;
}

export type TopUpRefusal =
  | 'not_enabled'
  | 'no_consent'
  | 'no_spending_cap'
  | 'free_plan'
  | 'unit_not_in_plan'
  | 'no_compatible_pack'
  | 'spending_cap_reached';

export type TopUpDecision =
  | { eligible: true; addonId: string; unit: UsageUnit; units: number; priceCents: number; spentCents: number; capCents: number }
  | { eligible: false; reason: TopUpRefusal };

/** A pack the plan may buy for this unit: one-time usage pack, sellable, plan at or above its minimum. */
export function compatiblePacks(snapshot: CatalogSnapshot, planId: PlanId, unit: UsageUnit): Addon[] {
  return snapshot.addons
    .filter(
      (a) =>
        a.kind === 'usage_pack' &&
        a.billing === 'one_time' &&
        a.status === 'active' &&
        a.firmPrice &&
        a.unit === unit &&
        planRank(snapshot, planId) >= planRank(snapshot, a.minPlan),
    )
    .sort((a, b) => a.priceCents - b.priceCents || a.id.localeCompare(b.id));
}

/**
 * Pure rule. `spentCents` is what automatic top-ups already cost in the
 * current allowance month. The chosen pack must fit under the cap in full;
 * a pack is never split or partly charged.
 */
export function decideTopUp(
  snapshot: CatalogSnapshot,
  planId: string,
  unit: string,
  settings: TopUpSettings,
  spentCents: number,
): TopUpDecision {
  if (!settings.enabled) return { eligible: false, reason: 'not_enabled' };
  if (!settings.consentAt) return { eligible: false, reason: 'no_consent' };
  if (settings.spendingCapCents === null) return { eligible: false, reason: 'no_spending_cap' };
  if (!isV2Plan(snapshot, planId) || planId === 'free') return { eligible: false, reason: 'free_plan' };
  if (!isUsageUnit(snapshot, unit) || includedFor(snapshot, planId, unit) === null) {
    return { eligible: false, reason: 'unit_not_in_plan' };
  }
  const packs = compatiblePacks(snapshot, planId, unit);
  const preferred = settings.addons[unit];
  const pack = (preferred ? packs.find((p) => p.id === preferred) : undefined) ?? packs[0];
  if (!pack) return { eligible: false, reason: 'no_compatible_pack' };
  if (spentCents + pack.priceCents > settings.spendingCapCents) return { eligible: false, reason: 'spending_cap_reached' };
  return {
    eligible: true,
    addonId: pack.id,
    unit,
    units: pack.units,
    priceCents: pack.priceCents,
    spentCents,
    capCents: settings.spendingCapCents,
  };
}

export async function readTopUpSettings(db: Db, accountId: string): Promise<TopUpSettings> {
  const res = await db.query<{
    auto_topup: boolean;
    spending_cap_cents: number | null;
    auto_topup_consent_at: Date | null;
    topup_addons: Record<string, string> | null;
  }>(`SELECT auto_topup, spending_cap_cents, auto_topup_consent_at, topup_addons FROM billing_accounts WHERE id = $1`, [accountId]);
  const row = res.rows[0];
  if (!row) throw new BillingError('not_found', { billingAccountId: accountId });
  return {
    enabled: row.auto_topup,
    spendingCapCents: row.spending_cap_cents,
    consentAt: row.auto_topup_consent_at,
    addons: row.topup_addons ?? {},
  };
}

/** Cents of automatic top-ups bought since the allowance month started. Manual packs do not count. */
export async function topUpSpentCents(db: Db, account: AccountRow): Promise<number> {
  const res = await db.query<{ cents: string }>(
    `SELECT COALESCE(SUM(amount_cents - COALESCE(refunded_cents, 0)), 0)::text AS cents FROM purchases
      WHERE billing_account_id = $1 AND auto_topup AND purchased_at >= $2`,
    [account.id, account.allowance_period_start],
  );
  return Number(res.rows[0]?.cents ?? 0);
}

/**
 * Turns top-ups on or off. Turning on needs `consent: true` from an explicit
 * customer action and an existing spending cap; it records the consent time.
 * Turning off needs nothing. Preferred packs must be compatible with the plan.
 */
export async function setTopUp(
  db: Db,
  account: AccountRow,
  snapshot: CatalogSnapshot,
  input: { enabled: boolean; consent?: boolean; addons?: Partial<Record<string, string>> },
  now: Date,
): Promise<TopUpSettings> {
  const current = await readTopUpSettings(db, account.id);
  const addons = { ...current.addons };
  for (const [unit, addonId] of Object.entries(input.addons ?? {})) {
    if (addonId === undefined) continue;
    if (!isUsageUnit(snapshot, unit) || !isV2Plan(snapshot, account.plan_id)) {
      throw new BillingError('validation_error', { field: 'addons', reason: 'invalid' });
    }
    if (!compatiblePacks(snapshot, account.plan_id, unit).some((p) => p.id === addonId)) {
      throw new BillingError('not_purchasable', { addonId });
    }
    addons[unit] = addonId;
  }
  if (input.enabled) {
    if (input.consent !== true) throw new BillingError('validation_error', { field: 'consent', reason: 'required' });
    if (current.spendingCapCents === null) throw new BillingError('validation_error', { field: 'spendingCapCents', reason: 'required' });
    if (!isV2Plan(snapshot, account.plan_id) || account.plan_id === 'free') {
      throw new BillingError('plan_upgrade_required', { feature: 'topUp', minimumPlan: 'starter' });
    }
  }
  await db.query(
    `UPDATE billing_accounts
        SET auto_topup = $2, auto_topup_consent_at = CASE WHEN $2 THEN $3::timestamptz ELSE NULL END,
            topup_addons = $4::jsonb, updated_at = now()
      WHERE id = $1`,
    [account.id, input.enabled, now, JSON.stringify(addons)],
  );
  return readTopUpSettings(db, account.id);
}
