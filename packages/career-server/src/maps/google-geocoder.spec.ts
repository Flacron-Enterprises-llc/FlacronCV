import { BillingError } from '../billing/errors';
import { createGeocoder, UnconfiguredGeocoder } from './geocoder';
import { GOOGLE_MAPS_ATTRIBUTION, GoogleGeocoder } from './google-geocoder';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

function geocoder(fetchImpl: typeof fetch, timeoutMs = 8_000): GoogleGeocoder {
  return new GoogleGeocoder('secret-key', fetchImpl, timeoutMs);
}

describe('GoogleGeocoder', () => {
  const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
  afterAll(() => warn.mockRestore());

  it('maps a public city to coordinates without echoing the key', async () => {
    const fetchImpl = jest.fn(async (_input: RequestInfo | URL, _init?: RequestInit) =>
      jsonResponse({
        status: 'OK',
        results: [
          {
            formatted_address: 'Montreal, QC, Canada',
            place_id: 'place-montreal',
            geometry: { location: { lat: 45.5017, lng: -73.5673 } },
          },
        ],
      }),
    );
    const hit = await geocoder(fetchImpl as typeof fetch).lookup('Montreal, QC');
    expect(hit).toEqual({
      query: 'Montreal, QC',
      label: 'Montreal, QC, Canada',
      latitude: 45.5017,
      longitude: -73.5673,
      placeId: 'place-montreal',
      alternativeCount: 0,
      attribution: GOOGLE_MAPS_ATTRIBUTION,
      provider: 'google',
    });
    const url = String(fetchImpl.mock.calls[0]?.[0]);
    expect(url.startsWith('https://maps.googleapis.com/maps/api/geocode/json?')).toBe(true);
    expect(url).toContain('address=Montreal');
    expect(JSON.stringify(hit)).not.toContain('secret-key');
  });

  it('marks extra Google results as alternatives and keeps the first hit', async () => {
    const fetchImpl = jest.fn(async () =>
      jsonResponse({
        status: 'OK',
        results: [
          {
            formatted_address: 'Springfield, IL, USA',
            geometry: { location: { lat: 39.7817, lng: -89.6501 } },
          },
          {
            formatted_address: 'Springfield, MA, USA',
            geometry: { location: { lat: 42.1015, lng: -72.5898 } },
          },
        ],
      }),
    ) as unknown as typeof fetch;
    const hit = await geocoder(fetchImpl).lookup('Springfield');
    expect(hit?.label).toBe('Springfield, IL, USA');
    expect(hit?.alternativeCount).toBe(1);
  });

  it('returns null when Google finds no results', async () => {
    const fetchImpl = jest.fn(async () => jsonResponse({ status: 'ZERO_RESULTS', results: [] })) as unknown as typeof fetch;
    await expect(geocoder(fetchImpl).lookup('ZZZXXNOCITY99999')).resolves.toBeNull();
  });

  it('returns null for an empty or overlong query without calling out', async () => {
    const fetchImpl = jest.fn() as unknown as typeof fetch;
    await expect(geocoder(fetchImpl).lookup('   ')).resolves.toBeNull();
    await expect(geocoder(fetchImpl).lookup('x'.repeat(201))).resolves.toBeNull();
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('maps REQUEST_DENIED without echoing the key or error body', async () => {
    const fetchImpl = jest.fn(async () =>
      jsonResponse({ status: 'REQUEST_DENIED', error_message: 'secret-key was rejected' }),
    ) as unknown as typeof fetch;
    const error = await geocoder(fetchImpl).lookup('Montreal').catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(BillingError);
    if (error instanceof BillingError) {
      expect(error.details).toMatchObject({ reason: 'request_denied' });
      expect(JSON.stringify(error)).not.toContain('secret-key');
    }
  });

  it('maps quota statuses', async () => {
    for (const status of ['OVER_QUERY_LIMIT', 'OVER_DAILY_LIMIT']) {
      const fetchImpl = jest.fn(async () => jsonResponse({ status })) as unknown as typeof fetch;
      const error = await geocoder(fetchImpl).lookup('Montreal').catch((caught: unknown) => caught);
      expect(error).toBeInstanceOf(BillingError);
      if (error instanceof BillingError) {
        expect(error.details).toMatchObject({ reason: 'over_query_limit' });
      }
    }
  });

  it('maps a timeout without inventing coordinates', async () => {
    const fetchImpl = jest.fn(async (_url: string, init?: RequestInit) => {
      await new Promise<void>((_, reject) => {
        init?.signal?.addEventListener('abort', () => reject(Object.assign(new Error('aborted'), { name: 'AbortError' })));
      });
      return jsonResponse({ status: 'OK' });
    }) as unknown as typeof fetch;
    const error = await geocoder(fetchImpl, 5).lookup('Montreal').catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(BillingError);
    if (error instanceof BillingError) expect(error.details).toMatchObject({ reason: 'timeout' });
  });
});

describe('createGeocoder google', () => {
  const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
  afterEach(() => warn.mockClear());
  afterAll(() => warn.mockRestore());

  it('binds GoogleGeocoder only for provider google plus a key', () => {
    expect(createGeocoder({ GEOCODING_PROVIDER: 'google', GEOCODING_API_KEY: 'secret' })).toBeInstanceOf(GoogleGeocoder);
    expect(createGeocoder({ GEOCODING_PROVIDER: 'Google', GEOCODING_API_KEY: 'secret' })).toBeInstanceOf(GoogleGeocoder);
    expect(createGeocoder({ GEOCODING_PROVIDER: 'google' })).toBeInstanceOf(UnconfiguredGeocoder);
    expect(createGeocoder({ GEOCODING_PROVIDER: 'mapbox', GEOCODING_API_KEY: 'secret' })).toBeInstanceOf(
      UnconfiguredGeocoder,
    );
  });
});
