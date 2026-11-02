import { BillingError } from '../billing/errors';
import type { GeocodeHit, Geocoder } from './geocoder';

const GEOCODE_URL = 'https://maps.googleapis.com/maps/api/geocode/json';
const DEFAULT_TIMEOUT_MS = 8_000;
const MAX_QUERY = 200;

export const GOOGLE_MAPS_ATTRIBUTION = 'Google Maps';

interface GoogleGeocodeBody {
  status?: string;
  results?: Array<{
    formatted_address?: string;
    place_id?: string;
    geometry?: { location?: { lat?: unknown; lng?: unknown } };
  }>;
}

/**
 * Forward geocoding through Google Geocoding API JSON.
 * Official request: `https://maps.googleapis.com/maps/api/geocode/json`.
 * The key is never logged. Visual map tiles are a separate product.
 *
 * Display without a Google Map must keep "Google Maps" attribution.
 * Lat/lng may be cached at most 30 consecutive calendar days; this
 * adapter does not persist coordinates. Do not show these results on a
 * non-Google map.
 */
export class GoogleGeocoder implements Geocoder {
  constructor(
    private readonly apiKey: string,
    private readonly fetchImpl: typeof fetch = fetch,
    private readonly timeoutMs: number = DEFAULT_TIMEOUT_MS,
  ) {
    if (!apiKey.trim()) throw new Error('GoogleGeocoder needs GEOCODING_API_KEY');
  }

  async lookup(query: string): Promise<GeocodeHit | null> {
    const address = query.trim();
    if (address.length === 0 || address.length > MAX_QUERY) return null;

    const params = new URLSearchParams({ address, key: this.apiKey });
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const response = await this.fetchImpl(`${GEOCODE_URL}?${params.toString()}`, {
        method: 'GET',
        signal: controller.signal,
      });
      if (!response.ok) {
        console.warn(`GoogleGeocoder request failed with HTTP ${response.status}`);
        throw new BillingError('provider_unavailable', { reason: `http_${response.status}` });
      }
      const body = (await response.json()) as GoogleGeocodeBody;
      return this.readBody(address, body);
    } catch (error) {
      if (error instanceof BillingError) throw error;
      if (isAbort(error)) throw new BillingError('provider_unavailable', { reason: 'timeout' });
      throw new BillingError('provider_unavailable', { reason: 'provider_error' });
    } finally {
      clearTimeout(timer);
    }
  }

  private readBody(query: string, body: GoogleGeocodeBody): GeocodeHit | null {
    const status = (body.status ?? '').toUpperCase();
    if (status === 'ZERO_RESULTS' || status === 'INVALID_REQUEST') return null;
    if (status === 'OVER_QUERY_LIMIT' || status === 'OVER_DAILY_LIMIT') {
      console.warn(`GoogleGeocoder request failed with status ${status}`);
      throw new BillingError('provider_unavailable', { reason: 'over_query_limit' });
    }
    if (status === 'REQUEST_DENIED') {
      console.warn('GoogleGeocoder request failed with status REQUEST_DENIED');
      throw new BillingError('provider_unavailable', { reason: 'request_denied' });
    }
    if (status && status !== 'OK') {
      console.warn(`GoogleGeocoder request failed with status ${status}`);
      throw new BillingError('provider_unavailable', { reason: 'provider_error' });
    }
    const results = body.results ?? [];
    const first = results[0];
    const latitude = asCoordinate(first?.geometry?.location?.lat);
    const longitude = asCoordinate(first?.geometry?.location?.lng);
    const label = first?.formatted_address?.trim() ?? '';
    if (latitude === null || longitude === null || label.length === 0) return null;
    return {
      query,
      label,
      latitude,
      longitude,
      placeId: first?.place_id ?? null,
      alternativeCount: Math.max(0, results.length - 1),
      attribution: GOOGLE_MAPS_ATTRIBUTION,
      provider: 'google',
    };
  }
}

function asCoordinate(value: unknown): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null;
  if (Math.abs(value) > 180) return null;
  return value;
}

function isAbort(error: unknown): boolean {
  return typeof error === 'object' && error !== null && (error as { name?: string }).name === 'AbortError';
}
