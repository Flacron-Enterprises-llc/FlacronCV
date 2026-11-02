import { CATALOG_VERSION } from '@flacroncv/career-shared';
import { createBillingFixture, type BillingFixture } from '../testing/billing-fixture';
import { isBillingError } from './errors';

describe('Starter activation and Free-to-Starter grants', () => {
  let f: BillingFixture;

  beforeAll(async () => {
    f = await createBillingFixture('starter_activation', '2026-10-01T00:00:00Z');
  });
  afterAll(async () => {
    if (f) await f.drop();
  });

  it('grants 20 monthly document credits through startSubscription, not a raw plan_id update', async () => {
    const shortcut = await f.freeAccount({ anchor: '2026-10-01T00:00:00Z' });
    expect(await f.billing.unitBalance(shortcut.id, 'document_credit')).toMatchObject({
      includedGranted: 3,
      includedRemaining: 3,
    });
    await f.db.pool.query(`UPDATE billing_accounts SET plan_id = 'starter' WHERE id = $1`, [shortcut.id]);
    expect(await f.billing.unitBalance(shortcut.id, 'document_credit')).toMatchObject({
      includedGranted: 3,
      includedRemaining: 3,
    });

    const starter = await f.paidAccount('starter', 'monthly', '2026-10-01T00:00:00Z');
    expect(starter.plan_id).toBe('starter');
    expect(starter.allowance_period_end).toEqual(new Date('2026-11-01T00:00:00Z'));
    expect(await f.billing.unitBalance(starter.id, 'document_credit')).toMatchObject({
      includedGranted: 20,
      includedRemaining: 20,
    });
  });

  it('keeps used Free units when startSubscription regrants Starter', async () => {
    const account = await f.freeAccount({ anchor: '2026-10-01T00:00:00Z' });
    await f.spend(account.id, 'document_credit', 1);
    expect(await f.billing.unitBalance(account.id, 'document_credit')).toMatchObject({
      includedGranted: 3,
      includedRemaining: 2,
    });

    await f.billing.startSubscription(account.id, {
      planId: 'starter',
      interval: 'monthly',
      provider: 'stripe',
      providerSubscriptionId: `sub-regrant-${account.id}`,
      periodStart: new Date('2026-10-01T00:00:00Z'),
      catalogVersion: CATALOG_VERSION,
    });
    expect(await f.billing.unitBalance(account.id, 'document_credit')).toMatchObject({
      includedGranted: 20,
      includedRemaining: 19,
    });
    const ledger = await f.db.pool.query<{ n: number }>(
      `SELECT count(*)::int AS n FROM usage_ledger WHERE billing_account_id = $1 AND state = 'committed'`,
      [account.id],
    );
    expect(ledger.rows[0].n).toBe(1);
  });

  it('refuses upgradePlan from Free and a second startSubscription', async () => {
    const free = await f.freeAccount({ anchor: '2026-10-01T00:00:00Z' });
    const upgrade = await f.billing.upgradePlan(free.id, 'starter').catch((error: unknown) => error);
    expect(isBillingError(upgrade, 'validation_error')).toBe(true);
    if (isBillingError(upgrade)) expect(upgrade.details).toMatchObject({ reason: 'free_starts_a_subscription' });
    expect(await f.billing.unitBalance(free.id, 'document_credit')).toMatchObject({
      includedGranted: 3,
      includedRemaining: 3,
    });

    const starter = await f.paidAccount('starter', 'monthly', '2026-10-01T00:00:00Z');
    const again = await f.billing
      .startSubscription(starter.id, {
        planId: 'starter',
        interval: 'monthly',
        provider: 'stripe',
        providerSubscriptionId: `sub-again-${starter.id}`,
        periodStart: new Date('2026-10-01T00:00:00Z'),
        catalogVersion: CATALOG_VERSION,
      })
      .catch((error: unknown) => error);
    expect(isBillingError(again, 'validation_error')).toBe(true);
    if (isBillingError(again)) expect(again.details).toMatchObject({ reason: 'already_subscribed' });
    expect(await f.billing.unitBalance(starter.id, 'document_credit')).toMatchObject({
      includedGranted: 20,
      includedRemaining: 20,
    });
  });

  it('opens one month on an annual Starter purchase, then grants the next month on the anniversary', async () => {
    f.clock.set('2026-03-15T00:00:00Z');
    const account = await f.paidAccount('starter', 'annual', '2026-03-15T00:00:00Z');
    expect(account.period_end).toEqual(new Date('2027-03-15T00:00:00Z'));
    expect(account.allowance_period_start).toEqual(new Date('2026-03-15T00:00:00Z'));
    expect(account.allowance_period_end).toEqual(new Date('2026-04-15T00:00:00Z'));
    const atPurchase = await f.db.pool.query<{ included_granted: number }>(
      `SELECT included_granted FROM usage_balances WHERE billing_account_id = $1 AND unit = 'document_credit'`,
      [account.id],
    );
    expect(atPurchase.rows).toEqual([{ included_granted: 20 }]);

    f.clock.set('2026-04-15T00:00:00Z');
    expect((await f.billing.renewDueAccounts()).renewed).toBe(1);
    const balances = await f.db.pool.query<{ included_granted: number }>(
      `SELECT included_granted FROM usage_balances
        WHERE billing_account_id = $1 AND unit = 'document_credit'
        ORDER BY allowance_period_start`,
      [account.id],
    );
    expect(balances.rows).toEqual([{ included_granted: 20 }, { included_granted: 20 }]);
    f.clock.set('2026-10-01T00:00:00Z');
  });
});
