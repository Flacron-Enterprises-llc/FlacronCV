import { ServiceUnavailableException } from '@nestjs/common';
import { lastValueFrom, of, defer } from 'rxjs';
import { AIService } from '../ai/ai.service';
import { CallerContextInterceptor, currentCaller, runWithCaller } from './caller-context';
import { CareerLedgerMeter, careerApiBase, Fetch } from './career-ledger-meter';
import { createUsageMeter } from './career-metering.module';
import type { UsageMeter } from './usage-meter';
import { V1CounterMeter } from './v1-counter-meter';

/**
 * PLAN_CONTRACT "Metering": V1's AI endpoints reserve/commit/release through
 * one UsageMeter — V1 counters, or the career ledger when CAREER_API_URL is
 * set. No real network: the career API is a fake `fetch`.
 */

function counters({ credit = true, analysis = { ok: true, counter: 'analyses' as const } } = {}) {
  return {
    reserveAiCredit: jest.fn().mockResolvedValue(credit),
    reserveAnalysis: jest.fn().mockResolvedValue(analysis),
    refundAiCredit: jest.fn().mockResolvedValue(undefined),
    refundUsage: jest.fn().mockResolvedValue(undefined),
  };
}

describe('V1CounterMeter', () => {
  it('reserves an AI credit, and a release refunds it exactly once', async () => {
    const c = counters();
    const meter = new V1CounterMeter(c);
    const outcome = await meter.reserve({ uid: 'u1', unit: 'document_credit', operation: 'ai.generate' });
    if (!outcome.ok) throw new Error('expected a reservation');
    expect(await outcome.reservation.release()).toBe(true);
    expect(await outcome.reservation.release()).toBe(true);
    expect(c.refundAiCredit).toHaveBeenCalledTimes(1);
  });

  it('a committed reservation is never refunded', async () => {
    const c = counters();
    const outcome = await new V1CounterMeter(c).reserve({ uid: 'u1', unit: 'document_credit', operation: 'ai.generate' });
    if (!outcome.ok) throw new Error('expected a reservation');
    await outcome.reservation.commit();
    expect(await outcome.reservation.release()).toBe(false);
    expect(c.refundAiCredit).not.toHaveBeenCalled();
  });

  it('an analysis on a legacy plan is charged (and refunded) as an AI credit', async () => {
    const c = counters({ analysis: { ok: true, counter: 'aiCredits' as never } });
    const outcome = await new V1CounterMeter(c).reserve({ uid: 'u1', unit: 'resume_analysis', operation: 'ai.ats-check' });
    if (!outcome.ok) throw new Error('expected a reservation');
    expect(outcome.reservation.counter).toBe('aiCredits');
    await outcome.reservation.release();
    expect(c.refundAiCredit).toHaveBeenCalledTimes(1);
    expect(c.refundUsage).not.toHaveBeenCalled();
  });

  it('reports exhaustion with the counter that ran out, and retries a failing refund three times', async () => {
    expect(await new V1CounterMeter(counters({ credit: false })).reserve({ uid: 'u1', unit: 'document_credit', operation: 'ai.generate' })).toEqual({
      ok: false,
      reason: 'exhausted',
      unit: 'document_credit',
      counter: 'aiCredits',
    });
    const c = counters();
    c.refundAiCredit.mockRejectedValue(new Error('firestore down'));
    const outcome = await new V1CounterMeter(c).reserve({ uid: 'u1', unit: 'document_credit', operation: 'ai.generate' });
    if (!outcome.ok) throw new Error('expected a reservation');
    expect(await outcome.reservation.release()).toBe(false);
    expect(c.refundAiCredit).toHaveBeenCalledTimes(3);
  });
});

/** A fake career API with one shared pool, keyed reservations and the real state rules. */
function fakeCareerApi(start = 1) {
  let remaining = start;
  const reservations = new Map<string, { id: string; state: 'reserved' | 'committed' | 'released'; key: string }>();
  const byKey = new Map<string, string>();
  const calls: Array<{ url: string; headers: Record<string, string>; body: unknown }> = [];
  let topUpEligible = false;
  let down = false;
  const fetch: Fetch = async (url, init) => {
    calls.push({ url, headers: init.headers, body: init.body ? JSON.parse(init.body) : null });
    if (down) throw new Error('ECONNREFUSED');
    const json = (status: number, body: unknown) => ({ status, json: async () => body });
    const action = /reservations\/([^/]+)\/(commit|release)$/.exec(url);
    if (!action) {
      const key = init.headers['Idempotency-Key'];
      const existing = byKey.get(key);
      if (existing) return json(201, { reservationId: existing, state: reservations.get(existing)!.state, replayed: true });
      if (remaining <= 0) {
        return json(402, {
          code: 'quota_exhausted',
          unit: 'document_credit',
          remaining: 0,
          renewalDate: '2026-12-01T00:00:00.000Z',
          topUp: topUpEligible ? { eligible: true, addonId: 'document_s' } : { eligible: false, reason: 'not_enabled' },
        });
      }
      remaining -= 1;
      const id = `r${reservations.size + 1}`;
      reservations.set(id, { id, state: 'reserved', key });
      byKey.set(key, id);
      return json(201, { reservationId: id, state: 'reserved', replayed: false });
    }
    const r = reservations.get(action[1])!;
    if (action[2] === 'commit') {
      if (r.state === 'released') return json(409, { code: 'reservation_closed', state: 'released' });
      r.state = 'committed';
      return json(200, { reservationId: r.id, state: 'committed' });
    }
    if (r.state === 'committed') return json(409, { code: 'reservation_closed', state: 'committed' });
    if (r.state === 'reserved') remaining += 1;
    r.state = 'released';
    return json(200, { reservationId: r.id, state: 'released' });
  };
  return {
    fetch,
    calls,
    get remaining() {
      return remaining;
    },
    addUnits: (n: number) => {
      remaining += n;
    },
    allowTopUp: () => {
      topUpEligible = true;
    },
    setDown: (value: boolean) => {
      down = value;
    },
  };
}

const caller = (uid = 'u1', idempotencyKey: string | null = null) => ({ idToken: `token-of-${uid}`, uid, idempotencyKey });

describe('CareerLedgerMeter', () => {
  it('forwards the caller’s own ID token to the career API and commits on success', async () => {
    const api = fakeCareerApi(2);
    const meter = new CareerLedgerMeter('http://career.local:4101/', null, api.fetch);
    await runWithCaller(caller(), async () => {
      const outcome = await meter.reserve({ uid: 'u1', unit: 'document_credit', operation: 'ai.generate' });
      if (!outcome.ok) throw new Error('expected a reservation');
      await outcome.reservation.commit();
    });
    expect(api.calls[0].url).toBe('http://career.local:4101/api/career/v1/metering/reservations');
    expect(api.calls[0].headers.Authorization).toBe('Bearer token-of-u1');
    expect(api.calls[0].body).toEqual({ unit: 'document_credit', operation: 'ai.generate' });
    expect(api.calls[1].url).toMatch(/\/reservations\/r1\/commit$/);
    expect(api.remaining).toBe(1);
  });

  it('two concurrent requests with one credit left: exactly one runs', async () => {
    const api = fakeCareerApi(1);
    const meter = new CareerLedgerMeter('http://career.local', null, api.fetch);
    const outcomes = await runWithCaller(caller(), () =>
      Promise.all([
        meter.reserve({ uid: 'u1', unit: 'document_credit', operation: 'ai.generate' }),
        meter.reserve({ uid: 'u1', unit: 'document_credit', operation: 'ai.generate' }),
      ]),
    );
    expect(outcomes.filter((o) => o.ok)).toHaveLength(1);
    expect(outcomes.find((o) => !o.ok)).toMatchObject({ reason: 'exhausted', renewalDate: '2026-12-01T00:00:00.000Z' });
  });

  it('a retry with the same Idempotency-Key is the same reservation: no second debit', async () => {
    const api = fakeCareerApi(5);
    const meter = new CareerLedgerMeter('http://career.local', null, api.fetch);
    await runWithCaller(caller('u1', 'client-key-1'), async () => {
      const a = await meter.reserve({ uid: 'u1', unit: 'document_credit', operation: 'ai.generate' });
      const b = await meter.reserve({ uid: 'u1', unit: 'document_credit', operation: 'ai.generate' });
      expect(a.ok && b.ok).toBe(true);
    });
    expect(api.remaining).toBe(4);
    expect(api.calls[0].headers['Idempotency-Key']).toBe('v1:u1:ai.generate:client-key-1');
  });

  it('a failed AI call releases the reservation; a late commit is not charged', async () => {
    const api = fakeCareerApi(1);
    const meter = new CareerLedgerMeter('http://career.local', null, api.fetch);
    await runWithCaller(caller(), async () => {
      const outcome = await meter.reserve({ uid: 'u1', unit: 'document_credit', operation: 'ai.generate' });
      if (!outcome.ok) throw new Error('expected a reservation');
      expect(await outcome.reservation.release('provider_failed')).toBe(true);
      await outcome.reservation.commit();
    });
    expect(api.remaining).toBe(1);
    expect(api.calls.filter((c) => c.url.endsWith('/commit'))).toHaveLength(0);
  });

  it('fails closed without a caller token, for another uid, or when the career API is unreachable', async () => {
    const api = fakeCareerApi(3);
    const meter = new CareerLedgerMeter('http://career.local', null, api.fetch);
    expect(await meter.reserve({ uid: 'u1', unit: 'document_credit', operation: 'ai.generate' })).toMatchObject({ ok: false, reason: 'unavailable' });
    await runWithCaller(caller('someone-else'), async () => {
      expect(await meter.reserve({ uid: 'u1', unit: 'document_credit', operation: 'ai.generate' })).toMatchObject({ ok: false, reason: 'unavailable' });
    });
    api.setDown(true);
    await runWithCaller(caller(), async () => {
      expect(await meter.reserve({ uid: 'u1', unit: 'document_credit', operation: 'ai.generate' })).toMatchObject({ ok: false, reason: 'unavailable' });
    });
    expect(api.remaining).toBe(3);
  });

  it('charges an automatic top-up only when the career service says the person opted in, then reserves once more', async () => {
    const api = fakeCareerApi(0);
    const topUp = { charge: jest.fn(async () => {
      api.addUnits(10);
      return true;
    }) };
    const meter = new CareerLedgerMeter('http://career.local', topUp, api.fetch);
    await runWithCaller(caller(), async () => {
      expect(await meter.reserve({ uid: 'u1', unit: 'document_credit', operation: 'ai.generate' })).toMatchObject({ ok: false, reason: 'exhausted' });
      expect(topUp.charge).not.toHaveBeenCalled();
      api.allowTopUp();
      const outcome = await meter.reserve({ uid: 'u1', unit: 'document_credit', operation: 'ai.generate' });
      expect(outcome.ok).toBe(true);
    });
    expect(topUp.charge).toHaveBeenCalledTimes(1);
    expect(topUp.charge).toHaveBeenCalledWith('u1', 'document_s', expect.any(String));
    expect(api.remaining).toBe(9);
  });

  it('normalises the career API origin', () => {
    expect(careerApiBase('https://career.example.test')).toBe('https://career.example.test/api/career/v1');
    expect(careerApiBase('https://career.example.test/api/career/v1/')).toBe('https://career.example.test/api/career/v1');
  });
});

describe('createUsageMeter', () => {
  const users = counters() as never;
  it('uses V1 counters unless CAREER_API_URL is set', () => {
    expect(createUsageMeter({}, users, null).kind).toBe('v1_counters');
    expect(createUsageMeter({ CAREER_API_URL: 'http://localhost:4101' }, users, null).kind).toBe('career_ledger');
  });
  it('refuses a non-https career URL in production (ID tokens are forwarded)', () => {
    expect(() => createUsageMeter({ CAREER_API_URL: 'http://career.internal', NODE_ENV: 'production' }, users, null)).toThrow(/https/);
    expect(() => createUsageMeter({ CAREER_API_URL: 'career.internal' }, users, null)).toThrow();
  });
});

describe('CallerContextInterceptor', () => {
  const ctx = (headers: Record<string, string>, uid = 'u1') =>
    ({ getType: () => 'http', switchToHttp: () => ({ getRequest: () => ({ headers, user: { uid } }) }) }) as never;

  it('exposes the bearer token, uid and Idempotency-Key to the handler only', async () => {
    const interceptor = new CallerContextInterceptor();
    const seen = await lastValueFrom(
      interceptor.intercept(ctx({ authorization: 'Bearer abc.def', 'idempotency-key': 'k-1' }), { handle: () => defer(async () => currentCaller()) }),
    );
    expect(seen).toEqual({ idToken: 'abc.def', uid: 'u1', idempotencyKey: 'k-1' });
    expect(currentCaller()).toBeNull();
    const none = await lastValueFrom(interceptor.intercept(ctx({}), { handle: () => of(currentCaller()) }));
    expect(none).toBeNull();
  });
});

describe('AIService through the UsageMeter', () => {
  const provider = (ok: boolean) => ({
    name: 'openai',
    isAvailable: jest.fn().mockResolvedValue(true),
    generateText: ok
      ? jest.fn().mockResolvedValue({ content: 'ok', provider: 'openai', model: 'm', tokensUsed: 1, latencyMs: 1 })
      : jest.fn().mockRejectedValue(Object.assign(new Error('down'), { status: 503 })),
  });
  const abuse = { assertNewConsumption: jest.fn().mockResolvedValue(undefined) };

  function ledgerService(api: ReturnType<typeof fakeCareerApi>, ok: boolean) {
    const meter: UsageMeter = new CareerLedgerMeter('http://career.local', null, api.fetch);
    return new AIService(provider(ok) as never, counters() as never, abuse as never, meter);
  }

  it('commits the shared-pool unit on success', async () => {
    const api = fakeCareerApi(2);
    await runWithCaller(caller(), () => ledgerService(api, true).generate('p', {}, 'u1'));
    expect(api.remaining).toBe(1);
    expect(api.calls.some((c) => c.url.endsWith('/commit'))).toBe(true);
  });

  it('releases the unit when generation fails and says so', async () => {
    const api = fakeCareerApi(1);
    const error = await runWithCaller(caller(), () => ledgerService(api, false).generate('p', {}, 'u1')).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ServiceUnavailableException);
    expect((error as ServiceUnavailableException).getResponse()).toMatchObject({ code: 'AI_CREDIT_REFUNDED' });
    expect(api.remaining).toBe(1);
  });

  it('an ATS check spends a résumé analysis, and the exhausted message is the analyses one', async () => {
    const api = fakeCareerApi(0);
    const error = await runWithCaller(caller(), () => ledgerService(api, true).generate('p', {}, 'u1', 'analyses')).catch((e: unknown) => e);
    expect((error as ServiceUnavailableException).getResponse()).toMatchObject({ code: 'ANALYSES_EXHAUSTED' });
    expect(api.calls[0].body).toEqual({ unit: 'resume_analysis', operation: 'ai.ats-check' });
  });

  it('fails closed (no provider call) when the ledger cannot be reached', async () => {
    const api = fakeCareerApi(1);
    api.setDown(true);
    const p = provider(true);
    const service = new AIService(p as never, counters() as never, abuse as never, new CareerLedgerMeter('http://career.local', null, api.fetch));
    const error = await runWithCaller(caller(), () => service.generate('p', {}, 'u1')).catch((e: unknown) => e);
    expect((error as ServiceUnavailableException).getResponse()).toMatchObject({ code: 'USAGE_METER_UNAVAILABLE' });
    expect(p.generateText).not.toHaveBeenCalled();
  });
});
