import { createBillingFixture, BillingFixture } from '../testing';
import { BillingError, isBillingError } from './errors';
import { fingerprintRequest } from './fingerprint';

function reserveInput(accountId: string, unit: string, key: string) {
  return {
    billingAccountId: accountId,
    unit,
    idempotencyKey: key,
    requestFingerprint: fingerprintRequest({ key }),
    requestId: key,
  };
}

async function errorOf(promise: Promise<unknown>): Promise<BillingError> {
  const error = await promise.then(
    () => undefined,
    (e: unknown) => e,
  );
  if (!(error instanceof BillingError)) throw new Error(`expected a BillingError, got ${String(error)}`);
  return error;
}

describe('entitlements', () => {
  let f: BillingFixture;

  beforeAll(async () => {
    f = await createBillingFixture('entitlements', '2026-10-05T12:00:00Z');
  });
  afterAll(async () => {
    if (f) await f.drop();
  });
  afterEach(() => {
    f.clock.set('2026-10-05T12:00:00Z');
  });

  it('an action-pack reserve does not also reserve a document credit or an analysis', async () => {
    const account = await f.paidAccount('professional', 'monthly', '2026-10-01T00:00:00Z');
    const { ledger } = await f.billing.reserve(reserveInput(account.id, 'action_pack', 'pack-1'));
    await f.billing.commit(account.id, ledger.id);

    const units = await f.db.pool.query(`SELECT unit FROM usage_ledger WHERE billing_account_id = $1`, [account.id]);
    expect(units.rows).toEqual([{ unit: 'action_pack' }]);
    expect((await f.billing.unitBalance(account.id, 'document_credit')).includedRemaining).toBe(60);
    expect((await f.billing.unitBalance(account.id, 'resume_analysis')).includedRemaining).toBe(60);
    expect((await f.billing.unitBalance(account.id, 'action_pack')).includedRemaining).toBe(9);
  });

  it('spends included units first, then packs by earliest expiry, and never an expired pack', async () => {
    f.clock.set('2026-12-01T00:00:00Z');
    const account = await f.paidAccount('starter', 'annual', '2026-01-01T00:00:00Z');
    // Granted in this order on purpose: the later-expiring pack is inserted first.
    const later = await f.billing.grantPack(account.id, 'document_s', new Date('2025-12-25T00:00:00Z'));
    const sooner = await f.billing.grantPack(account.id, 'document_s', new Date('2025-12-20T00:00:00Z'));
    expect(sooner.expires_at).toEqual(new Date('2026-12-20T00:00:00Z'));
    expect(later.expires_at).toEqual(new Date('2026-12-25T00:00:00Z'));

    await f.spend(account.id, 'document_credit', 20);
    const packs = async () =>
      (await f.db.pool.query(`SELECT id, remaining_units, status FROM packs WHERE billing_account_id = $1`, [account.id]))
        .rows;
    expect((await packs()).every((p) => p.remaining_units === 10)).toBe(true);

    const fromPack = await f.billing.reserve(reserveInput(account.id, 'document_credit', 'after-included'));
    expect(fromPack.ledger.pack_id).toBe(sooner.id);

    f.clock.set('2026-12-20T00:00:00Z');
    const afterExpiry = await f.billing.reserve(reserveInput(account.id, 'document_credit', 'after-expiry'));
    expect(afterExpiry.ledger.pack_id).toBe(later.id);
    expect((await f.billing.unitBalance(account.id, 'document_credit')).packRemaining).toBe(9);

    expect(await f.billing.expirePacks()).toBe(1);
    const byId = new Map((await packs()).map((p) => [p.id, p]));
    expect(byId.get(sooner.id)).toMatchObject({ remaining_units: 9, status: 'expired' });
    expect(byId.get(later.id)).toMatchObject({ remaining_units: 9, status: 'active' });
  });

  it('marks a pack exhausted at zero and active again when its reservation is released', async () => {
    const account = await f.paidAccount('starter', 'monthly', '2026-10-01T00:00:00Z');
    const pack = await f.billing.grantPack(account.id, 'document_s');
    await f.spend(account.id, 'document_credit', 29);
    const last = await f.billing.reserve(reserveInput(account.id, 'document_credit', 'last-pack-unit'));
    expect(last.ledger.pack_id).toBe(pack.id);
    let row = await f.db.pool.query(`SELECT remaining_units, status FROM packs WHERE id = $1`, [pack.id]);
    expect(row.rows[0]).toEqual({ remaining_units: 0, status: 'exhausted' });

    const exhausted = await errorOf(f.billing.reserve(reserveInput(account.id, 'document_credit', 'none-left')));
    expect(exhausted.code).toBe('quota_exhausted');

    await f.billing.release(account.id, last.ledger.id);
    row = await f.db.pool.query(`SELECT remaining_units, status FROM packs WHERE id = $1`, [pack.id]);
    expect(row.rows[0]).toEqual({ remaining_units: 1, status: 'active' });
  });

  it('Free cannot buy packs, and a pack below its plan minimum is refused', async () => {
    const free = await f.freeAccount();
    const onFree = await errorOf(f.billing.grantPack(free.id, 'document_s'));
    expect(onFree.code).toBe('not_purchasable');
    expect(onFree.details).toMatchObject({ minimumPlan: 'starter' });

    const starter = await f.paidAccount('starter', 'monthly', '2026-10-01T00:00:00Z');
    const actionOnStarter = await errorOf(f.billing.grantPack(starter.id, 'action_s'));
    expect(actionOnStarter.details).toMatchObject({ minimumPlan: 'professional' });

    const capacity = await errorOf(f.billing.grantPack(starter.id, 'location_extra'));
    expect(capacity.code).toBe('not_purchasable');
    const future = await errorOf(f.billing.grantPack(starter.id, 'career_maintenance'));
    expect(future.code).toBe('not_purchasable');
  });

  it('a unit the plan does not include is plan_upgrade_required, with nothing reserved', async () => {
    const free = await f.freeAccount();
    const error = await errorOf(f.billing.reserve(reserveInput(free.id, 'text_interview', 'ti')));
    expect(error.code).toBe('plan_upgrade_required');
    expect(error.details).toMatchObject({ minimumPlan: 'starter', feature: 'textInterviewSessions' });
    const rows = await f.db.pool.query(`SELECT 1 FROM usage_ledger WHERE billing_account_id = $1`, [free.id]);
    expect(rows.rowCount).toBe(0);
  });

  it('an unknown unit is a validation error', async () => {
    const free = await f.freeAccount();
    const error = await errorOf(f.billing.reserve(reserveInput(free.id, 'gold_coin', 'x')));
    expect(error.code).toBe('validation_error');
  });

  it('a canceled account cannot spend', async () => {
    const account = await f.paidAccount('starter', 'monthly', '2026-10-01T00:00:00Z');
    await f.db.pool.query(`UPDATE billing_accounts SET status = 'canceled' WHERE id = $1`, [account.id]);
    const error = await errorOf(f.billing.reserve(reserveInput(account.id, 'document_credit', 'c')));
    expect(error.code).toBe('billing_inactive');
  });

  it('warns once at 80, 95, and 100 percent, and a warning is not a debit', async () => {
    const account = await f.paidAccount('starter', 'monthly', '2026-10-01T00:00:00Z');
    const warnings = async () =>
      (
        await f.db.pool.query<{ threshold: number }>(
          `SELECT threshold FROM usage_warnings WHERE billing_account_id = $1 AND unit = 'document_credit' ORDER BY threshold`,
          [account.id],
        )
      ).rows.map((r) => r.threshold);

    await f.spend(account.id, 'document_credit', 15);
    expect(await warnings()).toEqual([]);
    await f.spend(account.id, 'document_credit', 1);
    expect(await warnings()).toEqual([80]);
    await f.spend(account.id, 'document_credit', 3);
    expect(await warnings()).toEqual([80, 95]);
    await f.spend(account.id, 'document_credit', 1);
    expect(await warnings()).toEqual([80, 95, 100]);

    const ledger = await f.db.pool.query<{ n: number }>(
      `SELECT count(*)::int AS n FROM usage_ledger WHERE billing_account_id = $1`,
      [account.id],
    );
    expect(ledger.rows[0].n).toBe(20);
  });

  it('a monthly paid plan does not grant a new month until a payment event moves period_end', async () => {
    const account = await f.paidAccount('starter', 'monthly', '2026-10-01T00:00:00Z');
    f.clock.set('2026-11-01T00:00:00Z');
    await f.billing.renewDueAccounts();
    const after = await f.db.pool.query(`SELECT allowance_period_start FROM billing_accounts WHERE id = $1`, [account.id]);
    expect(after.rows[0].allowance_period_start).toEqual(new Date('2026-10-01T00:00:00Z'));

    const error = await errorOf(f.billing.reserve(reserveInput(account.id, 'document_credit', 'lapsed')));
    expect(error.code).toBe('quota_exhausted');
  });

  it('a reserve after the anniversary renews Free even when the worker has not run yet', async () => {
    const free = await f.freeAccount({ anchor: '2026-09-10T08:00:00Z' });
    await f.spend(free.id, 'document_credit', 3);
    expect((await errorOf(f.billing.reserve(reserveInput(free.id, 'document_credit', 'fourth')))).code).toBe(
      'quota_exhausted',
    );

    f.clock.set('2026-10-10T08:00:00Z');
    const renewed = await f.billing.reserve(reserveInput(free.id, 'document_credit', 'next-month'));
    expect(renewed.balance).toMatchObject({ includedGranted: 3, includedRemaining: 2 });
    expect(renewed.ledger.allowance_period_start).toEqual(new Date('2026-10-10T08:00:00Z'));
  });

  it('quota_exhausted carries the unit, what remains, and the renewal date', async () => {
    const free = await f.freeAccount({ anchor: '2026-09-20T00:00:00Z' });
    await f.spend(free.id, 'resume_analysis', 3);
    const error = await errorOf(f.billing.reserve(reserveInput(free.id, 'resume_analysis', 'r4')));
    expect(error.code).toBe('quota_exhausted');
    expect(error.details).toEqual({
      unit: 'resume_analysis',
      remaining: 0,
      renewalDate: new Date('2026-10-20T00:00:00Z'),
    });
  });

  it('a release does not insert a negative twin and does not rewrite the quantity', async () => {
    const account = await f.paidAccount('starter', 'monthly', '2026-10-01T00:00:00Z');
    const { ledger } = await f.billing.reserve({ ...reserveInput(account.id, 'document_credit', 'q2'), quantity: 2 });
    await f.billing.release(account.id, ledger.id);
    const rows = await f.db.pool.query(`SELECT quantity, state FROM usage_ledger WHERE billing_account_id = $1`, [account.id]);
    expect(rows.rows).toEqual([{ quantity: 2, state: 'released' }]);
  });

  it('rejects a non-integer or zero quantity', async () => {
    const account = await f.paidAccount('starter', 'monthly', '2026-10-01T00:00:00Z');
    for (const quantity of [0, -1, 1.5]) {
      const error = await errorOf(
        f.billing.reserve({ ...reserveInput(account.id, 'document_credit', `bad-${quantity}`), quantity }),
      );
      expect(isBillingError(error, 'validation_error')).toBe(true);
    }
  });
});

describe('Free renewal on the account anniversary', () => {
  let f: BillingFixture;

  beforeAll(async () => {
    f = await createBillingFixture('free_renewal', '2026-10-16T00:00:00Z');
  });
  afterAll(async () => {
    if (f) await f.drop();
  });

  it('renews a V2 Free account on its own anniversary, not on the 1st', async () => {
    const free = await f.freeAccount();
    expect(free.allowance_period_end).toEqual(new Date('2026-11-16T00:00:00Z'));
    f.clock.set('2026-11-01T00:00:00Z');
    expect((await f.billing.renewDueAccounts()).renewed).toBe(0);
    f.clock.set('2026-11-16T00:00:00Z');
    expect((await f.billing.renewDueAccounts()).renewed).toBe(1);
  });

  it('renews a Free account copied from V1 monthly from its V1 creation date, clamped to short months', async () => {
    f.clock.set('2026-10-16T00:00:00Z');
    const copied = await f.freeAccount({ anchor: '2025-03-31T10:00:00Z', origin: 'migrated' });
    expect(copied.origin).toBe('migrated');
    expect(copied.allowance_period_start).toEqual(new Date('2026-09-30T10:00:00Z'));
    expect(copied.allowance_period_end).toEqual(new Date('2026-10-31T10:00:00Z'));
    await f.spend(copied.id, 'document_credit', 3);

    f.clock.set('2026-10-31T09:59:59Z');
    await f.billing.renewDueAccounts();
    expect((await f.billing.unitBalance(copied.id, 'document_credit')).includedRemaining).toBe(0);

    f.clock.set('2026-10-31T10:00:00Z');
    await f.billing.renewDueAccounts();
    expect(await f.billing.unitBalance(copied.id, 'document_credit')).toMatchObject({
      includedGranted: 3,
      includedRemaining: 3,
      renewalDate: new Date('2026-11-30T10:00:00Z'),
    });

    f.clock.set('2026-11-30T10:00:00Z');
    await f.billing.renewDueAccounts();
    expect((await f.billing.unitBalance(copied.id, 'document_credit')).renewalDate).toEqual(
      new Date('2026-12-31T10:00:00Z'),
    );
  });
});
