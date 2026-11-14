import type { BillingInterval, PlanId, PurchaseChannel } from '@flacroncv/career-shared';
import { allowanceDeltas, CatalogSnapshot, includedUnitsFor, isV2Plan, planRank } from './catalog';
import type { Db } from './db';
import { BillingError } from './errors';
import { addMonthsUtc, periodContaining } from './periods';
import { personKey } from '../privacy/live-person';

export type AccountStatus = 'trialing' | 'active' | 'past_due' | 'canceled' | 'incomplete';

export interface AccountRow {
  id: string;
  workspace_id: string;
  auth_user_id: string | null;
  plan_id: string;
  legacy_plan: string | null;
  catalog_version: string;
  interval: BillingInterval;
  status: AccountStatus;
  trial_end: Date | null;
  has_used_trial: boolean;
  period_start: Date | null;
  period_end: Date | null;
  allowance_anchor: Date;
  allowance_period_start: Date;
  allowance_period_end: Date;
  provider: PurchaseChannel | null;
  provider_customer_id: string | null;
  provider_subscription_id: string | null;
  cancel_at_period_end: boolean;
  scheduled_plan_id: PlanId | null;
  scheduled_interval: BillingInterval | null;
  provider_state_at: Date | null;
  origin: 'v2' | 'migrated';
  /**
   * Recurring capacity add-ons on top of the plan's count caps, by allowance
   * field (`{ locationProfiles: 1 }`). Written only from verified V1 Stripe
   * state (`applyCapacityExtras`); `checkCapacity` adds them to the limit.
   * Optional so rows built in memory (tests, fixtures) need not carry it.
   */
  capacity_extras?: Partial<Record<string, number>> | null;
}

const ACCOUNT_COLUMNS = `id, workspace_id, auth_user_id, plan_id, legacy_plan, catalog_version, interval, status,
  trial_end, has_used_trial, period_start, period_end, allowance_anchor, allowance_period_start,
  allowance_period_end, provider, provider_customer_id, provider_subscription_id, cancel_at_period_end,
  scheduled_plan_id, scheduled_interval, provider_state_at, origin, capacity_extras`;

/**
 * Statuses that may spend. `past_due` keeps access while the provider
 * retries; the provider's cancel event ends it (P3).
 */
export const SPENDABLE_STATUSES: readonly AccountStatus[] = ['active', 'trialing', 'past_due'];

/** Every billing write takes this row lock first, so writes on one account are serial. */
export async function lockAccount(db: Db, accountId: string): Promise<AccountRow> {
  const res = await db.query<AccountRow>(
    `SELECT ${ACCOUNT_COLUMNS} FROM billing_accounts WHERE id = $1 FOR UPDATE`,
    [accountId],
  );
  const row = res.rows[0];
  if (!row) throw new BillingError('not_found', { billingAccountId: accountId });
  return row;
}

export async function readAccount(db: Db, accountId: string): Promise<AccountRow> {
  const res = await db.query<AccountRow>(`SELECT ${ACCOUNT_COLUMNS} FROM billing_accounts WHERE id = $1`, [accountId]);
  const row = res.rows[0];
  if (!row) throw new BillingError('not_found', { billingAccountId: accountId });
  return row;
}

export function v2PlanOf(snapshot: CatalogSnapshot, account: AccountRow): PlanId {
  if (!isV2Plan(snapshot, account.plan_id)) {
    // Legacy rows get their own snapshot in P16. Until then they cannot spend V2 units.
    throw new BillingError('not_found', { planId: account.plan_id, catalogVersion: snapshot.version });
  }
  return account.plan_id;
}

/**
 * Inserts the included grant for every unit the plan includes, for the
 * account's current allowance period. A row that already exists is kept,
 * unless `regrant` is set: then the row takes this plan's grant and keeps
 * the units already used in that period.
 */
export async function openBalances(
  db: Db,
  account: AccountRow,
  snapshot: CatalogSnapshot,
  options: { regrant?: boolean } = {},
): Promise<void> {
  const planId = v2PlanOf(snapshot, account);
  const carried = await carriedUsage(db, account);
  // A unit's "used" in this period is what this account used, or what a deleted
  // account of the same sign-in used in the same period, whichever is larger.
  const onConflict = options.regrant
    ? `DO UPDATE SET included_granted = EXCLUDED.included_granted,
         included_remaining = GREATEST(
           EXCLUDED.included_granted - GREATEST(usage_balances.included_granted - usage_balances.included_remaining, $7::int), 0),
         allowance_period_end = EXCLUDED.allowance_period_end,
         updated_at = now()`
    : 'DO NOTHING';
  for (const [unit, included] of includedUnitsFor(snapshot, planId)) {
    await db.query(
      `INSERT INTO usage_balances
         (billing_account_id, workspace_id, unit, allowance_period_start, allowance_period_end,
          included_granted, included_remaining)
       VALUES ($1, $2, $3, $4, $5, $6, GREATEST($6::int - $7::int, 0))
       ON CONFLICT ON CONSTRAINT usage_balances_one_row_per_period ${onConflict}`,
      [account.id, account.workspace_id, unit, account.allowance_period_start, account.allowance_period_end, included, carried.get(unit) ?? 0],
    );
  }
}

/**
 * Units a deleted account of the same sign-in already used in this exact
 * allowance period (`allowance_carryovers`, written at erase time).
 */
async function carriedUsage(db: Db, account: AccountRow): Promise<Map<string, number>> {
  if (!account.auth_user_id) return new Map();
  const res = await db.query<{ unit: string; used: number }>(
    `SELECT unit, used FROM allowance_carryovers WHERE person_key = $1 AND period_end = $2`,
    [personKey(account.auth_user_id), account.allowance_period_end],
  );
  return new Map(res.rows.map((row) => [row.unit, row.used]));
}

/**
 * The anchor of a deleted account of this sign-in whose allowance period has
 * not ended yet, so a re-created account lands in the same period (and its
 * carried usage applies) instead of starting a fresh one.
 */
export async function carriedAnchor(db: Db, authUserId: string, now: Date): Promise<Date | null> {
  const res = await db.query<{ anchor: Date }>(
    `SELECT anchor FROM allowance_carryovers WHERE person_key = $1 AND period_end > $2 ORDER BY period_end DESC LIMIT 1`,
    [personKey(authUserId), now],
  );
  return res.rows[0]?.anchor ?? null;
}

/**
 * Section 11 renewal. Moves the allowance period to the anniversary
 * period that contains `now` and grants that month. Unused included units
 * do not carry. Packs are not touched. No provider is called.
 *
 * Free always renews (decision 5, including a Free account copied from
 * V1). A paid account renews only inside its paid period: an annual plan
 * renews every month until `period_end`; a monthly plan waits for the
 * payment event that moves `period_end`. Returns true when it advanced.
 */
export async function advanceAllowancePeriod(
  db: Db,
  account: AccountRow,
  snapshot: CatalogSnapshot,
  now: Date,
): Promise<boolean> {
  if (now < account.allowance_period_end) return false;
  const target = periodContaining(account.allowance_anchor, now);
  if (!mayGrantPeriodStarting(account, target.start)) return false;

  await db.query(
    `UPDATE billing_accounts
        SET allowance_period_start = $2, allowance_period_end = $3, updated_at = now()
      WHERE id = $1`,
    [account.id, target.start, target.end],
  );
  account.allowance_period_start = target.start;
  account.allowance_period_end = target.end;
  await openBalances(db, account, snapshot);
  return true;
}

function mayGrantPeriodStarting(account: AccountRow, start: Date): boolean {
  if (account.plan_id === 'free') return account.status === 'active';
  if (account.status === 'canceled' || account.status === 'incomplete') return false;
  return account.period_end !== null && start < account.period_end;
}

export interface CreateFreeAccountInput {
  authUserId: string;
  locale?: 'en' | 'fr';
  workspaceName?: string;
  /** Account creation time. For a V1 copy, the V1 `createdAt`. */
  anchor: Date;
  origin?: 'v2' | 'migrated';
  hasUsedTrial?: boolean;
  catalog: CatalogSnapshot;
  now: Date;
}

export async function createFreeAccount(db: Db, input: CreateFreeAccountInput): Promise<AccountRow> {
  const user = await db.query<{ id: string }>(
    `INSERT INTO users (auth_user_id, locale) VALUES ($1, $2) RETURNING id`,
    [input.authUserId, input.locale ?? 'en'],
  );
  const workspace = await db.query<{ id: string }>(
    `INSERT INTO workspaces (owner_user_id, kind, name) VALUES ($1, 'individual', $2) RETURNING id`,
    [user.rows[0].id, input.workspaceName ?? null],
  );
  const period = periodContaining(input.anchor, input.now);
  const res = await db.query<AccountRow>(
    `INSERT INTO billing_accounts
       (workspace_id, auth_user_id, plan_id, catalog_version, interval, status, has_used_trial,
        allowance_anchor, allowance_period_start, allowance_period_end, origin)
     VALUES ($1, $2, 'free', $3, 'monthly', 'active', $4, $5, $6, $7, $8)
     RETURNING ${ACCOUNT_COLUMNS}`,
    [
      workspace.rows[0].id,
      input.authUserId,
      input.catalog.version,
      input.hasUsedTrial ?? false,
      input.anchor,
      period.start,
      period.end,
      input.origin ?? 'v2',
    ],
  );
  const account = res.rows[0];
  await openBalances(db, account, input.catalog);
  return account;
}

export interface StartSubscriptionInput {
  planId: PlanId;
  interval: BillingInterval;
  provider: PurchaseChannel;
  providerCustomerId?: string | null;
  providerSubscriptionId?: string | null;
  periodStart: Date;
  /** Defaults to one month or one year after `periodStart`. */
  periodEnd?: Date;
  status?: 'active' | 'trialing';
  trialEnd?: Date | null;
}

/**
 * A verified payment event starts a paid plan on an account that is not
 * already paying. The billing anniversary becomes `periodStart`, and that
 * month's included grant opens. An annual plan still opens one month only.
 */
export async function startSubscription(
  db: Db,
  account: AccountRow,
  input: StartSubscriptionInput,
  snapshot: CatalogSnapshot,
  now: Date,
): Promise<AccountRow> {
  if (!isV2Plan(snapshot, input.planId) || input.planId === 'free') {
    throw new BillingError('validation_error', { planId: input.planId });
  }
  const payingV2 = account.plan_id !== 'free' && isV2Plan(snapshot, account.plan_id) && account.status !== 'canceled';
  if (payingV2) {
    // A paid-to-paid change is upgradePlan, which keeps used units.
    throw new BillingError('validation_error', { reason: 'already_subscribed', planId: account.plan_id });
  }
  if (!snapshot.purchaseChannels[input.planId][input.interval].includes(input.provider)) {
    throw new BillingError('validation_error', {
      reason: 'channel_unavailable',
      planId: input.planId,
      interval: input.interval,
      provider: input.provider,
    });
  }
  const status = input.status ?? 'active';
  if (status === 'trialing' && !input.trialEnd) {
    throw new BillingError('validation_error', { reason: 'trial_end_required' });
  }
  const periodEnd = input.periodEnd ?? addMonthsUtc(input.periodStart, input.interval === 'annual' ? 12 : 1);
  const allowance = periodContaining(input.periodStart, now < input.periodStart ? input.periodStart : now);

  const res = await db.query<AccountRow>(
    `UPDATE billing_accounts
        SET plan_id = $2, legacy_plan = NULL, catalog_version = $3, interval = $4, status = $5,
            trial_end = $6, has_used_trial = has_used_trial OR $7,
            period_start = $8, period_end = $9,
            allowance_anchor = $8, allowance_period_start = $10, allowance_period_end = $11,
            provider = $12, provider_customer_id = $13, provider_subscription_id = $14,
            cancel_at_period_end = false, updated_at = now()
      WHERE id = $1
      RETURNING ${ACCOUNT_COLUMNS}`,
    [
      account.id,
      input.planId,
      snapshot.version,
      input.interval,
      status,
      input.trialEnd ?? null,
      status === 'trialing',
      input.periodStart,
      periodEnd,
      allowance.start,
      allowance.end,
      input.provider,
      input.providerCustomerId ?? null,
      input.providerSubscriptionId ?? null,
    ],
  );
  const updated = res.rows[0];
  await openBalances(db, updated, snapshot, { regrant: true });
  return updated;
}

/**
 * The paid plan has ended (the provider's final event after a cancellation
 * or failed renewals; P3 calls this). DATA_MODEL: a downgrade lowers the
 * grant for the next period only, so the account becomes Free on the same
 * anniversary and the current period's rows stay. Packs are not touched:
 * reserve decides per unit whether Free can spend them (decision 22).
 */
export async function endSubscription(
  db: Db,
  account: AccountRow,
  snapshot: CatalogSnapshot,
  now: Date,
): Promise<AccountRow> {
  if (account.plan_id === 'free') return account;
  if (!isV2Plan(snapshot, account.plan_id)) {
    // Legacy rows change in P16.
    throw new BillingError('validation_error', { reason: 'legacy_plan', planId: account.plan_id });
  }
  const res = await db.query<AccountRow>(
    `UPDATE billing_accounts
        SET plan_id = 'free', interval = 'monthly', status = 'active', trial_end = NULL,
            period_start = NULL, period_end = NULL, provider = NULL, provider_customer_id = NULL,
            provider_subscription_id = NULL, cancel_at_period_end = false,
            scheduled_plan_id = NULL, scheduled_interval = NULL, updated_at = now()
      WHERE id = $1
      RETURNING ${ACCOUNT_COLUMNS}`,
    [account.id],
  );
  const updated = res.rows[0];
  await advanceAllowancePeriod(db, updated, snapshot, now);
  return updated;
}

/**
 * A verified renewal moved the paid period forward. A scheduled downgrade
 * or interval change takes effect here, so it lowers the grant for the new
 * period only (DATA_MODEL). The new month opens when it is due. A legacy
 * row only gets its dates moved (its allowance is P16). Returns false when
 * the period is not newer than the one on the row.
 */
export async function renewPaidPeriod(
  db: Db,
  account: AccountRow,
  period: { start: Date; end: Date },
  snapshot: CatalogSnapshot,
  now: Date,
): Promise<boolean> {
  if (account.period_end !== null && period.end <= account.period_end) return false;
  const planId = account.scheduled_plan_id ?? account.plan_id;
  const interval = account.scheduled_interval ?? account.interval;
  await db.query(
    `UPDATE billing_accounts
        SET period_start = $2, period_end = $3, plan_id = $4, interval = $5,
            scheduled_plan_id = NULL, scheduled_interval = NULL, updated_at = now()
      WHERE id = $1`,
    [account.id, period.start, period.end, planId, interval],
  );
  Object.assign(account, {
    period_start: period.start,
    period_end: period.end,
    plan_id: planId,
    interval,
    scheduled_plan_id: null,
    scheduled_interval: null,
  });
  if (isV2Plan(snapshot, account.plan_id)) await advanceAllowancePeriod(db, account, snapshot, now);
  return true;
}

/**
 * A move to a lower plan, or to another interval, waits for the end of the
 * paid period. Scheduling the current plan and interval clears the schedule
 * (the person changed their mind before the period ended).
 */
export async function scheduleChange(
  db: Db,
  account: AccountRow,
  planId: PlanId,
  interval: BillingInterval,
): Promise<void> {
  const same = planId === account.plan_id && interval === account.interval;
  await db.query(
    `UPDATE billing_accounts SET scheduled_plan_id = $2, scheduled_interval = $3, updated_at = now() WHERE id = $1`,
    [account.id, same ? null : planId, same ? null : interval],
  );
  account.scheduled_plan_id = same ? null : planId;
  account.scheduled_interval = same ? null : interval;
}

/** Status, cancel flag, and trial end as the provider reports them. */
export async function updateProviderState(
  db: Db,
  account: AccountRow,
  state: {
    status: AccountStatus;
    cancelAtPeriodEnd: boolean;
    trialEnd: Date | null;
    customerId: string | null;
    stateAt: Date;
  },
): Promise<void> {
  const res = await db.query<AccountRow>(
    `UPDATE billing_accounts
        SET status = $2, cancel_at_period_end = $3, trial_end = $4,
            provider_customer_id = COALESCE($5, provider_customer_id),
            provider_state_at = GREATEST(provider_state_at, $6), updated_at = now()
      WHERE id = $1
      RETURNING ${ACCOUNT_COLUMNS}`,
    [account.id, state.status, state.cancelAtPeriodEnd, state.trialEnd, state.customerId, state.stateAt],
  );
  Object.assign(account, res.rows[0]);
}

/** Read by provider subscription id; null when no row has it. */
export async function findAccountBySubscription(
  db: Db,
  provider: PurchaseChannel,
  subscriptionId: string,
): Promise<string | null> {
  const res = await db.query<{ id: string }>(
    `SELECT id FROM billing_accounts WHERE provider = $1 AND provider_subscription_id = $2`,
    [provider, subscriptionId],
  );
  return res.rows[0]?.id ?? null;
}

/**
 * Mid-period upgrade after a verified provider event (section 11 and the
 * DATA_MODEL walkthrough). Adds the allowance difference to this period's
 * balances. Used units stay used. The allowance period and the catalog
 * version do not change. Packs are not touched. A second upgrade adds only
 * the next difference, because the delta is from the plan on the row.
 */
export async function upgradePlan(
  db: Db,
  account: AccountRow,
  toPlan: PlanId,
  snapshot: CatalogSnapshot,
): Promise<Array<{ unit: string; delta: number }>> {
  const fromPlan = v2PlanOf(snapshot, account);
  if (!isV2Plan(snapshot, toPlan) || planRank(snapshot, toPlan) <= planRank(snapshot, fromPlan)) {
    throw new BillingError('validation_error', { reason: 'not_an_upgrade', fromPlan, toPlan });
  }
  if (fromPlan === 'free') {
    throw new BillingError('validation_error', { reason: 'free_starts_a_subscription', toPlan });
  }

  const deltas = allowanceDeltas(snapshot, fromPlan, toPlan);
  for (const { unit, delta } of deltas) {
    const updated = await db.query(
      `UPDATE usage_balances
          SET included_granted = included_granted + $4,
              included_remaining = included_remaining + $4,
              updated_at = now()
        WHERE billing_account_id = $1 AND unit = $2 AND allowance_period_start = $3
          AND candidate_auth_user_id IS NULL`,
      [account.id, unit, account.allowance_period_start, delta],
    );
    if (updated.rowCount === 0) {
      // The old plan did not include this unit, so nothing was granted or used yet.
      await db.query(
        `INSERT INTO usage_balances
           (billing_account_id, workspace_id, unit, allowance_period_start, allowance_period_end,
            included_granted, included_remaining)
         VALUES ($1, $2, $3, $4, $5, $6, $6)`,
        [account.id, account.workspace_id, unit, account.allowance_period_start, account.allowance_period_end, delta],
      );
    }
  }
  await db.query(
    `UPDATE billing_accounts
        SET plan_id = $2, scheduled_plan_id = NULL, scheduled_interval = NULL, updated_at = now()
      WHERE id = $1`,
    [account.id, toPlan],
  );
  account.plan_id = toPlan;
  account.scheduled_plan_id = null;
  account.scheduled_interval = null;
  return deltas;
}
