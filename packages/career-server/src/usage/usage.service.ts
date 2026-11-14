import type { Pool } from 'pg';
import type { PlanId } from '@flacroncv/career-shared';
import { lockAccount, readAccount } from '../billing/accounts';
import type { AccountRow } from '../billing/accounts';
import type { Clock } from '../billing/billing.service';
import { capacityExtra } from '../billing/capacity';
import { CatalogStore, isUsageUnit, isV2Plan } from '../billing/catalog';
import { withTransaction } from '../billing/db';
import { unitBalance } from '../billing/entitlements';
import { BillingError } from '../billing/errors';
import { packView } from '../billing/packs';
import type { PackRow, PackState } from '../billing/packs';
import { readTopUpSettings, setTopUp, topUpSpentCents } from '../billing/top-up';
import { storageUsedBytes } from '../billing/v1-sync';

/** Who is asking. A `Principal` fits. */
export interface UsageOwner {
  billingAccountId: string;
  workspaceId: string;
}

export interface UnitUsage {
  unit: string;
  /** Included units granted for the current allowance month. */
  granted: number;
  /** Same as `granted`; the name the usage endpoint used before (kept for existing clients). */
  includedGranted: number;
  /** Included units used this month (granted minus remaining included). */
  used: number;
  /** Included units left this month. */
  includedRemaining: number;
  /** Purchased pack units this plan can spend now. */
  packRemaining: number;
  /** Unexpired pack units this plan cannot spend until it includes the unit again. */
  packHeld: number;
  /** What can be spent now: included first, then packs. */
  remaining: number;
  /** Share of the included grant used, 0 to 100, or null when nothing is included. */
  percentUsed: number | null;
}

export interface UsageWarningView {
  id: string;
  unit: string;
  threshold: 80 | 95 | 100;
  createdAt: string;
  seenAt: string | null;
}

export interface UsageSummary {
  planId: string;
  /** A lower plan waiting for the renewal (downgrades take effect at renewal). */
  scheduledPlanId: string | null;
  period: { start: string; end: string };
  /** Next allowance renewal. Included units do not roll over. */
  renewalDate: string;
  /** Paid plans renew on the billing anniversary, Free on the account anniversary. */
  renewalBasis: 'billing_anniversary' | 'account_anniversary';
  units: UnitUsage[];
  packs: Array<{
    id: string;
    addonId: string;
    unit: string;
    purchasedUnits: number;
    remainingUnits: number;
    purchasedAt: string;
    expiresAt: string;
    state: PackState;
    requiredPlan: string | null;
  }>;
  /** Unseen 80 / 95 / 100 percent warnings of the current month. */
  warnings: UsageWarningView[];
  capacityExtras: Partial<Record<string, number>>;
  storage: { usedBytes: number; limitBytes: number | null; excessBytes: number; graceUntil: string | null };
  topUp: { enabled: boolean; spendingCapCents: number | null; consentAt: string | null; spentThisPeriodCents: number; addons: Partial<Record<string, string>> };
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const systemClock: Clock = { now: () => new Date() };

/**
 * The usage page (spec section 11): per-unit granted / used / remaining for
 * the current month, the renewal date, packs with balance and expiry, the
 * 80/95/100 percent warnings, storage grace, and the top-up opt-in. Reads
 * never debit.
 */
export class UsageService {
  private readonly catalogs = new CatalogStore();

  constructor(
    private readonly pool: Pool,
    private readonly clock: Clock = systemClock,
  ) {}

  async summary(owner: UsageOwner): Promise<UsageSummary> {
    const now = this.clock.now();
    const account = await readAccount(this.pool, owner.billingAccountId);
    const snapshot = await this.catalogs.get(this.pool, account.catalog_version);
    const v2 = isV2Plan(snapshot, account.plan_id);

    const units: UnitUsage[] = [];
    for (const unit of Object.keys(snapshot.unitAllowanceField)) {
      if (!isUsageUnit(snapshot, unit) || !v2) continue;
      const b = await unitBalance(this.pool, account, snapshot, unit, now);
      // A month that has ended without a renewal grants nothing until the sync renews it.
      const lapsed = now >= account.allowance_period_end;
      const includedRemaining = lapsed ? 0 : b.includedRemaining;
      const used = Math.max(b.includedGranted - b.includedRemaining, 0);
      units.push({
        unit,
        granted: b.includedGranted,
        includedGranted: b.includedGranted,
        used,
        includedRemaining,
        packRemaining: b.packRemaining,
        packHeld: b.packHeld,
        remaining: includedRemaining + b.packRemaining,
        percentUsed: b.includedGranted > 0 ? Math.min(100, Math.round((used * 100) / b.includedGranted)) : null,
      });
    }

    const packs = await this.pool.query<PackRow>(
      `SELECT id, billing_account_id, addon_id, unit, purchased_units, remaining_units, revoked_units,
              purchased_at, expires_at, status, revoked_at, revoke_reason
         FROM packs WHERE billing_account_id = $1 ORDER BY expires_at, purchased_at, id`,
      [account.id],
    );
    const warnings = await this.pool.query<{ id: string; unit: string; threshold: 80 | 95 | 100; created_at: Date; seen_at: Date | null }>(
      `SELECT id, unit, threshold, created_at, seen_at FROM usage_warnings
        WHERE billing_account_id = $1 AND allowance_period_start = $2 AND seen_at IS NULL
        ORDER BY unit, threshold`,
      [account.id, account.allowance_period_start],
    );
    const grace = await this.pool.query<{ storage_grace_until: Date | null }>(
      `SELECT storage_grace_until FROM billing_accounts WHERE id = $1`,
      [account.id],
    );
    const usedBytes = await storageUsedBytes(this.pool, account.workspace_id);
    const limitBytes = v2 ? snapshot.allowances[account.plan_id as PlanId].storageBytes + capacityExtra(account, 'storageBytes') : null;
    const graceUntil = grace.rows[0]?.storage_grace_until ?? null;
    const topUp = await readTopUpSettings(this.pool, account.id);

    return {
      planId: account.plan_id,
      scheduledPlanId: account.scheduled_plan_id,
      period: { start: account.allowance_period_start.toISOString(), end: account.allowance_period_end.toISOString() },
      renewalDate: account.allowance_period_end.toISOString(),
      renewalBasis: account.plan_id === 'free' ? 'account_anniversary' : 'billing_anniversary',
      units,
      packs: packs.rows.map((pack) => {
        const view = v2 ? packView(pack, account, snapshot, now) : null;
        return {
          id: pack.id,
          addonId: pack.addon_id,
          unit: pack.unit,
          purchasedUnits: pack.purchased_units,
          remainingUnits: pack.remaining_units,
          purchasedAt: pack.purchased_at.toISOString(),
          expiresAt: pack.expires_at.toISOString(),
          state: view?.state ?? 'held',
          requiredPlan: view?.requiredPlan ?? null,
        };
      }),
      warnings: warnings.rows.map((w) => ({
        id: w.id,
        unit: w.unit,
        threshold: w.threshold,
        createdAt: w.created_at.toISOString(),
        seenAt: w.seen_at ? w.seen_at.toISOString() : null,
      })),
      capacityExtras: { ...(account.capacity_extras ?? {}) },
      storage: {
        usedBytes,
        limitBytes,
        excessBytes: limitBytes === null ? 0 : Math.max(usedBytes - limitBytes, 0),
        // Shown only while it matters: a grace date that has passed with nothing in excess is noise.
        graceUntil: graceUntil && (limitBytes === null || usedBytes > limitBytes) ? graceUntil.toISOString() : null,
      },
      topUp: {
        enabled: topUp.enabled,
        spendingCapCents: topUp.spendingCapCents,
        consentAt: topUp.consentAt ? topUp.consentAt.toISOString() : null,
        spentThisPeriodCents: await topUpSpentCents(this.pool, account),
        addons: topUp.addons,
      },
    };
  }

  /** Marks warnings as shown. Without ids, every unseen warning of the current month. Returns how many changed. */
  async markWarningsSeen(owner: UsageOwner, ids?: string[]): Promise<{ marked: number }> {
    if (ids !== undefined && (!Array.isArray(ids) || ids.length > 100 || ids.some((id) => typeof id !== 'string' || !UUID.test(id)))) {
      throw new BillingError('validation_error', { field: 'ids', reason: 'invalid' });
    }
    const account = await readAccount(this.pool, owner.billingAccountId);
    const res = ids
      ? await this.pool.query(
          `UPDATE usage_warnings SET seen_at = $3 WHERE billing_account_id = $1 AND id = ANY($2::uuid[]) AND seen_at IS NULL`,
          [account.id, ids, this.clock.now()],
        )
      : await this.pool.query(
          `UPDATE usage_warnings SET seen_at = $3 WHERE billing_account_id = $1 AND allowance_period_start = $2 AND seen_at IS NULL`,
          [account.id, account.allowance_period_start, this.clock.now()],
        );
    return { marked: res.rowCount ?? 0 };
  }

  /** Opt in or out of automatic top-ups. Off by default; on needs consent and a spending cap. */
  async setTopUp(
    owner: UsageOwner,
    input: { enabled: boolean; consent?: boolean; addons?: Partial<Record<string, string>> },
  ): Promise<UsageSummary['topUp']> {
    if (typeof input.enabled !== 'boolean') throw new BillingError('validation_error', { field: 'enabled', reason: 'invalid' });
    await withTransaction(this.pool, async (db) => {
      const account: AccountRow = await lockAccount(db, owner.billingAccountId);
      const snapshot = await this.catalogs.get(db, account.catalog_version);
      await setTopUp(db, account, snapshot, input, this.clock.now());
    });
    return (await this.summary(owner)).topUp;
  }
}
