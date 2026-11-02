import { BillingError } from '../billing/errors';
import { createGeocoder, UnconfiguredGeocoder } from './geocoder';

describe('createGeocoder', () => {
  const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
  afterAll(() => warn.mockRestore());

  it('stays unconfigured without both a named provider and a key', () => {
    expect(createGeocoder({})).toBeInstanceOf(UnconfiguredGeocoder);
    expect(createGeocoder({ GEOCODING_API_KEY: 'secret' })).toBeInstanceOf(UnconfiguredGeocoder);
    expect(createGeocoder({ GEOCODING_PROVIDER: 'unset-vendor' })).toBeInstanceOf(UnconfiguredGeocoder);
  });

  it('does not bind an unknown provider even when a key is present', () => {
    expect(createGeocoder({ GEOCODING_PROVIDER: 'unknown', GEOCODING_API_KEY: 'secret' })).toBeInstanceOf(
      UnconfiguredGeocoder,
    );
    expect(JSON.stringify(warn.mock.calls)).not.toContain('secret');
  });

  it('refuses lookup without inventing coordinates', async () => {
    const geocoder = createGeocoder({ GEOCODING_API_KEY: 'secret' });
    const error = await geocoder.lookup('Montreal').catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(BillingError);
    if (error instanceof BillingError) {
      expect(error.code).toBe('provider_unavailable');
      expect(error.details).toMatchObject({ reason: 'geocoding_not_configured' });
      expect(JSON.stringify(error)).not.toContain('secret');
    }
  });
});
