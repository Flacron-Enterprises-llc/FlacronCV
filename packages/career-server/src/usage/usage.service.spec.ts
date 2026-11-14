import { randomUUID } from 'crypto';
import { CATALOG_VERSION } from '@flacroncv/career-shared';
import type { PlanId } from '@flacroncv/career-shared';
import { createBillingFixture, BillingFixture } from '../testing';
import { applyMappedPlan } from '../integration/v1-plan-bridge';
import type { V1BillingFacts, V1Plan } from '../integration/v1-plan-bridge';
import { buildCatalogSnapshot } from '../billing/catalog';
import { BillingError } from '../billing/errors';
import { decideTopUp } from '../billing/top-up';
import type { TopUpSettings } from '../billing/top-up';
import { RemoteMeteringService } from '../metering/remote-metering';
import { UsageService } from './usage.service';

async function errorOf(promise: Promise<unknown>): Promise<BillingError> {
  const error = await promise.then(
    () => undefined,
    (e: unknown) => e,
  );
  if (!(error instanceof BillingError)) throw new Error(`expected a BillingError, got ${String(error)}`);
  return error;
}

describe('decideTopUp (pure)', () => {
  const snapshot = buildCatalogSnapshot();
  const on: TopUpSettings = { enabled: true, spendingCapCents: 2000, consentAt: new Date('2026-10-01T00:00:00Z'), addons: {} };

  it('is off by default and needs consent and a cap', () => {
    expect(decideTopUp(snapshot, 'professional', 'document_credit', { ...on, enabled: false }, 0)).toEqual({ eligible: false, reason: 'not_enabled' });
    expect(decideTopUp(snapshot, 'professional', 'document_credit', { ...on, consentAt: null }, 0)).toEqual({ eligible: false, reason: 'no_consent' });
    expect(decideTopUp(snapshot, 'professional', 'document_credit', { ...on, spendingCapCents: null }, 0)).toEqual({ eligible: false, reason: 'no_spending_cap' });
  });

  it('picks the cheapest compatible pack, or the preferred one, within the monthly cap', () => {
    expect(decideTopUp(snapshot, 'starter', 'document_credit', on, 0)).toMatchObject({ eligible: true, addonId: 'document_s', priceCents: 499 });
    expect(decideTopUp(snapshot, 'starter', 'document_credit', { ...on, addons: { document_credit: 'document_m' } }, 0)).toMatchObject({ eligible: true, addonId: 'document_m' });
    expect(decideTopUp(snapshot, 'starter', 'document_credit', on, 1600)).toEqual({ eligible: false, reason: 'spending_cap_reached' });
  });

  it('never tops up Free, a unit the plan lacks, or a pack above the plan', () => {
    expect(decideTopUp(snapshot, 'free', 'document_credit', on, 0)).toEqual({ eligible: false, reason: 'free_plan' });
    expect(decideTopUp(snapshot, 'starter', 'action_pack', on, 0)).toEqual({ eligible: false, reason: 'unit_not_in_plan' });
    expect(decideTopUp(snapshot, 'professional', 'action_pack', on, 0)).toMatchObject({ eligible: true, addonId: 'action_s' });
  });
});

describe('UsageService', () => {
  let f: BillingFixture;
  let usage: UsageService;
  let meter: RemoteMeteringService;

  beforeAll(async () => {
    f = await createBillingFixture('usage_page', '2026-10-05T12:00:00Z');
    usage = new UsageService(f.db.pool, f.clock);
    meter = new RemoteMeteringService(f.db.pool, f.clock);
  });
  afterAll(async () => {
    if (f) await f.drop();
  });

  async function account(plan: PlanId, billing: Partial<V1BillingFacts> = {}) {
    const row = await f.freeAccount({ anchor: '2026-01-10T09:00:00Z' });
    await applyMappedPlan(
      f.db.pool,
      row.id,
      {
        enabled: true,
        v1Plan: plan as V1Plan,
        careerPlan: plan,
        source: 'v1_plan_map',
        billing: {
          accountCreatedAt: new Date('2026-01-10T09:00:00Z'),
          periodStart: plan === 'free' ? null : new Date('2026-10-01T08:00:00Z'),
          periodEnd: plan === 'free' ? null : new Date('2026-11-01T08:00:00Z'),
          status: 'active',
          ...billing,
        },
      },
      CATALOG_VERSION,
      f.clock.now(),
    );
    return { billingAccountId: row.id, workspaceId: row.workspace_id, authUserId: row.auth_user_id as string };
  }

  it('shows granted, used and remaining per unit, the billing-anniversary renewal and packs with expiry', async () => {
    const owner = await account('professional', {
      packPurchases: [
        { purchaseRef: `cs_${randomUUID()}`, addonId: 'analysis_25', purchasedAt: new Date('2026-10-02T00:00:00Z'), amountCents: 699, currency: 'usd', status: 'paid' },
      ],
    });
    await f.spend(owner.billingAccountId, 'document_credit', 12);
    const summary = await usage.summary(owner);
    expect(summary.planId).toBe('professional');
    expect(summary.renewalBasis).toBe('billing_anniversary');
    expect(summary.renewalDate).toBe('2026-11-01T08:00:00.000Z');
    const docs = summary.units.find((u) => u.unit === 'document_credit');
    expect(docs).toEqual({ unit: 'document_credit', granted: 60, includedGranted: 60, used: 12, includedRemaining: 48, packRemaining: 0, packHeld: 0, remaining: 48, percentUsed: 20 });
    const analyses = summary.units.find((u) => u.unit === 'resume_analysis');
    expect(analyses?.remaining).toBe(60 + 25);
    expect(summary.packs).toEqual([
      expect.objectContaining({ addonId: 'analysis_25', remainingUnits: 25, expiresAt: '2027-10-02T00:00:00.000Z', state: 'spendable' }),
    ]);
    expect(summary.topUp).toMatchObject({ enabled: false, spendingCapCents: null, spentThisPeriodCents: 0 });
    expect(summary.storage).toMatchObject({ usedBytes: 0, excessBytes: 0, graceUntil: null });
  });

  it('Free renews on the account anniversary', async () => {
    const owner = await account('free');
    const summary = await usage.summary(owner);
    expect(summary.renewalBasis).toBe('account_anniversary');
    expect(summary.renewalDate).toBe('2026-10-10T09:00:00.000Z');
  });

  it('lists unseen 80/95/100 percent warnings and marks them seen', async () => {
    const owner = await account('starter');
    await f.spend(owner.billingAccountId, 'document_credit', 19);
    let summary = await usage.summary(owner);
    expect(summary.warnings.map((w) => w.threshold)).toEqual([80, 95]);
    const first = summary.warnings[0].id;
    expect(await usage.markWarningsSeen(owner, [first])).toEqual({ marked: 1 });
    summary = await usage.summary(owner);
    expect(summary.warnings.map((w) => w.threshold)).toEqual([95]);
    expect(await usage.markWarningsSeen(owner)).toEqual({ marked: 1 });
    expect((await usage.summary(owner)).warnings).toEqual([]);
    expect((await errorOf(usage.markWarningsSeen(owner, ['not-a-uuid']))).code).toBe('validation_error');
  });

  it('top-ups stay off until the person consents with a spending cap; the meter then offers a compatible pack', async () => {
    const owner = await account('starter');
    expect((await errorOf(usage.setTopUp(owner, { enabled: true, consent: true }))).details).toMatchObject({ field: 'spendingCapCents' });
    await f.db.pool.query(`UPDATE billing_accounts SET spending_cap_cents = 2000 WHERE id = $1`, [owner.billingAccountId]);
    expect((await errorOf(usage.setTopUp(owner, { enabled: true }))).details).toMatchObject({ field: 'consent' });
    expect((await errorOf(usage.setTopUp(owner, { enabled: true, consent: true, addons: { action_pack: 'action_s' } }))).code).toBe('not_purchasable');
    const on = await usage.setTopUp(owner, { enabled: true, consent: true, addons: { document_credit: 'document_m' } });
    expect(on).toMatchObject({ enabled: true, spendingCapCents: 2000, addons: { document_credit: 'document_m' } });
    expect(on.consentAt).toBe('2026-10-05T12:00:00.000Z');

    await f.spend(owner.billingAccountId, 'document_credit', 20);
    const exhausted = await errorOf(meter.reserve(owner, { unit: 'document_credit', operation: 'ai.generate', idempotencyKey: 'topup' }));
    expect(exhausted.code).toBe('quota_exhausted');
    expect(exhausted.details.topUp).toMatchObject({ eligible: true, addonId: 'document_m', priceCents: 1299 });
  });

  it('refuses a preferred pack above the spending cap', async () => {
    const owner = await account('starter');
    await f.db.pool.query(`UPDATE billing_accounts SET spending_cap_cents = 1000 WHERE id = $1`, [owner.billingAccountId]);
    await usage.setTopUp(owner, { enabled: true, consent: true, addons: { document_credit: 'document_m' } });
    await f.spend(owner.billingAccountId, 'document_credit', 20);
    const exhausted = await errorOf(meter.reserve(owner, { unit: 'document_credit', operation: 'ai.generate', idempotencyKey: 'cap' }));
    expect(exhausted.details.topUp).toEqual({ eligible: false, reason: 'spending_cap_reached' });
  });

  it('turning top-ups off clears the consent', async () => {
    const owner = await account('starter');
    await f.db.pool.query(`UPDATE billing_accounts SET spending_cap_cents = 500 WHERE id = $1`, [owner.billingAccountId]);
    await usage.setTopUp(owner, { enabled: true, consent: true });
    const off = await usage.setTopUp(owner, { enabled: false });
    expect(off).toMatchObject({ enabled: false, consentAt: null });
  });
});
