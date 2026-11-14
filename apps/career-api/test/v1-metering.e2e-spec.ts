import request from 'supertest';
import { parseCareerPlanMap } from '@flacroncv/career-server';
import type { CareerPlanMap, V1AccountSnapshot } from '@flacroncv/career-server';
import { bearer } from '@flacroncv/career-server/src/testing';
import { addMonthsUtc } from '@flacroncv/career-server/src/billing/periods';
import { createTestApp, TestApp } from './support';

/**
 * Five-plan model through the real V1 bridge: V1's AI endpoints spend the
 * same career ledger (reservations), the usage page, the top-up opt-in and
 * Free after cancellation. Fictional accounts only.
 */
describe('unified metering and usage (V1 bridge)', () => {
  let t: TestApp;
  // The metering service reads the real clock, so the V1 period is placed around today.
  const DAY = 24 * 60 * 60 * 1000;
  let now = new Date();
  const periodStart = new Date(Math.floor((Date.now() - 4 * DAY) / 1000) * 1000);
  const renewal = addMonthsUtc(periodStart, 1).toISOString();
  const created = new Date(periodStart.getTime() - 200 * DAY);
  const accounts = new Map<string, V1AccountSnapshot>();
  const map: CareerPlanMap = parseCareerPlanMap('');
  const http = () => request(t.app.getHttpServer());
  const base = '/api/career/v1';

  const paid = (uid: string, plan: 'starter' | 'professional', extra: Partial<NonNullable<V1AccountSnapshot['billing']>> = {}) =>
    accounts.set(uid, {
      uid,
      plan,
      active: true,
      billing: {
        accountCreatedAt: created,
        periodStart,
        periodEnd: new Date(renewal),
        status: 'active',
        ...extra,
      },
    });

  const reserve = (uid: string, key: string, unit = 'document_credit') =>
    http().post(`${base}/metering/reservations`).set('Authorization', bearer(uid)).set('Idempotency-Key', key).send({ unit, operation: 'ai.generate' });

  beforeAll(async () => {
    t = await createTestApp('api_v1_metering', { v1: { accounts, map, clock: { now: () => now } } });
  });
  afterAll(async () => {
    if (t) await t.close();
  });

  it('reserve, commit and the usage page share one pool; a retry with the same key does not debit twice', async () => {
    paid('meter-ann', 'starter');
    const first = await reserve('meter-ann', 'gen-1');
    expect(first.status).toBe(201);
    expect(first.body).toMatchObject({ state: 'reserved', unit: 'document_credit', usage: { includedRemaining: 19, renewalDate: renewal } });
    const retry = await reserve('meter-ann', 'gen-1');
    expect(retry.body).toMatchObject({ reservationId: first.body.reservationId, replayed: true, usage: { includedRemaining: 19 } });
    const commit = await http().post(`${base}/metering/reservations/${first.body.reservationId}/commit`).set('Authorization', bearer('meter-ann'));
    expect(commit.status).toBe(200);
    expect(commit.body.state).toBe('committed');

    const usage = await http().get(`${base}/usage`).set('Authorization', bearer('meter-ann'));
    expect(usage.status).toBe(200);
    expect(usage.body.units.find((u: { unit: string }) => u.unit === 'document_credit')).toMatchObject({ granted: 20, used: 1, remaining: 19 });
    expect(usage.body.renewalBasis).toBe('billing_anniversary');
  });

  it('two concurrent requests for the last credit: exactly one succeeds; a failed request is released', async () => {
    paid('meter-bob', 'starter');
    for (let i = 0; i < 19; i += 1) {
      const r = await reserve('meter-bob', `fill-${i}`);
      await http().post(`${base}/metering/reservations/${r.body.reservationId}/commit`).set('Authorization', bearer('meter-bob'));
    }
    const [a, b] = await Promise.all([reserve('meter-bob', 'race-a'), reserve('meter-bob', 'race-b')]);
    const statuses = [a.status, b.status].sort();
    expect(statuses).toEqual([201, 402]);
    const lost = a.status === 402 ? a : b;
    expect(lost.body).toMatchObject({ code: 'quota_exhausted', unit: 'document_credit', topUp: { eligible: false, reason: 'not_enabled' } });

    const won = a.status === 201 ? a : b;
    const released = await http()
      .post(`${base}/metering/reservations/${won.body.reservationId}/release`)
      .set('Authorization', bearer('meter-bob'))
      .send({ reason: 'provider_failed' });
    expect(released.body).toMatchObject({ state: 'released', usage: { includedRemaining: 1 } });
    const late = await http().post(`${base}/metering/reservations/${won.body.reservationId}/commit`).set('Authorization', bearer('meter-bob'));
    expect(late.status).toBe(409);
    expect(late.body).toEqual({ code: 'reservation_closed', state: 'released' });
  });

  it('warnings can be marked seen; the spending cap and top-up opt-in are explicit and off by default', async () => {
    paid('meter-cat', 'starter');
    for (let i = 0; i < 16; i += 1) {
      const r = await reserve('meter-cat', `w-${i}`);
      await http().post(`${base}/metering/reservations/${r.body.reservationId}/commit`).set('Authorization', bearer('meter-cat'));
    }
    let usage = await http().get(`${base}/usage`).set('Authorization', bearer('meter-cat'));
    expect(usage.body.warnings.map((w: { threshold: number }) => w.threshold)).toEqual([80]);
    expect(usage.body.topUp).toMatchObject({ enabled: false, spendingCapCents: null });
    const seen = await http().post(`${base}/usage/warnings/seen`).set('Authorization', bearer('meter-cat')).send({});
    expect(seen.body).toEqual({ marked: 1 });

    const noCap = await http().patch(`${base}/billing/top-up`).set('Authorization', bearer('meter-cat')).send({ enabled: true, consent: true });
    expect(noCap.status).toBe(400);
    const cap = await http().patch(`${base}/billing/spending-cap`).set('Authorization', bearer('meter-cat')).send({ spendingCapCents: 1500 });
    expect(cap.status).toBe(200);
    expect(cap.body).toMatchObject({ enabled: false, spendingCapCents: 1500 });
    const noConsent = await http().patch(`${base}/billing/top-up`).set('Authorization', bearer('meter-cat')).send({ enabled: true });
    expect(noConsent.status).toBe(400);
    const on = await http().patch(`${base}/billing/top-up`).set('Authorization', bearer('meter-cat')).send({ enabled: true, consent: true });
    expect(on.status).toBe(200);
    expect(on.body.enabled).toBe(true);
    usage = await http().get(`${base}/usage`).set('Authorization', bearer('meter-cat'));
    expect(usage.body.warnings).toEqual([]);
  });

  it('a pack paid through V1 shows its balance and expiry', async () => {
    paid('meter-dan', 'starter', {
      packPurchases: [{ purchaseRef: 'cs_test_dan', addonId: 'document_s', purchasedAt: new Date(periodStart.getTime() + DAY), amountCents: 499, currency: 'usd', status: 'paid' }],
    });
    const usage = await http().get(`${base}/usage`).set('Authorization', bearer('meter-dan'));
    expect(usage.body.packs).toEqual([expect.objectContaining({ addonId: 'document_s', remainingUnits: 10, expiresAt: addMonthsUtc(new Date(periodStart.getTime() + DAY), 12).toISOString(), state: 'spendable' })]);
    expect(usage.body.units.find((u: { unit: string }) => u.unit === 'document_credit')).toMatchObject({ remaining: 30 });
  });

  it('after cancellation the account is Free and keeps working; an operator "none" map still lets it read', async () => {
    paid('meter-eve', 'professional');
    expect((await http().get(`${base}/usage`).set('Authorization', bearer('meter-eve'))).body.planId).toBe('professional');

    accounts.set('meter-eve', { uid: 'meter-eve', plan: 'free', active: true, billing: { accountCreatedAt: created } });
    now = new Date(now.getTime() + 31_000);
    const usage = await http().get(`${base}/usage`).set('Authorization', bearer('meter-eve'));
    expect(usage.status).toBe(200);
    expect(usage.body).toMatchObject({ planId: 'free', renewalBasis: 'account_anniversary' });

    map.free = null;
    try {
      now = new Date(now.getTime() + 31_000);
      const read = await http().get(`${base}/usage`).set('Authorization', bearer('meter-eve'));
      expect(read.status).toBe(200);
      const write = await reserve('meter-eve', 'after-unmap');
      expect(write.status).toBe(403);
      expect(write.body).toMatchObject({ code: 'feature_unavailable' });
      // Someone who never had a career account is not provisioned by a read.
      accounts.set('meter-new', { uid: 'meter-new', plan: 'free', active: true });
      expect((await http().get(`${base}/usage`).set('Authorization', bearer('meter-new'))).status).toBe(403);
    } finally {
      map.free = 'free';
    }
  });

  it('only the two V1 units can be reserved, with a key', async () => {
    paid('meter-fay', 'starter');
    expect((await reserve('meter-fay', 'k', 'action_pack')).status).toBe(400);
    const noKey = await http().post(`${base}/metering/reservations`).set('Authorization', bearer('meter-fay')).send({ unit: 'document_credit', operation: 'ai.generate' });
    expect(noKey.status).toBe(400);
  });
});
