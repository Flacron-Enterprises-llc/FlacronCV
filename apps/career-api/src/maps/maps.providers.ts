import type { Provider } from '@nestjs/common';
import { createGeocoder } from '@flacroncv/career-server';
import type { Geocoder } from '@flacroncv/career-server';

export const GEOCODER = Symbol('GEOCODER');

/**
 * Reads `GEOCODING_PROVIDER` and `GEOCODING_API_KEY`. `google` binds
 * `GoogleGeocoder`. Empty or unknown names stay unconfigured so the key
 * is never sent to a guessed host. Visual map tiles use a separate
 * Maps JavaScript API browser key.
 */
export const mapsProviders: Provider[] = [
  {
    provide: GEOCODER,
    useFactory: (): Geocoder => createGeocoder(process.env),
  },
];
