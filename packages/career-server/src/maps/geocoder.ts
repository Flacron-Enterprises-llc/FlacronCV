import { BillingError } from '../billing/errors';
import { GoogleGeocoder } from './google-geocoder';

export interface GeocodeHit {
  query: string;
  label: string;
  latitude: number;
  longitude: number;
  placeId?: string | null;
  /** Extra Google results after the first. 0 means a single hit. */
  alternativeCount?: number;
  attribution?: string | null;
  provider?: 'google' | null;
}

/**
 * Forward geocoding only. Visual map tiles are a separate adapter
 * (`MapTiles`) and a separate credential.
 */
export interface Geocoder {
  lookup(query: string): Promise<GeocodeHit | null>;
}

/** No provider name and key together. Lookups do not invent coordinates. */
export class UnconfiguredGeocoder implements Geocoder {
  async lookup(): Promise<GeocodeHit | null> {
    throw new BillingError('provider_unavailable', { reason: 'geocoding_not_configured' });
  }
}

/**
 * Binds a live geocoder only when `GEOCODING_PROVIDER` names a supported
 * product and `GEOCODING_API_KEY` is present. An unknown provider name
 * stays unconfigured so the key is never sent to a guessed host.
 */
export function createGeocoder(env: NodeJS.ProcessEnv = process.env): Geocoder {
  const provider = env.GEOCODING_PROVIDER?.trim().toLowerCase() ?? '';
  const key = env.GEOCODING_API_KEY?.trim() ?? '';
  if (key.length > 0 && provider.length === 0) {
    console.warn('GEOCODING_API_KEY is set but GEOCODING_PROVIDER is empty; geocoding stays unconfigured');
  }
  if (provider.length > 0 && key.length === 0) {
    console.warn('GEOCODING_PROVIDER is set but GEOCODING_API_KEY is empty; geocoding stays unconfigured');
  }
  if (!provider || !key) return new UnconfiguredGeocoder();
  if (provider === 'google') return new GoogleGeocoder(key);
  console.warn(`GEOCODING_PROVIDER ${provider} is not a bound adapter; geocoding stays unconfigured`);
  return new UnconfiguredGeocoder();
}
