import type { Pool } from 'pg';
import { CATALOG_VERSION, estimate, PLANS } from '@flacroncv/career-shared';
import type { BillingInterval, Estimate, EstimateInput, PlanId, UsageUnit } from '@flacroncv/career-shared';
import { readAccount, v2PlanOf } from './accounts';
import type { Clock } from './billing.service';
import { CatalogStore, isUsageUnit } from './catalog';
import { unitBalance } from './entitlements';
import { BillingError, isBillingError } from './errors';
import { packView } from './packs';
import type { PackRow } from './packs';
import { PaymentsService } from './payments/payments.service';
import type { ProfileOwner } from '../profile/career-profile.service';

/** A quote is usable for one day. The catalog version is checked again at checkout. */
export const ESTIMATE_TTL_MS = 24 * 60 * 60 * 1000;
const CAP_LIMIT_CENTS = 10_000_000;
const QUANTITY_CAP = 10_000;

/**
 * V1 list prices from docs/V1_REFERENCE.md. Used only when a legacy row
 * has no recorded purchase amount. Not a V2 catalog price.
 */
const V1_PRICE_CENTS: Record<string, { monthly: number; annual: number }> = {
  pro: { monthly: 2999, annual: 29999 },
  enterprise: { monthly: 9999, annual: 99999 },
  career_accelerator: { monthly: 4999, annual: 59988 },
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const systemClock: Clock = { now: () => new Date() };

export interface BillingView {
  planId: string;
  legacyPlan: string | null;
  interval: BillingInterval;
  status: string;
  periodEnd: string | null;
  renewalDate: string;
  provider: string | null;
  cancelAtPeriodEnd: boolean;
  storageGraceUntil: string | null;
  trialEnd: string | null;
  price: { amountCents: number; currency: string } | null;
  spendingCapCents: number | null;
  autoTopup: boolean;
}

export interface BillingUsage {
  renewalDate: string;
  units: Array<{ unit: string; includedGranted: number; includedRemaining: number; packRemaining: number; packHeld: number }>;
  packs: Array<{
    id: string;
    addonId: string;
    unit: string;
    remainingUnits: number;
    purchasedUnits: number;
    expiresAt: string;
    state: string;
    requiredPlan: string | null;
  }>;
}

interface EstimateRow {
  id: string;
  catalog_version: string;
  plan_id: string;
  interval: string;
  result: unknown;
  expires_at: Date;
}

/**
 * The billing page and the saved quote. Checkout uses the same `estimate()`
 * as the pricing page. A stale quote is refused. This service does not
 * charge; the gateway does, and the unconfigured gateway refuses.
 */
export class BillingPageService {
  private readonly catalogs = new CatalogStore();

  constructor(
    private readonly pool: Pool,
    private readonly payments: PaymentsService,
    private readonly clock: Clock = systemClock,
  ) {}

  async catalog(): Promise<unknown> {
    return this.catalogs.get(this.pool, CATALOG_VERSION);
  }

  async billing(owner: ProfileOwner): Promise<BillingView> {
    const account = await readAccount(this.pool, owner.billingAccountId);
    const extra = await this.pool.query<{ spending_cap_cents: number | null; auto_topup: boolean; storage_grace_until: Date | null }>(
      `SELECT spending_cap_cents, auto_topup, storage_grace_until FROM billing_accounts WHERE id = $1`,
      [account.id],
    );
    const purchase = await this.pool.query<{ amount_cents: number | null; currency: string | null }>(
      `SELECT amount_cents, currency FROM purchases
        WHERE billing_account_id = $1 AND kind = 'subscription'
        ORDER BY purchased_at DESC, id DESC LIMIT 1`,
      [account.id],
    );
    const bought = purchase.rows[0];
    return {
      planId: account.plan_id,
      legacyPlan: account.legacy_plan,
      interval: account.interval,
      status: account.status,
      periodEnd: account.period_end ? account.period_end.toISOString() : null,
      renewalDate: account.allowance_period_end.toISOString(),
      provider: account.provider,
      cancelAtPeriodEnd: account.cancel_at_period_end,
      storageGraceUntil: extra.rows[0]?.storage_grace_until ? extra.rows[0].storage_grace_until.toISOString() : null,
      trialEnd: account.trial_end ? account.trial_end.toISOString() : null,
      price: priceOf(account.plan_id, account.legacy_plan, account.interval, bought?.amount_cents ?? null, bought?.currency ?? null),
      spendingCapCents: extra.rows[0]?.spending_cap_cents ?? null,
      autoTopup: extra.rows[0]?.auto_topup ?? false,
    };
  }

  async usage(owner: ProfileOwner): Promise<BillingUsage> {
    const account = await readAccount(this.pool, owner.billingAccountId);
    const snapshot = await this.catalogs.get(this.pool, account.catalog_version);
    const packs = await this.pool.query<PackRow>(
      `SELECT id, billing_account_id, addon_id, unit, purchased_units, remaining_units, revoked_units,
              purchased_at, expires_at, status, revoked_at, revoke_reason
         FROM packs WHERE billing_account_id = $1 ORDER BY expires_at, id`,
      [account.id],
    );
    let legacy = false;
    try {
      v2PlanOf(snapshot, account);
    } catch (error) {
      if (!isBillingError(error, 'not_found')) throw error;
      legacy = true;
    }
    const units: BillingUsage['units'] = [];
    for (const unit of Object.keys(snapshot.unitAllowanceField)) {
      if (!isUsageUnit(snapshot, unit)) continue;
      if (legacy) {
        units.push({ unit, includedGranted: 0, includedRemaining: 0, packRemaining: 0, packHeld: heldUnits(packs.rows, unit) });
        continue;
      }
      const balance = await unitBalance(this.pool, account, snapshot, unit, this.clock.now());
      units.push({
        unit,
        includedGranted: balance.includedGranted,
        includedRemaining: balance.includedRemaining,
        packRemaining: balance.packRemaining,
        packHeld: balance.packHeld,
      });
    }
    return {
      renewalDate: account.allowance_period_end.toISOString(),
      units,
      packs: packs.rows.map((pack) => {
        if (legacy) {
          const expired = pack.status === 'expired' || pack.expires_at <= this.clock.now();
          const state = pack.status === 'revoked' ? 'revoked' : expired ? 'expired' : pack.remaining_units === 0 ? 'used_up' : 'held';
          return packJson(pack, state, null);
        }
        const view = packView(pack, account, snapshot, this.clock.now());
        return packJson(pack, view.state, view.requiredPlan);
      }),
    };
  }

  async setSpendingCap(owner: ProfileOwner, spendingCapCents: number | null | undefined): Promise<BillingView> {
    if (spendingCapCents === undefined) throw new BillingError('validation_error', { field: 'spendingCapCents', reason: 'invalid' });
    if (spendingCapCents !== null && (!Number.isInteger(spendingCapCents) || spendingCapCents < 0 || spendingCapCents > CAP_LIMIT_CENTS)) {
      throw new BillingError('validation_error', { field: 'spendingCapCents', reason: 'invalid', limit: CAP_LIMIT_CENTS });
    }
    await this.pool.query(
      `UPDATE billing_accounts
          SET spending_cap_cents = $2::integer,
              auto_topup = CASE WHEN $2::integer IS NULL THEN false ELSE auto_topup END
        WHERE id = $1`,
      [owner.billingAccountId, spendingCapCents],
    );
    return this.billing(owner);
  }

  async createEstimate(owner: ProfileOwner, input: EstimateInput): Promise<Estimate & { id: string; expiresAt: string }> {
    if (!isPlanId(input.planId)) throw new BillingError('validation_error', { field: 'planId', reason: 'invalid' });
    if (input.interval !== 'monthly' && input.interval !== 'annual') {
      throw new BillingError('validation_error', { field: 'interval', reason: 'invalid' });
    }
    checkQuantities(input);
    const result = estimate(input);
    const expires = new Date(this.clock.now().getTime() + ESTIMATE_TTL_MS);
    const inserted = await this.pool.query<{ id: string }>(
      `INSERT INTO estimates (billing_account_id, catalog_version, plan_id, interval, body, result, expires_at)
       VALUES ($1, $2, $3, $4, $5::jsonb, $6::jsonb, $7) RETURNING id`,
      [owner.billingAccountId, result.catalogVersion, result.planId, result.interval, JSON.stringify(input), JSON.stringify(result), expires],
    );
    return { ...result, id: inserted.rows[0].id, expiresAt: expires.toISOString() };
  }

  async checkout(
    owner: ProfileOwner,
    input: { planId?: string; interval?: string; provider?: string; estimateId?: string },
    idempotencyKey: string | undefined,
  ) {
    if (!input.estimateId || !UUID.test(input.estimateId)) {
      throw new BillingError('validation_error', { field: 'estimateId', reason: 'invalid' });
    }
    if (!input.planId || !isPlanId(input.planId) || input.planId === 'free') {
      throw new BillingError('validation_error', { field: 'planId', reason: 'invalid' });
    }
    if (input.interval !== 'monthly' && input.interval !== 'annual') {
      throw new BillingError('validation_error', { field: 'interval', reason: 'invalid' });
    }
    if (input.provider !== 'stripe' && input.provider !== 'apple' && input.provider !== 'google') {
      throw new BillingError('validation_error', { field: 'provider', reason: 'invalid' });
    }
    const key = idempotencyKey?.trim() ?? '';
    if (key.length === 0 || key.length > 255) throw new BillingError('validation_error', { field: 'Idempotency-Key' });
    const rows = await this.pool.query<EstimateRow>(
      `SELECT id, catalog_version, plan_id, interval, result, expires_at
         FROM estimates WHERE id = $1 AND billing_account_id = $2`,
      [input.estimateId, owner.billingAccountId],
    );
    const row = rows.rows[0];
    if (!row) throw new BillingError('not_found');
    const result = isRecord(row.result) ? row.result : {};
    const oneTime = typeof result.oneTimeCents === 'number' ? result.oneTimeCents : 0;
    const lineCount = Array.isArray(result.lines) ? result.lines.length : 0;
    if (row.expires_at <= this.clock.now() || row.catalog_version !== CATALOG_VERSION || row.plan_id !== input.planId || row.interval !== input.interval) {
      throw new BillingError('stale_estimate');
    }
    if (oneTime !== 0 || lineCount !== 1) {
      throw new BillingError('validation_error', { field: 'estimateId', reason: 'extras_not_in_checkout' });
    }
    return this.payments.createCheckout(owner.billingAccountId, {
      planId: input.planId,
      interval: input.interval,
      provider: input.provider,
      idempotencyKey: key,
    });
  }

  async portal(owner: ProfileOwner, provider: string | undefined): Promise<{ url: string }> {
    if (provider !== 'stripe') throw new BillingError('validation_error', { field: 'provider', reason: 'invalid' });
    const account = await readAccount(this.pool, owner.billingAccountId);
    if (account.provider !== 'stripe') throw new BillingError('validation_error', { field: 'provider', reason: 'not_stripe' });
    return this.payments.portal(account.id, account.provider_customer_id);
  }
}

function priceOf(
  planId: string,
  legacyPlan: string | null,
  interval: BillingInterval,
  amountCents: number | null,
  currency: string | null,
): { amountCents: number; currency: string } | null {
  if (amountCents !== null && currency) return { amountCents, currency };
  if (legacyPlan && V1_PRICE_CENTS[legacyPlan]) {
    return { amountCents: V1_PRICE_CENTS[legacyPlan][interval], currency: 'USD' };
  }
  if (isPlanId(planId)) return { amountCents: interval === 'annual' ? PLANS[planId].annualCents : PLANS[planId].monthlyCents, currency: 'USD' };
  return null;
}

function heldUnits(packs: PackRow[], unit: string): number {
  return packs
    .filter((pack) => pack.unit === unit && pack.status === 'active' && pack.remaining_units > 0)
    .reduce((sum, pack) => sum + pack.remaining_units, 0);
}

function packJson(pack: PackRow, state: string, requiredPlan: string | null): BillingUsage['packs'][number] {
  return {
    id: pack.id,
    addonId: pack.addon_id,
    unit: pack.unit,
    remainingUnits: pack.remaining_units,
    purchasedUnits: pack.purchased_units,
    expiresAt: pack.expires_at.toISOString(),
    state,
    requiredPlan,
  };
}

function checkQuantities(input: EstimateInput): void {
  for (const row of input.desired ?? []) {
    if (!isKnownUnit(row.unit) || !Number.isInteger(row.units) || row.units < 0 || row.units > QUANTITY_CAP) {
      throw new BillingError('validation_error', { field: 'desired', reason: 'invalid', limit: QUANTITY_CAP });
    }
  }
  for (const row of [...(input.recurring ?? []), ...(input.oneTime ?? [])]) {
    if (typeof row.addonId !== 'string' || !Number.isInteger(row.quantity) || row.quantity < 0 || row.quantity > QUANTITY_CAP) {
      throw new BillingError('validation_error', { field: 'quantity', reason: 'invalid', limit: QUANTITY_CAP });
    }
  }
}

function isKnownUnit(value: string): value is UsageUnit {
  return (
    value === 'document_credit' ||
    value === 'resume_analysis' ||
    value === 'action_pack' ||
    value === 'alert_item' ||
    value === 'text_interview' ||
    value === 'voice_minute' ||
    value === 'skill_report' ||
    value === 'scenario_report' ||
    value === 'coaching_response' ||
    value === 'assisted_form' ||
    value === 'map_session' ||
    value === 'messaging_balance'
  );
}

function isPlanId(value: string): value is PlanId {
  return value === 'free' || value === 'starter' || value === 'professional' || value === 'career_pro' || value === 'business';
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
