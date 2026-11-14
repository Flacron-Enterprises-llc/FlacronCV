/**
 * Spec section 11 lifecycle through the V1 bridge (five-plan model): V1's
 * plan and verified Stripe facts drive the career account.
 */
import { randomUUID } from 'crypto';
import { CATALOG_VERSION } from '@flacroncv/career-shared';
import type { PlanId } from '@flacroncv/career-shared';
import { createBillingFixture, BillingFixture } from '../testing';
import { applyMappedPlan, DEFAULT_CAREER_PLAN_MAP, parseCareerPlanMap } from '../integration/v1-plan-bridge';
import type { CareerAccess, V1BillingFacts, V1Plan } from '../integration/v1-plan-bridge';
import { checkCapacity, capacityLimit } from '../metering/access';
import { readAccount } from './accounts';
import type { AccountRow } from './accounts';
import { buildCatalogSnapshot } from './catalog';
import { BillingError } from './errors';

const CREATED = '2026-01-10T09:00:00Z';

function access(careerPlan: PlanId, billing: V1BillingFacts | null = null): Extract<CareerAccess, { enabled: true }> {
  return { enabled: true, v1Plan: careerPlan as V1Plan, careerPlan, source: 'v1_plan_map', billing };
}

describe('default V1 to career plan map', () => {
  it('maps the five plans 1:1 and the legacy plans to the closest career plan', () => {
    expect(parseCareerPlanMap('')).toEqual(DEFAULT_CAREER_PLAN_MAP);
    expect(parseCareerPlanMap(undefined)).toEqual({
      free: 'free',
      starter: 'starter',
      professional: 'professional',
      career_pro: 'career_pro',
      business: 'business',
      pro: 'starter',
      career_accelerator: 'professional',
      enterprise: 'career_pro',
    });
  });

  it('still lets CAREER_PLAN_MAP override single entries, including none', () => {
    const map = parseCareerPlanMap('free:none,enterprise:business');
    expect(map.free).toBeNull();
    expect(map.enterprise).toBe('business');
    expect(map.professional).toBe('professional');
  });
});

describe('syncing a career account from V1', () => {
  let f: BillingFixture;

  beforeAll(async () => {
    f = await createBillingFixture('v1_sync', '2026-10-05T12:00:00Z');
  });
  afterAll(async () => {
    if (f) await f.drop();
  });
  afterEach(() => f.clock.set('2026-10-05T12:00:00Z'));

  async function freshAccount(): Promise<AccountRow> {
    return f.freeAccount({ anchor: CREATED });
  }

  async function sync(accountId: string, plan: PlanId, billing: V1BillingFacts | null = null) {
    return applyMappedPlan(f.db.pool, accountId, access(plan, billing), CATALOG_VERSION, f.clock.now());
  }

  async function balance(accountId: string, unit = 'document_credit') {
    const account = await readAccount(f.db.pool, accountId);
    const res = await f.db.pool.query<{ included_granted: number; included_remaining: number }>(
      `SELECT included_granted, included_remaining FROM usage_balances
        WHERE billing_account_id = $1 AND unit = $2 AND allowance_period_start = $3 AND candidate_auth_user_id IS NULL`,
      [accountId, unit, account.allowance_period_start],
    );
    return { granted: res.rows[0]?.included_granted ?? 0, remaining: res.rows[0]?.included_remaining ?? 0, account };
  }

  async function adjustments(accountId: string, kind?: string) {
    const res = await f.db.pool.query<{ kind: string; unit: string | null; quantity: number | null }>(
      `SELECT kind, unit, quantity FROM billing_adjustments WHERE billing_account_id = $1 ${kind ? 'AND kind = $2' : ''} ORDER BY created_at, id`,
      kind ? [accountId, kind] : [accountId],
    );
    return res.rows;
  }

  const paidFacts = (start: string, end: string, extra: Partial<V1BillingFacts> = {}): V1BillingFacts => ({
    accountCreatedAt: new Date(CREATED),
    periodStart: new Date(start),
    periodEnd: new Date(end),
    status: 'active',
    ...extra,
  });

  it('an annual purchase opens one month of credits, anchored to the V1 billing anniversary, and renews monthly', async () => {
    const account = await freshAccount();
    await sync(account.id, 'professional', paidFacts('2026-10-01T08:00:00Z', '2027-10-01T08:00:00Z'));
    let b = await balance(account.id);
    expect(b.granted).toBe(60);
    expect(b.remaining).toBe(60);
    expect(b.account.allowance_anchor.toISOString()).toBe('2026-10-01T08:00:00.000Z');
    expect(b.account.allowance_period_end.toISOString()).toBe('2026-11-01T08:00:00.000Z');
    // The paid period is the annual one; the allowance is still monthly.
    expect(b.account.period_end?.toISOString()).toBe('2027-10-01T08:00:00.000Z');

    await f.spend(account.id, 'document_credit', 7);
    f.clock.set('2026-11-02T00:00:00Z');
    await sync(account.id, 'professional', paidFacts('2026-10-01T08:00:00Z', '2027-10-01T08:00:00Z'));
    b = await balance(account.id);
    expect(b.account.allowance_period_start.toISOString()).toBe('2026-11-01T08:00:00.000Z');
    expect(b.granted).toBe(60);
    expect(b.remaining).toBe(60); // unused credits do not roll over, used ones do not carry
  });

  it('upgrades mid-cycle without resetting used units, and a second upgrade adds only the next difference', async () => {
    const account = await freshAccount();
    const facts = paidFacts('2026-10-01T08:00:00Z', '2026-11-01T08:00:00Z');
    await sync(account.id, 'starter', facts);
    await f.spend(account.id, 'document_credit', 5);
    expect((await balance(account.id)).remaining).toBe(15);

    await sync(account.id, 'professional', facts);
    let b = await balance(account.id);
    expect(b.granted).toBe(60);
    expect(b.remaining).toBe(55);
    expect(b.account.allowance_anchor.toISOString()).toBe('2026-10-01T08:00:00.000Z');

    await f.spend(account.id, 'document_credit', 5);
    await sync(account.id, 'career_pro', facts);
    b = await balance(account.id);
    expect(b.granted).toBe(150);
    expect(b.remaining).toBe(140); // 150 - 10 used, not a fresh 150

    // Syncing again changes nothing.
    await sync(account.id, 'career_pro', facts);
    expect((await balance(account.id)).remaining).toBe(140);
    const ups = await adjustments(account.id, 'upgrade_difference');
    expect(ups.filter((a) => a.unit === 'document_credit').map((a) => a.quantity)).toEqual([20, 40, 90]);
  });

  it('a downgrade between paid plans waits for the renewal; existing items keep counting but stay readable', async () => {
    const account = await freshAccount();
    const facts = paidFacts('2026-10-01T08:00:00Z', '2026-11-01T08:00:00Z');
    await sync(account.id, 'career_pro', facts);
    await f.spend(account.id, 'document_credit', 10);

    await sync(account.id, 'starter', facts);
    let b = await balance(account.id);
    expect(b.account.plan_id).toBe('career_pro');
    expect(b.account.scheduled_plan_id).toBe('starter');
    expect(b.remaining).toBe(140);
    expect((await adjustments(account.id, 'downgrade_scheduled')).length).toBe(1);
    // A repeated sync does not schedule twice.
    await sync(account.id, 'starter', facts);
    expect((await adjustments(account.id, 'downgrade_scheduled')).length).toBe(1);

    f.clock.set('2026-11-01T09:00:00Z');
    await sync(account.id, 'starter', paidFacts('2026-11-01T08:00:00Z', '2026-12-01T08:00:00Z'));
    b = await balance(account.id);
    expect(b.account.plan_id).toBe('starter');
    expect(b.account.scheduled_plan_id).toBeNull();
    expect(b.granted).toBe(20);
    expect(b.remaining).toBe(20);

    // 50 tracked applications exceed nothing on Starter (100), but 120 do:
    // only new creation is refused; nothing is deleted.
    const snapshot = buildCatalogSnapshot();
    expect(() => checkCapacity(snapshot, b.account, 'trackedApplications', 120)).toThrow(BillingError);
    expect(() => checkCapacity(snapshot, b.account, 'trackedApplications', 50)).not.toThrow();
  });

  it('a downgrade V1 applies at the period end lands with the renewal, not one month later', async () => {
    const account = await freshAccount();
    await sync(account.id, 'career_pro', paidFacts('2026-10-01T08:00:00Z', '2026-11-01T08:00:00Z'));
    await f.spend(account.id, 'document_credit', 10);
    // Stripe rolled the period; a request renewed the allowance on the old plan
    // a moment before V1's webhook reported the scheduled lower price.
    const next = paidFacts('2026-11-01T08:00:00Z', '2026-12-01T08:00:00Z');
    f.clock.set('2026-11-01T08:00:30Z');
    await sync(account.id, 'career_pro', next);
    f.clock.set('2026-11-01T08:05:00Z');
    await sync(account.id, 'starter', next);
    const b = await balance(account.id);
    expect(b.account.plan_id).toBe('starter');
    expect(b.account.scheduled_plan_id).toBeNull();
    expect(b.granted).toBe(20);
  });

  it('V1 returning to the current plan before the renewal cancels a scheduled downgrade', async () => {
    const account = await freshAccount();
    const facts = paidFacts('2026-10-01T08:00:00Z', '2026-11-01T08:00:00Z');
    await sync(account.id, 'professional', facts);
    await sync(account.id, 'starter', facts);
    expect((await balance(account.id)).account.scheduled_plan_id).toBe('starter');
    await sync(account.id, 'professional', facts);
    expect((await balance(account.id)).account.scheduled_plan_id).toBeNull();
  });

  it('cancellation returns to Free on the account anniversary, revokes unused paid units and starts the 30-day storage grace', async () => {
    const account = await freshAccount();
    await sync(account.id, 'professional', paidFacts('2026-09-20T08:00:00Z', '2026-10-20T08:00:00Z'));
    await f.spend(account.id, 'document_credit', 2);
    await f.db.pool.query(
      `INSERT INTO career_evidence (workspace_id, candidate_auth_user_id, title, evidence_type, attachment_object_key,
         attachment_content_type, attachment_size_bytes, attachment_sha256, attachment_uploaded_at)
       VALUES ($1, $2, 'Big file', 'work_sample', $3, 'application/pdf', 400000000, 'x', now())`,
      [account.workspace_id, account.auth_user_id, `k-${randomUUID()}`],
    );

    await sync(account.id, 'free', { accountCreatedAt: new Date(CREATED), periodStart: null, periodEnd: null, status: null });
    const b = await balance(account.id);
    expect(b.account.plan_id).toBe('free');
    expect(b.account.allowance_anchor.toISOString()).toBe('2026-01-10T09:00:00.000Z');
    expect(b.account.allowance_period_start.toISOString()).toBe('2026-09-10T09:00:00.000Z');
    expect(b.granted).toBe(3);
    const grace = await f.db.pool.query<{ storage_grace_until: Date }>(`SELECT storage_grace_until FROM billing_accounts WHERE id = $1`, [account.id]);
    expect(grace.rows[0].storage_grace_until.toISOString()).toBe('2026-11-04T12:00:00.000Z');
    expect((await adjustments(account.id, 'storage_grace_started')).length).toBe(1);
    expect((await adjustments(account.id, 'period_reanchored')).length).toBe(2);
    // The ledger keeps the two committed units.
    const ledger = await f.db.pool.query(`SELECT count(*)::int AS n FROM usage_ledger WHERE billing_account_id = $1 AND state = 'committed'`, [account.id]);
    expect(ledger.rows[0].n).toBe(2);
  });

  it('a pack paid through V1 is granted once, spent after the included units, and a refund revokes only the unused units', async () => {
    const account = await freshAccount();
    const pack = { purchaseRef: `cs_${randomUUID()}`, addonId: 'document_s', purchasedAt: new Date('2026-10-02T00:00:00Z'), amountCents: 499, currency: 'usd', status: 'paid' as const };
    const facts = paidFacts('2026-10-01T08:00:00Z', '2026-11-01T08:00:00Z', { packPurchases: [pack] });
    await sync(account.id, 'starter', facts);
    await sync(account.id, 'starter', facts);
    const packs = await f.db.pool.query<{ remaining_units: number; expires_at: Date }>(`SELECT remaining_units, expires_at FROM packs WHERE billing_account_id = $1`, [account.id]);
    expect(packs.rows).toHaveLength(1);
    expect(packs.rows[0].remaining_units).toBe(10);
    expect(packs.rows[0].expires_at.toISOString()).toBe('2027-10-02T00:00:00.000Z');

    await f.spend(account.id, 'document_credit', 23); // 20 included, then 3 from the pack
    expect((await balance(account.id)).remaining).toBe(0);
    const after = await f.db.pool.query<{ remaining_units: number }>(`SELECT remaining_units FROM packs WHERE billing_account_id = $1`, [account.id]);
    expect(after.rows[0].remaining_units).toBe(7);

    await sync(account.id, 'starter', { ...facts, packPurchases: [{ ...pack, status: 'refunded' }] });
    await sync(account.id, 'starter', { ...facts, packPurchases: [{ ...pack, status: 'refunded' }] });
    const revoked = await f.db.pool.query<{ remaining_units: number; revoked_units: number; status: string }>(
      `SELECT remaining_units, revoked_units, status FROM packs WHERE billing_account_id = $1`,
      [account.id],
    );
    expect(revoked.rows[0]).toEqual({ remaining_units: 0, revoked_units: 7, status: 'revoked' });
    expect((await adjustments(account.id, 'pack_revoked')).map((a) => a.quantity)).toEqual([-7]);
  });

  it('capacity add-ons raise only their count cap, never on Free, and lapse with their subscription', async () => {
    const account = await freshAccount();
    const live = { addonId: 'saved_search_5', quantity: 2, status: 'active', currentPeriodEnd: new Date('2026-11-01T00:00:00Z') };
    const seat = { addonId: 'staff_seat', quantity: 1, status: 'active', currentPeriodEnd: new Date('2026-11-01T00:00:00Z') };
    await sync(account.id, 'starter', paidFacts('2026-10-01T08:00:00Z', '2026-11-01T08:00:00Z', { capacity: [live, seat] }));
    const snapshot = buildCatalogSnapshot();
    let row = await readAccount(f.db.pool, account.id);
    expect(row.capacity_extras).toEqual({ savedSearches: 10 });
    expect(capacityLimit(snapshot, row, 'savedSearches')).toBe(3 + 10);
    expect(() => checkCapacity(snapshot, row, 'savedSearches', 12)).not.toThrow();
    // A Business seat bought on Starter adds nothing, and intelligence/radius are not capacity.
    expect(capacityLimit(snapshot, row, 'staffSeats')).toBeNull();
    expect(capacityLimit(snapshot, row, 'locationProfiles')).toBe(snapshot.allowances.starter.locationProfiles);

    f.clock.set('2026-11-02T00:00:00Z');
    await sync(account.id, 'starter', paidFacts('2026-11-01T08:00:00Z', '2026-12-01T08:00:00Z', { capacity: [{ ...live, status: 'canceled' }] }));
    row = await readAccount(f.db.pool, account.id);
    expect(row.capacity_extras).toEqual({});
    expect((await adjustments(account.id, 'capacity_changed')).map((a) => a.quantity)).toEqual([10, -10]);
  });

  it('a configured Professional trial reported by V1 shows as trialing with its end date', async () => {
    const account = await freshAccount();
    await sync(account.id, 'professional', paidFacts('2026-10-04T08:00:00Z', '2026-10-11T08:00:00Z', { status: 'trialing' }));
    const row = await readAccount(f.db.pool, account.id);
    expect(row.status).toBe('trialing');
    expect(row.trial_end?.toISOString()).toBe('2026-10-11T08:00:00.000Z');
    expect((await balance(account.id)).granted).toBe(60);
  });
});
