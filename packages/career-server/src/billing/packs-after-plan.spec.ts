/**
 * Decision 22 (docs/OPEN_DECISIONS.md): packs after the paid plan ends.
 * Spec sections 5, 9, and 11.
 */
import { randomUUID } from 'crypto';
import { CATALOG_VERSION } from '@flacroncv/career-shared';
import type { PlanId } from '@flacroncv/career-shared';
import { createBillingFixture, BillingFixture } from '../testing';
import { buildCatalogSnapshot, minimumPlanFor } from './catalog';
import { BillingError } from './errors';
import { fingerprintRequest } from './fingerprint';

function reserveInput(accountId: string, unit: string, key = randomUUID()) {
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

describe('which units a pack can be held for', () => {
  it('matches the decision: Professional units, Starter units, and Free document credits', () => {
    const snapshot = buildCatalogSnapshot();
    const minimum: Record<string, PlanId | null> = {};
    for (const unit of [
      'action_pack',
      'voice_minute',
      'scenario_report',
      'assisted_form',
      'map_session',
      'text_interview',
      'skill_report',
      'document_credit',
    ] as const) {
      minimum[unit] = minimumPlanFor(snapshot, unit);
    }
    expect(minimum).toEqual({
      action_pack: 'professional',
      voice_minute: 'professional',
      scenario_report: 'professional',
      assisted_form: 'professional',
      map_session: 'professional',
      text_interview: 'starter',
      skill_report: 'starter',
      document_credit: 'free',
    });
  });
});

describe('packs after the paid plan ends', () => {
  let f: BillingFixture;

  beforeAll(async () => {
    f = await createBillingFixture('packs_after_plan', '2026-10-05T12:00:00Z');
  });
  afterAll(async () => {
    if (f) await f.drop();
  });
  afterEach(() => {
    f.clock.set('2026-10-05T12:00:00Z');
  });

  async function resubscribe(accountId: string, planId: PlanId, at: string) {
    f.clock.set(at);
    return f.billing.startSubscription(accountId, {
      planId,
      interval: 'monthly',
      provider: 'stripe',
      providerSubscriptionId: `sub_${randomUUID()}`,
      periodStart: new Date(at),
      catalogVersion: CATALOG_VERSION,
    });
  }

  it('spendable on Free: a document pack is spent on Free after the Free credits', async () => {
    const account = await f.paidAccount('starter', 'monthly', '2026-10-01T00:00:00Z');
    const pack = await f.billing.grantPack(account.id, 'document_s');

    f.clock.set('2026-11-01T00:00:00Z');
    const ended = await f.billing.endSubscription(account.id);
    expect(ended).toMatchObject({
      plan_id: 'free',
      status: 'active',
      provider: null,
      period_end: null,
      allowance_period_start: new Date('2026-11-01T00:00:00Z'),
      allowance_period_end: new Date('2026-12-01T00:00:00Z'),
    });
    expect(await f.billing.unitBalance(account.id, 'document_credit')).toMatchObject({
      includedGranted: 3,
      includedRemaining: 3,
      packRemaining: 10,
      packHeld: 0,
    });

    await f.spend(account.id, 'document_credit', 3);
    const fromPack = await f.billing.reserve(reserveInput(account.id, 'document_credit'));
    expect(fromPack.ledger.pack_id).toBe(pack.id);
    expect(fromPack.balance).toMatchObject({ includedRemaining: 0, packRemaining: 9 });

    const [view] = await f.billing.packs(account.id);
    expect(view).toMatchObject({ id: pack.id, state: 'spendable', remainingUnits: 9, requiredPlan: null });

    // Owning a pack does not let Free buy another one (section 9).
    expect((await errorOf(f.billing.grantPack(account.id, 'document_s'))).code).toBe('not_purchasable');
  });

  it('held on Free: an action pack cannot be spent on Free and stays visible with its balance and expiry', async () => {
    const account = await f.paidAccount('professional', 'monthly', '2026-10-01T00:00:00Z');
    const pack = await f.billing.grantPack(account.id, 'action_s');
    f.clock.set('2026-11-01T00:00:00Z');
    await f.billing.endSubscription(account.id);

    const error = await errorOf(f.billing.reserve(reserveInput(account.id, 'action_pack')));
    expect(error.code).toBe('plan_upgrade_required');
    expect(error.details).toMatchObject({ unit: 'action_pack', minimumPlan: 'professional' });

    const ledger = await f.db.pool.query(`SELECT 1 FROM usage_ledger WHERE billing_account_id = $1`, [account.id]);
    expect(ledger.rowCount).toBe(0);
    const row = await f.db.pool.query(`SELECT remaining_units, status FROM packs WHERE id = $1`, [pack.id]);
    expect(row.rows[0]).toEqual({ remaining_units: 5, status: 'active' });

    expect(await f.billing.unitBalance(account.id, 'action_pack')).toMatchObject({ packRemaining: 0, packHeld: 5 });
    expect(await f.billing.packs(account.id)).toEqual([
      {
        id: pack.id,
        addonId: 'action_s',
        unit: 'action_pack',
        purchasedUnits: 5,
        remainingUnits: 5,
        revokedUnits: 0,
        purchasedAt: new Date('2026-10-05T12:00:00Z'),
        expiresAt: new Date('2027-10-05T12:00:00Z'),
        state: 'held',
        requiredPlan: 'professional',
      },
    ]);
  });

  it('usable again after re-subscribing: included units first, then the held pack, same expiry', async () => {
    const account = await f.paidAccount('professional', 'monthly', '2026-10-01T00:00:00Z');
    const pack = await f.billing.grantPack(account.id, 'action_s');
    f.clock.set('2026-11-01T00:00:00Z');
    await f.billing.endSubscription(account.id);
    expect((await errorOf(f.billing.reserve(reserveInput(account.id, 'action_pack')))).code).toBe(
      'plan_upgrade_required',
    );

    await resubscribe(account.id, 'professional', '2026-12-10T00:00:00Z');
    expect(await f.billing.unitBalance(account.id, 'action_pack')).toMatchObject({
      includedRemaining: 10,
      packRemaining: 5,
      packHeld: 0,
    });
    await f.spend(account.id, 'action_pack', 10);
    const fromPack = await f.billing.reserve(reserveInput(account.id, 'action_pack'));
    expect(fromPack.ledger.pack_id).toBe(pack.id);

    const [view] = await f.billing.packs(account.id);
    expect(view).toMatchObject({ state: 'spendable', remainingUnits: 4, expiresAt: pack.expires_at });
  });

  it('expires while held: the clock keeps running, and re-subscribing later does not bring it back', async () => {
    const account = await f.paidAccount('professional', 'monthly', '2026-10-01T00:00:00Z');
    const pack = await f.billing.grantPack(account.id, 'action_s');
    f.clock.set('2026-11-01T00:00:00Z');
    await f.billing.endSubscription(account.id);

    f.clock.set('2027-10-05T12:00:00Z');
    await f.billing.expirePacks();
    const row = await f.db.pool.query(`SELECT remaining_units, status FROM packs WHERE id = $1`, [pack.id]);
    expect(row.rows[0]).toEqual({ remaining_units: 5, status: 'expired' });
    const [view] = await f.billing.packs(account.id);
    expect(view).toMatchObject({ state: 'expired', remainingUnits: 5, requiredPlan: null });

    await resubscribe(account.id, 'professional', '2027-10-06T00:00:00Z');
    expect(await f.billing.unitBalance(account.id, 'action_pack')).toMatchObject({ packRemaining: 0, packHeld: 0 });
    await f.spend(account.id, 'action_pack', 10);
    const exhausted = await errorOf(f.billing.reserve(reserveInput(account.id, 'action_pack')));
    expect(exhausted.code).toBe('quota_exhausted');
    expect(exhausted.details).toMatchObject({ remaining: 0 });
  });

  it('a refund revokes only the unused units; used units stay used', async () => {
    const account = await f.paidAccount('starter', 'monthly', '2026-10-01T00:00:00Z');
    const pack = await f.billing.grantPack(account.id, 'document_s');
    await f.spend(account.id, 'document_credit', 20 + 2);
    const finishing = await f.billing.reserve(reserveInput(account.id, 'document_credit'));
    const failing = await f.billing.reserve(reserveInput(account.id, 'document_credit'));
    expect([finishing.ledger.pack_id, failing.ledger.pack_id]).toEqual([pack.id, pack.id]);

    f.clock.set('2026-10-08T00:00:00Z');
    const { pack: revoked, revokedNow } = await f.billing.revokePack(account.id, pack.id, 'refund');
    expect(revokedNow).toBe(6);
    expect(revoked).toMatchObject({
      status: 'revoked',
      remaining_units: 0,
      revoked_units: 6,
      revoke_reason: 'refund',
      revoked_at: new Date('2026-10-08T00:00:00Z'),
    });

    // Work in flight at refund time: a success counts as used, a failure is revoked.
    await f.billing.commit(account.id, finishing.ledger.id);
    await f.billing.release(account.id, failing.ledger.id);
    const after = await f.db.pool.query(
      `SELECT remaining_units, revoked_units, status FROM packs WHERE id = $1`,
      [pack.id],
    );
    expect(after.rows[0]).toEqual({ remaining_units: 0, revoked_units: 7, status: 'revoked' });

    const used = await f.db.pool.query<{ n: number }>(
      `SELECT count(*)::int AS n FROM usage_ledger WHERE pack_id = $1 AND state = 'committed'`,
      [pack.id],
    );
    expect(used.rows[0].n).toBe(3);
    expect(used.rows[0].n + after.rows[0].revoked_units).toBe(10);

    expect((await f.billing.revokePack(account.id, pack.id, 'refund')).revokedNow).toBe(0);
    expect((await errorOf(f.billing.reserve(reserveInput(account.id, 'document_credit')))).code).toBe('quota_exhausted');
    const [view] = await f.billing.packs(account.id);
    expect(view).toMatchObject({ state: 'revoked', remainingUnits: 0, revokedUnits: 7 });
  });

  it('a lapsed paid period grants no new month but still spends packs', async () => {
    const account = await f.paidAccount('starter', 'monthly', '2026-10-01T00:00:00Z');
    const pack = await f.billing.grantPack(account.id, 'document_s');
    await f.spend(account.id, 'document_credit', 5);

    f.clock.set('2026-11-02T00:00:00Z');
    await f.billing.renewDueAccounts();
    const fromPack = await f.billing.reserve(reserveInput(account.id, 'document_credit'));
    expect(fromPack.ledger.pack_id).toBe(pack.id);
    const balances = await f.db.pool.query(
      `SELECT included_remaining FROM usage_balances WHERE billing_account_id = $1 AND unit = 'document_credit'`,
      [account.id],
    );
    expect(balances.rows).toEqual([{ included_remaining: 15 }]);
  });
});
