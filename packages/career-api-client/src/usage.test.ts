import { describe, expect, it } from 'vitest';
import { createApiClient } from './client';
import type { FetchLike } from './client';

interface Call {
  url: string;
  init: RequestInit;
}

function client(body: unknown, calls: Call[]) {
  const fetch: FetchLike = async (url, init) => {
    calls.push({ url, init });
    return new Response(JSON.stringify(body), { status: 200 });
  };
  return createApiClient({ baseUrl: 'http://localhost:4101', getToken: async () => 'token', fetch });
}

describe('usage page methods', () => {
  it('marks warnings seen, by id or all', async () => {
    const calls: Call[] = [];
    const api = client({ marked: 1 }, calls);
    await api.markUsageWarningsSeen(['6f1c2a52-6a0e-4d43-9d3c-2c8f1f0d6a11']);
    await api.markUsageWarningsSeen();
    expect(calls.map((c) => [c.init.method, c.url])).toEqual([
      ['POST', 'http://localhost:4101/api/career/v1/usage/warnings/seen'],
      ['POST', 'http://localhost:4101/api/career/v1/usage/warnings/seen'],
    ]);
    expect(JSON.parse(String(calls[0].init.body))).toEqual({ ids: ['6f1c2a52-6a0e-4d43-9d3c-2c8f1f0d6a11'] });
    expect(JSON.parse(String(calls[1].init.body))).toEqual({});
  });

  it('sets the spending cap and the top-up opt-in with explicit consent', async () => {
    const calls: Call[] = [];
    const api = client({ enabled: true, spendingCapCents: 1500, consentAt: '2026-11-14T00:00:00.000Z', spentThisPeriodCents: 0, addons: {} }, calls);
    await api.setSpendingCap(1500);
    const topUp = await api.setTopUp({ enabled: true, consent: true, addons: { document_credit: 'document_m' } });
    expect(topUp.enabled).toBe(true);
    expect(calls.map((c) => [c.init.method, c.url])).toEqual([
      ['PATCH', 'http://localhost:4101/api/career/v1/billing/spending-cap'],
      ['PATCH', 'http://localhost:4101/api/career/v1/billing/top-up'],
    ]);
    expect(JSON.parse(String(calls[1].init.body))).toEqual({ enabled: true, consent: true, addons: { document_credit: 'document_m' } });
  });
});
