import { describe, expect, it } from 'vitest';
import { ApiError, createApiClient, fieldErrors, isApiError } from './client';
import type { FetchLike } from './client';

interface Call {
  url: string;
  init: RequestInit;
}

function fakeFetch(status: number, body: unknown, calls: Call[] = []): FetchLike {
  return async (url, init) => {
    calls.push({ url, init });
    const text = body === undefined ? '' : typeof body === 'string' ? body : JSON.stringify(body);
    return new Response(text, { status });
  };
}

function headers(call: Call): Record<string, string> {
  return call.init.headers as Record<string, string>;
}

describe('createApiClient', () => {
  it('sends the bearer token on every authenticated call, fetched per request', async () => {
    const calls: Call[] = [];
    let token = 'first';
    const api = createApiClient({
      baseUrl: 'http://localhost:3000/',
      getToken: async () => token,
      fetch: fakeFetch(200, { items: [], profileVersion: 0 }, calls),
    });
    await api.facts();
    token = 'refreshed';
    await api.facts();
    expect(calls.map((c) => c.url)).toEqual(['http://localhost:3000/api/career/v1/facts', 'http://localhost:3000/api/career/v1/facts']);
    expect(headers(calls[0]).Authorization).toBe('Bearer first');
    expect(headers(calls[1]).Authorization).toBe('Bearer refreshed');
  });

  it('puts the ID token in the body for POST /session and sends no header', async () => {
    const calls: Call[] = [];
    const api = createApiClient({ baseUrl: 'http://api', getToken: async () => null, fetch: fakeFetch(200, { user: {} }, calls) });
    await api.session('id-token', 'fr');
    expect(headers(calls[0]).Authorization).toBeUndefined();
    expect(JSON.parse(String(calls[0].init.body))).toEqual({ idToken: 'id-token', locale: 'fr' });
  });

  it('refuses to call an authenticated route while signed out', async () => {
    const calls: Call[] = [];
    const api = createApiClient({ baseUrl: 'http://api', getToken: async () => null, fetch: fakeFetch(200, {}, calls) });
    await expect(api.me()).rejects.toMatchObject({ code: 'unauthenticated', status: 401 });
    expect(calls).toHaveLength(0);
  });

  it('turns a contract error body into an ApiError with its fields', async () => {
    const api = createApiClient({
      baseUrl: 'http://api',
      getToken: async () => 't',
      fetch: fakeFetch(429, { code: 'import_daily_limit', limit: 10, used: 10, resetsAt: '2026-10-17T00:00:00.000Z' }),
    });
    const error = await api.importResume({ text: 'x', format: 'text' }).catch((e: unknown) => e);
    expect(isApiError(error, 'import_daily_limit')).toBe(true);
    expect(error).toBeInstanceOf(ApiError);
    if (isApiError(error)) expect(error.body.limit).toBe(10);
  });

  it('names a dropped connection network_error and a non-JSON 502 internal_error', async () => {
    const down = createApiClient({
      baseUrl: 'http://api',
      getToken: async () => 't',
      fetch: async () => {
        throw new TypeError('Failed to fetch');
      },
    });
    await expect(down.me()).rejects.toMatchObject({ code: 'network_error', status: 0 });
    const proxy = createApiClient({ baseUrl: 'http://api', getToken: async () => 't', fetch: fakeFetch(502, '<html>') });
    await expect(proxy.me()).rejects.toMatchObject({ code: 'internal_error', status: 502 });
  });

  it('escapes ids in paths', async () => {
    const calls: Call[] = [];
    const api = createApiClient({ baseUrl: 'http://api', getToken: async () => 't', fetch: fakeFetch(200, {}, calls) });
    await api.fact('../me');
    expect(calls[0].url).toBe('http://api/api/career/v1/facts/..%2Fme');
  });

  it('sends a partial fact edit under value', async () => {
    const calls: Call[] = [];
    const api = createApiClient({ baseUrl: 'http://api', getToken: async () => 't', fetch: fakeFetch(200, {}, calls) });
    await api.updateFact('f1', { position: 'Lead' });
    expect(calls[0].init.method).toBe('PATCH');
    expect(JSON.parse(String(calls[0].init.body))).toEqual({ value: { position: 'Lead' } });
  });
});

describe('fieldErrors', () => {
  it('reads the list form and the single-field form of validation_error', () => {
    expect(
      fieldErrors(new ApiError(400, 'validation_error', { code: 'validation_error', errors: [{ field: 'endDate', reason: 'invalid_date' }] })),
    ).toEqual([{ field: 'endDate', reason: 'invalid_date' }]);
    expect(fieldErrors(new ApiError(400, 'validation_error', { code: 'validation_error', field: 'locale' }))).toEqual([
      { field: 'locale', reason: 'invalid' },
    ]);
    expect(fieldErrors(new ApiError(403, 'permission_denied', { code: 'permission_denied' }))).toEqual([]);
  });
});

describe('alert locations and followed companies', () => {
  it('calls the alert routes with encoded ids and the saved-search location', async () => {
    const calls: Call[] = [];
    const api = createApiClient({ baseUrl: 'http://localhost:3000', getToken: async () => 't', fetch: fakeFetch(200, { ok: true }, calls) });
    await api.createAlertLocation({ place: 'Leeds', radiusMiles: 25 });
    await api.deleteAlertLocation('a/b');
    await api.followCompany({ name: 'Northwind' });
    await api.unfollowCompany('c 1');
    await api.createSavedSearch({ q: 'analyst', locationProfileId: 'loc-1' });
    expect(calls.map((c) => `${c.init.method} ${c.url}`)).toEqual([
      'POST http://localhost:3000/api/career/v1/location-profiles',
      'DELETE http://localhost:3000/api/career/v1/location-profiles/a%2Fb',
      'POST http://localhost:3000/api/career/v1/followed-companies',
      'DELETE http://localhost:3000/api/career/v1/followed-companies/c%201',
      'POST http://localhost:3000/api/career/v1/saved-searches',
    ]);
    expect(JSON.parse(String(calls[0].init.body))).toEqual({ place: 'Leeds', radiusMiles: 25 });
    expect(JSON.parse(String(calls[4].init.body))).toEqual({ q: 'analyst', locationProfileId: 'loc-1' });
  });
});
