/**
 * Unified metering for V1's AI endpoints (PLAN_CONTRACT "Metering") and the
 * spec section 13 billing acceptance scenarios it touches.
 */
import { randomUUID } from 'crypto';
import { CATALOG_VERSION } from '@flacroncv/career-shared';
import { createBillingFixture, BillingFixture } from '../testing';
import { applyMappedPlan } from '../integration/v1-plan-bridge';
import type { AccountRow } from '../billing/accounts';
import { BillingError } from '../billing/errors';
import { MeteringService } from './metering.service';
import type { Spender } from './metering.service';
import { RemoteMeteringService } from './remote-metering';

async function errorOf(promise: Promise<unknown>): Promise<BillingError> {
  const error = await promise.then(
    () => undefined,
    (e: unknown) => e,
  );
  if (!(error instanceof BillingError)) throw new Error(`expected a BillingError, got ${String(error)}`);
  return error;
}

describe('RemoteMeteringService', () => {
  let f: BillingFixture;
  let meter: RemoteMeteringService;

  beforeAll(async () => {
    f = await createBillingFixture('remote_meter', '2026-10-05T12:00:00Z');
    meter = new RemoteMeteringService(f.db.pool, f.clock);
  });
  afterAll(async () => {
    if (f) await f.drop();
  });
  afterEach(() => f.clock.set('2026-10-05T12:00:00Z'));

  async function account(plan: 'free' | 'starter' | 'professional' = 'starter', packs: Array<{ addonId: string; purchasedAt: string }> = []) {
    const row: AccountRow = await f.freeAccount({ anchor: '2026-01-10T09:00:00Z' });
    await applyMappedPlan(
      f.db.pool,
      row.id,
      {
        enabled: true,
        v1Plan: plan,
        careerPlan: plan,
        source: 'v1_plan_map',
        billing: {
          accountCreatedAt: new Date('2026-01-10T09:00:00Z'),
          periodStart: plan === 'free' ? null : new Date('2026-10-01T08:00:00Z'),
          periodEnd: plan === 'free' ? null : new Date('2026-11-01T08:00:00Z'),
          status: 'active',
          packPurchases: packs.map((p) => ({
            purchaseRef: `cs_${randomUUID()}`,
            addonId: p.addonId,
            purchasedAt: new Date(p.purchasedAt),
            amountCents: 499,
            currency: 'usd',
            status: 'paid' as const,
          })),
        },
      },
      CATALOG_VERSION,
      f.clock.now(),
    );
    const spender: Spender = { billingAccountId: row.id, workspaceId: row.workspace_id, authUserId: row.auth_user_id as string };
    return spender;
  }

  async function drain(spender: Spender, unit: string, leave: number) {
    const res = await f.db.pool.query<{ included_remaining: number }>(
      `SELECT included_remaining FROM usage_balances WHERE billing_account_id = $1 AND unit = $2 ORDER BY allowance_period_start DESC LIMIT 1`,
      [spender.billingAccountId, unit],
    );
    await f.spend(spender.billingAccountId, unit, res.rows[0].included_remaining - leave);
  }

  it('reserves, commits and reports the remaining balance and renewal date', async () => {
    const spender = await account('starter');
    const reserved = await meter.reserve(spender, { unit: 'document_credit', operation: 'ai.generate', idempotencyKey: 'k1' });
    expect(reserved.state).toBe('reserved');
    expect(reserved.usage.includedRemaining).toBe(19);
    expect(reserved.usage.renewalDate).toBe('2026-11-01T08:00:00.000Z');
    expect(reserved.expiresAt).toBe('2026-10-05T12:05:00.000Z');
    const committed = await meter.commit(spender, reserved.reservationId);
    expect(committed.state).toBe('committed');
    expect(committed.expiresAt).toBeNull();
    // Commit is idempotent.
    expect((await meter.commit(spender, reserved.reservationId)).usage.includedRemaining).toBe(19);
  });

  it('retrying with the same key returns the same reservation without a second debit', async () => {
    const spender = await account('starter');
    const first = await meter.reserve(spender, { unit: 'resume_analysis', operation: 'ai.ats-check', idempotencyKey: 'same' });
    const again = await meter.reserve(spender, { unit: 'resume_analysis', operation: 'ai.ats-check', idempotencyKey: 'same' });
    expect(again.reservationId).toBe(first.reservationId);
    expect(again.replayed).toBe(true);
    expect(again.usage.includedRemaining).toBe(14);
    await meter.commit(spender, first.reservationId);
    const afterCommit = await meter.reserve(spender, { unit: 'resume_analysis', operation: 'ai.ats-check', idempotencyKey: 'same' });
    expect(afterCommit.state).toBe('committed');
    expect(afterCommit.usage.includedRemaining).toBe(14);
    // The same key for another unit or operation is a different request.
    expect((await errorOf(meter.reserve(spender, { unit: 'document_credit', operation: 'ai.ats-check', idempotencyKey: 'same' }))).code).toBe('idempotency_mismatch');
  });

  it('two concurrent requests with one credit left: exactly one succeeds', async () => {
    const spender = await account('starter');
    await drain(spender, 'document_credit', 1);
    const results = await Promise.allSettled([
      meter.reserve(spender, { unit: 'document_credit', operation: 'ai.generate', idempotencyKey: 'c1' }),
      meter.reserve(spender, { unit: 'document_credit', operation: 'ai.generate', idempotencyKey: 'c2' }),
    ]);
    const ok = results.filter((r) => r.status === 'fulfilled');
    const failed = results.filter((r): r is PromiseRejectedResult => r.status === 'rejected');
    expect(ok).toHaveLength(1);
    expect(failed).toHaveLength(1);
    expect((failed[0].reason as BillingError).code).toBe('quota_exhausted');
    // Not opted in: no top-up is offered.
    expect((failed[0].reason as BillingError).details.topUp).toEqual({ eligible: false, reason: 'not_enabled' });
  });

  it('a failed request releases its reservation, and a released reservation cannot be committed', async () => {
    const spender = await account('starter');
    const reserved = await meter.reserve(spender, { unit: 'document_credit', operation: 'ai.generate', idempotencyKey: 'fail-1' });
    const released = await meter.release(spender, reserved.reservationId, 'provider_failed');
    expect(released.state).toBe('released');
    expect(released.usage.includedRemaining).toBe(20);
    expect((await meter.release(spender, reserved.reservationId)).state).toBe('released');
    expect((await errorOf(meter.commit(spender, reserved.reservationId))).code).toBe('reservation_closed');
  });

  it('a committed reservation is never given back by a late release', async () => {
    const spender = await account('starter');
    const reserved = await meter.reserve(spender, { unit: 'document_credit', operation: 'ai.generate', idempotencyKey: 'late' });
    await meter.commit(spender, reserved.reservationId);
    expect((await errorOf(meter.release(spender, reserved.reservationId))).code).toBe('reservation_closed');
  });

  it('an abandoned reservation is released by the worker sweep after its TTL; a late commit is refused', async () => {
    const spender = await account('starter');
    const reserved = await meter.reserve(spender, { unit: 'document_credit', operation: 'ai.generate', idempotencyKey: 'abandon', ttlMs: 60_000 });
    f.clock.set('2026-10-05T12:02:00Z');
    const sweeper = new MeteringService(f.db.pool, f.clock, { heartbeatEveryMs: 0 });
    expect(await sweeper.releaseAbandoned(10 * 60_000)).toBeGreaterThanOrEqual(1);
    const view = await meter.get(spender, reserved.reservationId);
    expect(view.state).toBe('released');
    expect(view.usage.includedRemaining).toBe(20);
    expect((await errorOf(meter.commit(spender, reserved.reservationId))).code).toBe('reservation_closed');
  });

  it('spends included units first, then the pack that expires first', async () => {
    const spender = await account('starter', [
      { addonId: 'document_m', purchasedAt: '2026-09-01T00:00:00Z' },
      { addonId: 'document_s', purchasedAt: '2026-08-01T00:00:00Z' },
    ]);
    await drain(spender, 'document_credit', 0);
    const r = await meter.reserve(spender, { unit: 'document_credit', operation: 'ai.generate', idempotencyKey: 'pack-1' });
    await meter.commit(spender, r.reservationId);
    const packs = await f.db.pool.query<{ addon_id: string; remaining_units: number }>(
      `SELECT addon_id, remaining_units FROM packs WHERE billing_account_id = $1 ORDER BY expires_at`,
      [spender.billingAccountId],
    );
    expect(packs.rows).toEqual([
      { addon_id: 'document_s', remaining_units: 9 },
      { addon_id: 'document_m', remaining_units: 30 },
    ]);
    expect(r.usage.packRemaining).toBe(39);

    // An expired pack is skipped.
    f.clock.set('2027-08-02T00:00:00Z');
    await f.db.pool.query(`UPDATE billing_accounts SET allowance_period_end = $2 WHERE id = $1`, [spender.billingAccountId, new Date('2027-08-01T00:00:00Z')]);
    const later = await meter.reserve(spender, { unit: 'document_credit', operation: 'ai.generate', idempotencyKey: 'pack-2' });
    await meter.release(spender, later.reservationId);
    const used = await f.db.pool.query<{ pack_id: string }>(`SELECT pack_id FROM usage_ledger WHERE idempotency_key = 'pack-2' AND billing_account_id = $1`, [spender.billingAccountId]);
    const m = await f.db.pool.query<{ id: string }>(`SELECT id FROM packs WHERE billing_account_id = $1 AND addon_id = 'document_m'`, [spender.billingAccountId]);
    expect(used.rows[0].pack_id).toBe(m.rows[0].id);
  });

  it('records the 80, 95 and 100 percent warnings once per month', async () => {
    const spender = await account('starter');
    await drain(spender, 'document_credit', 1);
    const last = await meter.reserve(spender, { unit: 'document_credit', operation: 'ai.generate', idempotencyKey: 'warn' });
    await meter.commit(spender, last.reservationId);
    const warnings = await f.db.pool.query<{ threshold: number }>(
      `SELECT threshold FROM usage_warnings WHERE billing_account_id = $1 AND unit = 'document_credit' ORDER BY threshold`,
      [spender.billingAccountId],
    );
    expect(warnings.rows.map((w) => w.threshold)).toEqual([80, 95, 100]);
  });

  it('only meters the two V1 units and needs a key', async () => {
    const spender = await account('starter');
    expect((await errorOf(meter.reserve(spender, { unit: 'action_pack', operation: 'ai.generate', idempotencyKey: 'x' }))).code).toBe('validation_error');
    expect((await errorOf(meter.reserve(spender, { unit: 'document_credit', operation: 'ai.generate', idempotencyKey: ' ' }))).code).toBe('validation_error');
    expect((await errorOf(meter.reserve(spender, { unit: 'document_credit', operation: 'Bad Op', idempotencyKey: 'y' }))).code).toBe('validation_error');
  });

  it('cannot touch another account’s reservation', async () => {
    const a = await account('starter');
    const b = await account('starter');
    const reserved = await meter.reserve(a, { unit: 'document_credit', operation: 'ai.generate', idempotencyKey: 'mine' });
    expect((await errorOf(meter.commit(b, reserved.reservationId))).code).toBe('not_found');
  });

  it('Free has its own small allowance in the same pool', async () => {
    const spender = await account('free');
    const r = await meter.reserve(spender, { unit: 'document_credit', operation: 'ai.generate', idempotencyKey: 'free-1' });
    expect(r.usage.includedGranted).toBe(3);
  });
});
