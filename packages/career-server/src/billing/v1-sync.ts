import type { PlanId } from '@flacroncv/career-shared';
import type { V1BillingFacts, V1PackPurchase } from '../integration/v1-plan-bridge';
import { lockAccount, openBalances } from './accounts';
import type { AccountRow } from './accounts';
import { applyCapacityExtras, capacityExtra, capacityExtrasFor } from './capacity';
import type { CapacityGrant } from './capacity';
import { CatalogStore, includedUnitsFor, isV2Plan, planRank } from './catalog';
import type { CatalogSnapshot } from './catalog';
import type { Db } from './db';
import { isBillingError } from './errors';
import { grantPaidPack, recordAdjustment, revokePaidPack } from './pack-purchases';
import { periodContaining } from './periods';

/** Spec section 11: excess storage after a downgrade or cancellation is kept this long before any deletion. */
export const STORAGE_GRACE_DAYS = 30;
const DAY_MS = 24 * 60 * 60 * 1000;

export interface V1SyncInput {
  careerPlan: PlanId;
  v1Plan: string;
  billing: V1BillingFacts | null;
  packPurchases: readonly V1PackPurchase[];
  /** Live capacity add-ons only (`liveCapacity`). */
  capacity: readonly CapacityGrant[];
}

export interface V1SyncResult {
  changed: boolean;
  renewed: boolean;
  /** A lower paid plan waiting for the allowance renewal. */
  scheduledPlan: PlanId | null;
}

/**
 * Brings one career billing account in line with V1 (spec section 11),
 * under the account row lock so concurrent requests serialise. Idempotent:
 * a second call with the same input changes nothing.
 *
 * - Renewal: the allowance renews each anniversary month while V1 maps a
 *   plan. Paid plans renew on the V1 billing anniversary (the subscription
 *   period start), Free on the V1 account anniversary. An annual plan opens
 *   one month at a time, never twelve.
 * - Upgrade (or Free to paid): applies now. A paid-to-paid upgrade keeps the
 *   anchor and adds the allowance difference without resetting used units;
 *   a second upgrade adds only the next difference.
 * - Downgrade between paid plans: takes effect at the allowance renewal
 *   (`scheduled_plan_id`); until then the current allowance stays. V1 itself
 *   moves the price only at the period end, so normally the downgrade arrives
 *   with the renewal and applies at once (`downgradeArrivedWithRenewal`).
 * - Paid to Free (cancellation ended, refund, lapse): applies now, as V1
 *   only reports Free once paid access has ended. The new Free grant is
 *   reduced by the units already used in the period, so unused paid units
 *   are revoked and used ones stay in the ledger. Existing items stay
 *   readable; excess storage gets a 30-day grace (`storage_grace_until`).
 * - Packs and capacity add-ons follow V1's verified Stripe state.
 */
/**
 * V1 schedules a downgrade for the end of the paid period (Stripe subscription
 * schedule), so the lower price arrives together with the new billing period.
 * That downgrade is due now, not at the renewal after: when this sync just
 * opened the period, or the V1 paid period that started the current allowance
 * period began less than a day ago (the career side may have renewed on the
 * old plan a moment before V1's webhook landed).
 */
const RENEWAL_DOWNGRADE_WINDOW_MS = 24 * 60 * 60 * 1000;
function downgradeArrivedWithRenewal(
  account: { allowance_period_start: Date },
  billing: V1SyncInput['billing'],
  renewed: boolean,
  now: Date,
): boolean {
  if (renewed) return true;
  const periodStart = billing?.periodStart ?? null;
  if (!periodStart) return false;
  const start = account.allowance_period_start.getTime();
  return periodStart.getTime() === start && now.getTime() - start < RENEWAL_DOWNGRADE_WINDOW_MS;
}

export async function syncV1Plan(
  db: Db,
  billingAccountId: string,
  input: V1SyncInput,
  catalogVersion: string,
  now: Date,
  catalogs: CatalogStore = new CatalogStore(),
): Promise<V1SyncResult> {
  const account = await lockAccount(db, billingAccountId);
  const snapshot = await catalogs.get(db, account.catalog_version || catalogVersion);
  const renewed = await renewAllowance(db, account, snapshot, now);
  const target = input.careerPlan;
  let changed = false;

  if (account.plan_id !== target) {
    const from = account.plan_id;
    const scheduleInstead =
      isV2Plan(snapshot, from) &&
      from !== 'free' &&
      target !== 'free' &&
      planRank(snapshot, target) < planRank(snapshot, from) &&
      now < account.allowance_period_end &&
      !downgradeArrivedWithRenewal(account, input.billing, renewed, now);
    if (scheduleInstead) {
      if (account.scheduled_plan_id !== target) {
        await db.query(
          `UPDATE billing_accounts SET scheduled_plan_id = $2, scheduled_interval = 'monthly', updated_at = now() WHERE id = $1`,
          [account.id, target],
        );
        account.scheduled_plan_id = target;
        account.scheduled_interval = 'monthly';
        await recordAdjustment(db, account.id, {
          kind: 'downgrade_scheduled',
          reason: 'v1_plan_changed',
          detail: { from, to: target, effectiveAt: account.allowance_period_end.toISOString() },
        });
      }
    } else {
      await changePlan(db, account, snapshot, target, input.billing, now);
      changed = true;
    }
  } else if (account.scheduled_plan_id !== null) {
    // V1 is back on the current plan before the renewal: the downgrade is off.
    await db.query(
      `UPDATE billing_accounts SET scheduled_plan_id = NULL, scheduled_interval = NULL, updated_at = now() WHERE id = $1`,
      [account.id],
    );
    account.scheduled_plan_id = null;
    account.scheduled_interval = null;
  }

  if (renewed && !changed) await openBalances(db, account, snapshot);

  await syncPacks(db, account, snapshot, input.packPurchases, now);
  const capacityChanges = await applyCapacityExtras(
    db,
    account,
    isV2Plan(snapshot, account.plan_id) ? capacityExtrasFor(snapshot, account.plan_id, input.capacity) : {},
  );
  for (const change of capacityChanges) {
    await recordAdjustment(db, account.id, {
      kind: 'capacity_changed',
      quantity: change.to - change.from,
      detail: { field: change.field, from: change.from, to: change.to },
    });
  }
  if (capacityChanges.some((c) => c.field === 'storageBytes' && c.to < c.from)) {
    await startStorageGraceIfOver(db, account, snapshot, now);
  }

  const trialing = input.billing?.status === 'trialing' && account.plan_id !== 'free' && input.billing.periodEnd;
  const paidEnd = input.billing?.periodEnd ?? null;
  await db.query(
    `UPDATE billing_accounts
        SET plan_source = 'v1_mapping', v1_plan = $2, v1_plan_synced_at = $3,
            status = CASE WHEN $4::timestamptz IS NOT NULL THEN 'trialing' ELSE 'active' END,
            trial_end = $4::timestamptz,
            period_start = CASE WHEN plan_id = 'free' THEN NULL ELSE allowance_period_start END,
            period_end = CASE
              WHEN plan_id = 'free' THEN NULL
              WHEN $5::timestamptz IS NOT NULL AND $5::timestamptz > allowance_period_start THEN $5::timestamptz
              ELSE allowance_period_end END
      WHERE id = $1`,
    [account.id, input.v1Plan, now, trialing ? input.billing?.periodEnd : null, paidEnd],
  );
  return { changed, renewed, scheduledPlan: account.scheduled_plan_id };
}

/**
 * Moves the allowance period to the anniversary month containing `now`
 * when it has ended. A downgrade scheduled for this renewal applies here, so
 * the lower grant starts with the new month. Returns true when it moved.
 */
async function renewAllowance(db: Db, account: AccountRow, snapshot: CatalogSnapshot, now: Date): Promise<boolean> {
  if (now < account.allowance_period_end) return false;
  const period = periodContaining(account.allowance_anchor, now);
  await db.query(
    `UPDATE billing_accounts SET allowance_period_start = $2, allowance_period_end = $3, updated_at = now() WHERE id = $1`,
    [account.id, period.start, period.end],
  );
  account.allowance_period_start = period.start;
  account.allowance_period_end = period.end;
  const scheduled = account.scheduled_plan_id;
  if (scheduled && isV2Plan(snapshot, scheduled)) {
    const from = account.plan_id;
    await db.query(
      `UPDATE billing_accounts
          SET plan_id = $2, scheduled_plan_id = NULL, scheduled_interval = NULL, updated_at = now()
        WHERE id = $1`,
      [account.id, scheduled],
    );
    account.plan_id = scheduled;
    account.scheduled_plan_id = null;
    account.scheduled_interval = null;
    await recordAdjustment(db, account.id, { kind: 'downgrade_applied', detail: { from, to: scheduled } });
    await startStorageGraceIfOver(db, account, snapshot, now);
  }
  return true;
}

async function changePlan(
  db: Db,
  account: AccountRow,
  snapshot: CatalogSnapshot,
  target: PlanId,
  billing: V1BillingFacts | null,
  now: Date,
): Promise<void> {
  const from = account.plan_id;
  const fromPaid = from !== 'free';
  const toPaid = target !== 'free';
  const upgrade = !isV2Plan(snapshot, from) || planRank(snapshot, target) > planRank(snapshot, from);

  // Free <-> paid: the anniversary changes (billing vs account anniversary).
  // A paid-to-paid change keeps it, as Stripe keeps the billing anchor.
  if (fromPaid !== toPaid || !isV2Plan(snapshot, from)) {
    const anchor = toPaid ? billing?.periodStart ?? null : billing?.accountCreatedAt ?? null;
    if (anchor && anchor <= now && anchor.getTime() !== account.allowance_anchor.getTime()) {
      const period = periodContaining(anchor, now);
      await db.query(
        `UPDATE billing_accounts
            SET allowance_anchor = $2, allowance_period_start = $3, allowance_period_end = $4, updated_at = now()
          WHERE id = $1`,
        [account.id, anchor, period.start, period.end],
      );
      await recordAdjustment(db, account.id, {
        kind: 'period_reanchored',
        reason: toPaid ? 'billing_anniversary' : 'account_anniversary',
        detail: { from: account.allowance_anchor.toISOString(), to: anchor.toISOString() },
      });
      account.allowance_anchor = anchor;
      account.allowance_period_start = period.start;
      account.allowance_period_end = period.end;
    }
  }

  const before = await balances(db, account);
  await db.query(
    `UPDATE billing_accounts
        SET plan_id = $2, legacy_plan = NULL, interval = 'monthly', status = 'active', trial_end = NULL,
            provider = NULL, provider_customer_id = NULL, provider_subscription_id = NULL,
            cancel_at_period_end = false, scheduled_plan_id = NULL, scheduled_interval = NULL,
            updated_at = now()
      WHERE id = $1`,
    [account.id, target],
  );
  account.plan_id = target;
  account.legacy_plan = null;
  account.scheduled_plan_id = null;
  account.scheduled_interval = null;
  const kept = includedUnitsFor(snapshot, target).map(([unit]) => unit);
  await db.query(
    `UPDATE usage_balances SET included_remaining = 0, updated_at = now()
      WHERE billing_account_id = $1 AND allowance_period_start = $2
        AND candidate_auth_user_id IS NULL AND NOT (unit = ANY($3::text[]))`,
    [account.id, account.allowance_period_start, kept],
  );
  await openBalances(db, account, snapshot, { regrant: true });
  const after = await balances(db, account);

  for (const [unit, now_] of after) {
    const was = before.get(unit);
    const delta = now_.remaining - (was?.remaining ?? 0);
    if (was && delta === 0 && was.granted === now_.granted) continue;
    await recordAdjustment(db, account.id, {
      kind: upgrade ? 'upgrade_difference' : 'plan_regrant',
      unit,
      quantity: delta,
      reason: `${from}->${target}`,
      detail: { grantedBefore: was?.granted ?? 0, grantedAfter: now_.granted, used: now_.granted - now_.remaining },
    });
  }
  for (const [unit, was] of before) {
    if (!after.has(unit) && was.remaining > 0) {
      await recordAdjustment(db, account.id, { kind: 'plan_regrant', unit, quantity: -was.remaining, reason: `${from}->${target}` });
    }
  }
  if (!upgrade) await startStorageGraceIfOver(db, account, snapshot, now);
}

async function balances(db: Db, account: AccountRow): Promise<Map<string, { granted: number; remaining: number }>> {
  const res = await db.query<{ unit: string; included_granted: number; included_remaining: number }>(
    `SELECT unit, included_granted, included_remaining FROM usage_balances
      WHERE billing_account_id = $1 AND allowance_period_start = $2 AND candidate_auth_user_id IS NULL`,
    [account.id, account.allowance_period_start],
  );
  return new Map(res.rows.map((r) => [r.unit, { granted: r.included_granted, remaining: r.included_remaining }]));
}

/**
 * Section 11: after a cancellation or downgrade, stored files above the new
 * limit are kept for 30 days (export and capacity-reduction period) before
 * anything may be deleted. Sets `storage_grace_until` once; an existing
 * future date is not moved. Uploads above the limit stay refused meanwhile.
 */
export async function startStorageGraceIfOver(db: Db, account: AccountRow, snapshot: CatalogSnapshot, now: Date): Promise<boolean> {
  if (!isV2Plan(snapshot, account.plan_id)) return false;
  const limit = snapshot.allowances[account.plan_id].storageBytes + capacityExtra(account, 'storageBytes');
  const used = await storageUsedBytes(db, account.workspace_id);
  if (used <= limit) return false;
  const until = new Date(now.getTime() + STORAGE_GRACE_DAYS * DAY_MS);
  const res = await db.query(
    `UPDATE billing_accounts SET storage_grace_until = $2, updated_at = now()
      WHERE id = $1 AND (storage_grace_until IS NULL OR storage_grace_until <= $3)`,
    [account.id, until, now],
  );
  if ((res.rowCount ?? 0) === 0) return false;
  await recordAdjustment(db, account.id, {
    kind: 'storage_grace_started',
    detail: { usedBytes: used, limitBytes: limit, graceUntil: until.toISOString() },
  });
  return true;
}

/** Bytes of stored evidence files in the workspace (what `storageBytes` caps). */
export async function storageUsedBytes(db: Db, workspaceId: string): Promise<number> {
  const res = await db.query<{ bytes: string }>(
    `SELECT COALESCE(SUM(attachment_size_bytes), 0)::text AS bytes FROM career_evidence
      WHERE workspace_id = $1 AND attachment_object_key IS NOT NULL`,
    [workspaceId],
  );
  return Number(res.rows[0]?.bytes ?? 0);
}

async function syncPacks(
  db: Db,
  account: AccountRow,
  snapshot: CatalogSnapshot,
  purchases: readonly V1PackPurchase[],
  now: Date,
): Promise<void> {
  for (const purchase of purchases) {
    try {
      if (purchase.status === 'paid') {
        await grantPaidPack(db, account, purchase, snapshot);
      } else {
        // Granted earlier and now refunded or disputed: revoke the unused units.
        // Never granted (refunded before the first sync): there is nothing to revoke.
        await revokePaidPack(db, account, purchase.purchaseRef, purchase.status === 'disputed' ? 'chargeback' : 'refund', now);
      }
    } catch (error) {
      // An add-on this catalog does not sell cannot be granted; V1 refuses to sell it,
      // so this only guards against a hand-edited record. The rest still applies.
      if (!isBillingError(error, 'not_purchasable')) throw error;
    }
  }
}
