/**
 * Each test is one walkthrough from docs/DATA_MODEL.md, step by step.
 */
import { createBillingFixture, BillingFixture } from '../testing';
import { BillingService } from './billing.service';
import { isBillingError } from './errors';
import { fingerprintRequest } from './fingerprint';

async function countLedger(f: BillingFixture, accountId: string, where = 'TRUE', params: unknown[] = []) {
  const res = await f.db.pool.query<{ n: number }>(
    `SELECT count(*)::int AS n FROM usage_ledger WHERE billing_account_id = $1 AND ${where}`,
    [accountId, ...params],
  );
  return res.rows[0].n;
}

/** A generation: reserve, call the provider only on success, then commit or release. */
async function generate(
  billing: BillingService,
  accountId: string,
  key: string,
  body: object,
  provider: () => Promise<string>,
) {
  const reserved = await billing.reserve({
    billingAccountId: accountId,
    unit: 'document_credit',
    idempotencyKey: key,
    requestFingerprint: fingerprintRequest(body),
    requestId: key,
  });
  if (reserved.replayed) return reserved;
  try {
    await provider();
  } catch (error) {
    await billing.release(accountId, reserved.ledger.id);
    throw error;
  }
  await billing.commit(accountId, reserved.ledger.id);
  return reserved;
}

describe('walkthrough: two requests, one credit left', () => {
  let f: BillingFixture;

  beforeAll(async () => {
    f = await createBillingFixture('wt_concurrent', '2026-10-05T12:00:00Z');
  });
  afterAll(async () => {
    if (f) await f.drop();
  });

  it.each([1, 2, 3, 4, 5])(
    'lets exactly one of several simultaneous requests reserve the last credit, and calls the provider once (round %i)',
    async () => {
      const account = await f.paidAccount('starter', 'monthly', '2026-10-01T00:00:00Z');
      await f.spend(account.id, 'document_credit', 19);
      expect((await f.billing.unitBalance(account.id, 'document_credit')).includedRemaining).toBe(1);

      // Open the connections first, so the requests start together instead of
      // one finishing while the others are still connecting.
      const warm = await Promise.all(Array.from({ length: 5 }, () => f.db.pool.connect()));
      warm.forEach((client) => client.release());

      let providerCalls = 0;
      const provider = async () => {
        providerCalls += 1;
        return 'generated';
      };
      const results = await Promise.allSettled(
        ['A', 'B', 'C', 'D', 'E'].map((name) => generate(f.billing, account.id, `race-${name}`, { name }, provider)),
      );

      const fulfilled = results.filter((r) => r.status === 'fulfilled');
      const rejected = results.filter((r): r is PromiseRejectedResult => r.status === 'rejected');
      expect(fulfilled).toHaveLength(1);
      expect(rejected).toHaveLength(4);
      for (const r of rejected) {
        expect(isBillingError(r.reason, 'quota_exhausted')).toBe(true);
        expect(r.reason.details).toMatchObject({ unit: 'document_credit', remaining: 0 });
        expect(r.reason.details.renewalDate).toEqual(new Date('2026-11-01T00:00:00Z'));
      }
      expect(providerCalls).toBe(1);
      expect(await countLedger(f, account.id, `idempotency_key LIKE 'race-%'`)).toBe(1);
      expect((await f.billing.unitBalance(account.id, 'document_credit')).includedRemaining).toBe(0);
    },
  );
});

describe('walkthrough: retry with the same idempotency key', () => {
  let f: BillingFixture;

  beforeAll(async () => {
    f = await createBillingFixture('wt_retry', '2026-10-05T12:00:00Z');
  });
  afterAll(async () => {
    if (f) await f.drop();
  });

  it('returns the original row without a second debit, and refuses the same key with another body', async () => {
    const account = await f.paidAccount('starter', 'monthly', '2026-10-01T00:00:00Z');
    const body = { resumeId: 'r1', instructions: 'shorter' };
    const first = await generate(f.billing, account.id, 'K', body, async () => 'ok');
    expect(first.replayed).toBe(false);
    expect((await f.billing.unitBalance(account.id, 'document_credit')).includedRemaining).toBe(19);

    const retry = await generate(f.billing, account.id, 'K', { instructions: 'shorter', resumeId: 'r1' }, async () => {
      throw new Error('the provider must not be called on a replay');
    });
    expect(retry.replayed).toBe(true);
    expect(retry.ledger.id).toBe(first.ledger.id);
    expect(retry.ledger.state).toBe('committed');
    expect((await f.billing.unitBalance(account.id, 'document_credit')).includedRemaining).toBe(19);

    const mismatch = await generate(f.billing, account.id, 'K', { resumeId: 'r1', instructions: 'longer' }, async () => 'x').catch(
      (e: unknown) => e,
    );
    expect(isBillingError(mismatch, 'idempotency_mismatch')).toBe(true);
    expect((await f.billing.unitBalance(account.id, 'document_credit')).includedRemaining).toBe(19);
    expect(await countLedger(f, account.id)).toBe(1);
  });

  it('lets one of several identical racing retries insert, and the others read that row', async () => {
    const account = await f.paidAccount('starter', 'monthly', '2026-10-01T00:00:00Z');
    const body = { resumeId: 'r2' };
    const results = await Promise.all(
      [1, 2, 3, 4].map(() =>
        f.billing.reserve({
          billingAccountId: account.id,
          unit: 'document_credit',
          idempotencyKey: 'K2',
          requestFingerprint: fingerprintRequest(body),
          requestId: 'K2',
        }),
      ),
    );
    expect(new Set(results.map((r) => r.ledger.id)).size).toBe(1);
    expect(results.filter((r) => !r.replayed)).toHaveLength(1);
    expect(await countLedger(f, account.id)).toBe(1);
    expect((await f.billing.unitBalance(account.id, 'document_credit')).includedRemaining).toBe(19);
  });
});

describe('walkthrough: a failed AI call', () => {
  let f: BillingFixture;

  beforeAll(async () => {
    f = await createBillingFixture('wt_failed', '2026-10-05T12:00:00Z');
  });
  afterAll(async () => {
    if (f) await f.drop();
  });

  it('releases the reservation, returns the credit, and keeps one ledger row', async () => {
    const account = await f.paidAccount('starter', 'monthly', '2026-10-01T00:00:00Z');
    const failing = async (): Promise<string> => {
      throw new Error('model timeout');
    };
    await expect(generate(f.billing, account.id, 'K', { a: 1 }, failing)).rejects.toThrow('model timeout');

    const rows = await f.db.pool.query(`SELECT state, quantity, released_at FROM usage_ledger WHERE billing_account_id = $1`, [
      account.id,
    ]);
    expect(rows.rows).toHaveLength(1);
    expect(rows.rows[0]).toMatchObject({ state: 'released', quantity: 1 });
    expect(rows.rows[0].released_at).toBeInstanceOf(Date);
    expect((await f.billing.unitBalance(account.id, 'document_credit')).includedRemaining).toBe(20);
  });

  it('reusing the key returns the released row and does not start a hidden second charge', async () => {
    const account = await f.paidAccount('starter', 'monthly', '2026-10-01T00:00:00Z');
    await expect(
      generate(f.billing, account.id, 'K', { a: 1 }, async () => {
        throw new Error('fail');
      }),
    ).rejects.toThrow('fail');
    const again = await generate(f.billing, account.id, 'K', { a: 1 }, async () => {
      throw new Error('the provider must not be called on a replay');
    });
    expect(again.replayed).toBe(true);
    expect(again.ledger.state).toBe('released');
    expect((await f.billing.unitBalance(account.id, 'document_credit')).includedRemaining).toBe(20);
  });

  it('a commit after the release is refused, and a second release changes nothing', async () => {
    const account = await f.paidAccount('starter', 'monthly', '2026-10-01T00:00:00Z');
    const { ledger } = await f.billing.reserve({
      billingAccountId: account.id,
      unit: 'document_credit',
      idempotencyKey: 'K3',
      requestFingerprint: fingerprintRequest({}),
      requestId: 'K3',
    });
    await f.billing.release(account.id, ledger.id);
    await f.billing.release(account.id, ledger.id);
    expect((await f.billing.unitBalance(account.id, 'document_credit')).includedRemaining).toBe(20);
    const error = await f.billing.commit(account.id, ledger.id).catch((e: unknown) => e);
    expect(isBillingError(error, 'reservation_closed')).toBe(true);
  });

  it('a reservation whose process died stays reserved; nothing releases it on its own', async () => {
    const account = await f.paidAccount('starter', 'annual', '2026-10-01T00:00:00Z');
    const { ledger } = await f.billing.reserve({
      billingAccountId: account.id,
      unit: 'document_credit',
      idempotencyKey: 'orphan',
      requestFingerprint: fingerprintRequest({}),
      requestId: 'orphan',
    });
    f.clock.set('2026-11-01T00:00:00Z');
    await f.billing.renewDueAccounts();
    await f.billing.expirePacks();
    const row = await f.db.pool.query(`SELECT state FROM usage_ledger WHERE id = $1`, [ledger.id]);
    expect(row.rows[0].state).toBe('reserved');

    // A later release goes back to October's balance, not to November's new grant.
    await f.billing.release(account.id, ledger.id);
    const balances = await f.db.pool.query(
      `SELECT allowance_period_start, included_remaining FROM usage_balances
        WHERE billing_account_id = $1 AND unit = 'document_credit' ORDER BY allowance_period_start`,
      [account.id],
    );
    expect(balances.rows.map((r) => r.included_remaining)).toEqual([20, 20]);
    f.clock.set('2026-10-05T12:00:00Z');
  });
});

describe('walkthrough: monthly renewal on an annual plan', () => {
  let f: BillingFixture;

  beforeAll(async () => {
    f = await createBillingFixture('wt_annual', '2026-03-15T00:00:00Z');
  });
  afterAll(async () => {
    if (f) await f.drop();
  });

  it('grants one month at purchase, renews monthly from the annual charge, and keeps the pack', async () => {
    const account = await f.paidAccount('professional', 'annual', '2026-03-15T00:00:00Z');
    expect(account.period_end).toEqual(new Date('2027-03-15T00:00:00Z'));
    expect(account.allowance_period_start).toEqual(new Date('2026-03-15T00:00:00Z'));
    expect(account.allowance_period_end).toEqual(new Date('2026-04-15T00:00:00Z'));

    // An annual purchase does not insert twelve monthly grants.
    const atPurchase = await f.db.pool.query(
      `SELECT included_granted FROM usage_balances WHERE billing_account_id = $1 AND unit = 'document_credit'`,
      [account.id],
    );
    expect(atPurchase.rows).toEqual([{ included_granted: 60 }]);

    f.clock.set('2026-03-20T00:00:00Z');
    const pack = await f.billing.grantPack(account.id, 'document_s', new Date('2026-03-20T00:00:00Z'));
    await f.spend(account.id, 'document_credit', 40);
    expect(await f.billing.unitBalance(account.id, 'document_credit')).toMatchObject({
      includedGranted: 60,
      includedRemaining: 20,
      packRemaining: 10,
    });

    // The day before the anniversary nothing renews.
    f.clock.set('2026-04-14T23:59:59Z');
    expect((await f.billing.renewDueAccounts()).renewed).toBe(0);

    // Step 1-6: on 15 April the worker grants a new month.
    f.clock.set('2026-04-15T00:00:00Z');
    expect((await f.billing.renewDueAccounts()).renewed).toBe(1);

    const balances = await f.db.pool.query(
      `SELECT allowance_period_start, allowance_period_end, included_granted, included_remaining
         FROM usage_balances WHERE billing_account_id = $1 AND unit = 'document_credit'
        ORDER BY allowance_period_start`,
      [account.id],
    );
    expect(balances.rows).toEqual([
      {
        allowance_period_start: new Date('2026-03-15T00:00:00Z'),
        allowance_period_end: new Date('2026-04-15T00:00:00Z'),
        included_granted: 60,
        included_remaining: 20,
      },
      {
        allowance_period_start: new Date('2026-04-15T00:00:00Z'),
        allowance_period_end: new Date('2026-05-15T00:00:00Z'),
        included_granted: 60,
        included_remaining: 60,
      },
    ]);

    const packAfter = await f.db.pool.query(`SELECT remaining_units, expires_at, status FROM packs WHERE id = $1`, [pack.id]);
    expect(packAfter.rows[0]).toEqual({ remaining_units: 10, expires_at: pack.expires_at, status: 'active' });

    const accountAfter = await f.db.pool.query(
      `SELECT allowance_period_start, allowance_period_end, period_end FROM billing_accounts WHERE id = $1`,
      [account.id],
    );
    expect(accountAfter.rows[0]).toEqual({
      allowance_period_start: new Date('2026-04-15T00:00:00Z'),
      allowance_period_end: new Date('2026-05-15T00:00:00Z'),
      period_end: new Date('2027-03-15T00:00:00Z'),
    });

    // Step 7: the same worker repeats each month until the annual period ends.
    for (let month = 5; month <= 14; month += 1) {
      const year = month <= 12 ? 2026 : 2027;
      const mm = String(month <= 12 ? month : month - 12).padStart(2, '0');
      f.clock.set(`${year}-${mm}-15T00:00:00Z`);
      expect((await f.billing.renewDueAccounts()).renewed).toBe(1);
    }
    f.clock.set('2027-03-15T00:00:00Z');
    expect((await f.billing.renewDueAccounts()).renewed).toBe(0);

    const grants = await f.db.pool.query<{ n: number }>(
      `SELECT count(*)::int AS n FROM usage_balances WHERE billing_account_id = $1 AND unit = 'document_credit'`,
      [account.id],
    );
    expect(grants.rows[0].n).toBe(12);
  });
});

describe('walkthrough: an upgrade mid-month', () => {
  let f: BillingFixture;

  beforeAll(async () => {
    f = await createBillingFixture('wt_upgrade', '2026-10-01T00:00:00Z');
  });
  afterAll(async () => {
    if (f) await f.drop();
  });

  it('adds only the allowance difference each time and keeps used units and the period', async () => {
    const account = await f.paidAccount('starter', 'monthly', '2026-10-01T00:00:00Z');
    f.clock.set('2026-10-03T00:00:00Z');
    const pack = await f.billing.grantPack(account.id, 'document_s');
    await f.spend(account.id, 'document_credit', 10);
    expect(await f.billing.unitBalance(account.id, 'document_credit')).toMatchObject({
      includedGranted: 20,
      includedRemaining: 10,
    });

    f.clock.set('2026-10-15T00:00:00Z');
    await f.billing.upgradePlan(account.id, 'professional');
    expect(await f.billing.unitBalance(account.id, 'document_credit')).toMatchObject({
      includedGranted: 60,
      includedRemaining: 50,
      packRemaining: 10,
    });

    f.clock.set('2026-10-20T00:00:00Z');
    await f.billing.upgradePlan(account.id, 'career_pro');
    expect(await f.billing.unitBalance(account.id, 'document_credit')).toMatchObject({
      includedGranted: 150,
      includedRemaining: 140,
      packRemaining: 10,
    });

    const row = await f.db.pool.query(
      `SELECT plan_id, catalog_version, allowance_period_start, allowance_period_end FROM billing_accounts WHERE id = $1`,
      [account.id],
    );
    expect(row.rows[0]).toEqual({
      plan_id: 'career_pro',
      catalog_version: account.catalog_version,
      allowance_period_start: new Date('2026-10-01T00:00:00Z'),
      allowance_period_end: new Date('2026-11-01T00:00:00Z'),
    });

    // A unit Starter did not include starts at the new plan's amount, then gets the next difference.
    expect(await f.billing.unitBalance(account.id, 'action_pack')).toMatchObject({
      includedGranted: 30,
      includedRemaining: 30,
    });

    const packAfter = await f.db.pool.query(`SELECT remaining_units, status FROM packs WHERE id = $1`, [pack.id]);
    expect(packAfter.rows[0]).toEqual({ remaining_units: 10, status: 'active' });
  });

  it('refuses a downgrade through the upgrade path', async () => {
    const account = await f.paidAccount('professional', 'monthly', '2026-10-01T00:00:00Z');
    const error = await f.billing.upgradePlan(account.id, 'starter').catch((e: unknown) => e);
    expect(isBillingError(error, 'validation_error')).toBe(true);
    expect(await f.billing.unitBalance(account.id, 'document_credit')).toMatchObject({ includedGranted: 60 });
  });
});
