import { CATALOG_VERSION, estimate } from '@flacroncv/career-shared';
import { BillingService } from './billing.service';
import { isBillingError } from './errors';
import { PaymentsService } from './payments/payments.service';
import type { VerifiedIdentity } from '../identity/id-token';
import { IdentityService } from '../identity/identity.service';
import type { Principal } from '../identity/identity.service';
import { TestClock } from '../testing/billing-fixture';
import { FakeAppleVerifier, FakeGooglePlay, FakeGooglePush, FakeStripeGateway, testSkus } from '../testing/fake-payments';
import { createTestDatabase, TestDatabase } from '../testing/test-database';
import { BillingPageService } from './billing-page.service';

function identity(uid: string): VerifiedIdentity {
  const at = new Date('2026-10-16T09:00:00Z');
  return { uid, email: `${uid}@example.test`, emailVerified: true, authTime: at, issuedAt: at, signInProvider: 'password' };
}

describe('BillingPageService', () => {
  let db: TestDatabase;
  let clock: TestClock;
  let identities: IdentityService;
  let page: BillingPageService;
  let stripe: FakeStripeGateway;

  beforeAll(async () => {
    db = await createTestDatabase('billing-page');
    clock = new TestClock('2026-10-16T09:00:00Z');
    await new BillingService(db.pool, clock).publishCatalog();
    identities = new IdentityService(db.pool, CATALOG_VERSION, clock);
    const skus = testSkus();
    stripe = new FakeStripeGateway(skus.stripe);
    const payments = new PaymentsService(
      db.pool,
      { stripe, apple: new FakeAppleVerifier(), googlePush: new FakeGooglePush(), googlePlay: new FakeGooglePlay() },
      { stripeWebhookSecret: 'whsec_test', skus, currentCatalogVersion: CATALOG_VERSION },
      clock,
    );
    page = new BillingPageService(db.pool, payments, clock);
  });

  afterAll(async () => {
    if (db) await db.drop();
  });

  async function person(uid: string): Promise<Principal> {
    return identities.principal(identity(uid));
  }

  it('shows Free, a held pack, and a legacy Pro price that is not Professional', async () => {
    const p = await person('billing-ada');
    const billing = await page.billing(p);
    expect(billing.planId).toBe('free');
    expect(billing.legacyPlan).toBeNull();
    expect(billing.price).toEqual({ amountCents: 0, currency: 'USD' });
    const usage = await page.usage(p);
    expect(usage.units.find((unit) => unit.unit === 'document_credit')).toMatchObject({ includedRemaining: 3 });
    await db.pool.query(
      `INSERT INTO packs
         (billing_account_id, workspace_id, addon_id, catalog_version, unit, purchased_units, remaining_units, purchased_at, expires_at)
       VALUES ($1, $2, 'text_interview_5', $3, 'text_interview', 5, 5, $4, $5)`,
      [p.billingAccountId, p.workspaceId, CATALOG_VERSION, clock.now(), new Date('2027-10-16T09:00:00Z')],
    );
    const held = await page.usage(p);
    expect(held.packs[0]).toMatchObject({ unit: 'text_interview', state: 'held', requiredPlan: 'starter', remainingUnits: 5 });
    expect(held.packs[0]?.expiresAt).toBe('2027-10-16T09:00:00.000Z');

    await db.pool.query(
      `UPDATE billing_accounts SET plan_id = 'legacy_pro', legacy_plan = 'pro', origin = 'migrated' WHERE id = $1`,
      [p.billingAccountId],
    );
    const legacy = await page.billing(p);
    expect(legacy.planId).toBe('legacy_pro');
    expect(legacy.legacyPlan).toBe('pro');
    expect(legacy.price).toEqual({ amountCents: 2999, currency: 'USD' });
    expect(JSON.stringify(legacy)).not.toContain('Professional');
    expect(JSON.stringify(legacy)).not.toContain('price_');
    const capped = await page.setSpendingCap(p, 2000);
    expect(capped.spendingCapCents).toBe(2000);
    const ledger = await db.pool.query<{ n: number }>(`SELECT count(*)::int AS n FROM usage_ledger WHERE billing_account_id = $1`, [
      p.billingAccountId,
    ]);
    expect(ledger.rows[0].n).toBe(0);
  });

  it('saves the same quote as estimate() and refuses a stale one without charging', async () => {
    const p = await person('billing-quote');
    const quote = estimate({ planId: 'starter', interval: 'monthly' });
    const saved = await page.createEstimate(p, { planId: 'starter', interval: 'monthly' });
    expect(saved.dueNowCents).toBe(quote.dueNowCents);
    expect(saved.catalogVersion).toBe(quote.catalogVersion);
    expect(saved.tax).toBe('excluded');
    const started = await page.checkout(p, { planId: 'starter', interval: 'monthly', provider: 'stripe', estimateId: saved.id }, 'quote-1');
    expect(started).toMatchObject({ provider: 'stripe' });
    if (started.provider === 'stripe') expect(started.url).toContain('https://checkout.stripe.test/');
    expect(JSON.stringify(started)).not.toContain('price_');
    const purchases = await db.pool.query<{ n: number }>(`SELECT count(*)::int AS n FROM purchases WHERE billing_account_id = $1`, [
      p.billingAccountId,
    ]);
    expect(purchases.rows[0].n).toBe(0);

    await db.pool.query(`UPDATE estimates SET expires_at = $2 WHERE id = $1`, [saved.id, new Date('2020-01-01T00:00:00Z')]);
    const stale = await page
      .checkout(p, { planId: 'starter', interval: 'monthly', provider: 'stripe', estimateId: saved.id }, 'quote-2')
      .catch((error: unknown) => error);
    expect(isBillingError(stale, 'stale_estimate')).toBe(true);
    expect(stripe.sessions).toHaveLength(1);

    const business = await page.createEstimate(p, { planId: 'business', interval: 'annual' });
    const store = await page
      .checkout(p, { planId: 'business', interval: 'annual', provider: 'apple', estimateId: business.id }, 'quote-3')
      .catch((error: unknown) => error);
    expect(isBillingError(store, 'channel_unavailable')).toBe(true);
  });
});
