import { join } from 'path';
import { ADDONS } from '@flacroncv/career-shared';
import type { ProviderReadiness } from '../integration/provider-readiness';
import {
  ADDON_REQUIREMENTS,
  addonAvailability,
  PURCHASE_PROVIDERS,
  staticAddonAvailability,
} from './purchase-availability';
import type { AvailabilityContext } from './purchase-availability';

interface ApiModule {
  ADDON_REQUIREMENTS: typeof ADDON_REQUIREMENTS;
  PURCHASE_PROVIDERS: typeof PURCHASE_PROVIDERS;
  addonAvailability: typeof addonAvailability;
}

/** Loaded at test time (ts-jest compiles it) so the career build never includes the V1 API. */
function apiTable(): ApiModule {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  return require(join(__dirname, '../../../../apps/api/src/modules/payment/purchase-availability')) as ApiModule;
}

const ALL_READY: ProviderReadiness = { ai: true, objectStorage: true, speech: true, mapTiles: true, jobFeeds: true };

describe('pack purchase availability (career-server copy of the V1 rule)', () => {
  it('has exactly the V1 API rule table and provider list', () => {
    const api = apiTable();
    expect(ADDON_REQUIREMENTS).toEqual(api.ADDON_REQUIREMENTS);
    expect(PURCHASE_PROVIDERS).toEqual(api.PURCHASE_PROVIDERS);
  });

  it('decides like the V1 API for every add-on and context', () => {
    const api = apiTable();
    const contexts: Array<AvailabilityContext | null> = [
      null,
      { features: {}, providers: {} },
      { features: Object.fromEntries(Object.values(ADDON_REQUIREMENTS).map((r) => [r.feature, true])), providers: {} },
      { features: Object.fromEntries(Object.values(ADDON_REQUIREMENTS).map((r) => [r.feature, true])), providers: { ...ALL_READY } },
      { features: { documentCredits: true }, providers: { ai: true, speech: false } },
    ];
    for (const addonId of [...Object.keys(ADDON_REQUIREMENTS), 'not_an_addon']) {
      for (const ctx of contexts) {
        expect([addonId, addonAvailability(addonId, ctx)]).toEqual([addonId, api.addonAvailability(addonId, ctx)]);
      }
    }
  });

  it('has a row for every add-on the career catalog lists, so a new add-on is never sold by default', () => {
    for (const addon of ADDONS) {
      if (addon.kind === 'usage_pack') expect([addon.id, ADDON_REQUIREMENTS[addon.id] !== undefined]).toEqual([addon.id, true]);
    }
  });

  it('without a database, refuses unbuilt add-ons and missing providers but not switches', () => {
    const none: ProviderReadiness = { ai: false, objectStorage: false, speech: false, mapTiles: false, jobFeeds: false };
    expect(staticAddonAvailability('document_s', { ...none, ai: true })).toEqual({ available: true });
    expect(staticAddonAvailability('document_s', none)).toEqual({ available: false, reason: 'provider_missing', provider: 'ai' });
    expect(staticAddonAvailability('voice_s', ALL_READY)).toEqual({ available: true });
    expect(staticAddonAvailability('alert_s', { ...ALL_READY, jobFeeds: false })).toEqual({
      available: false,
      reason: 'provider_missing',
      provider: 'jobFeeds',
    });
    expect(staticAddonAvailability('assisted_form_25', ALL_READY)).toEqual({ available: false, reason: 'not_built' });
    expect(staticAddonAvailability('nope', ALL_READY)).toEqual({ available: false, reason: 'unknown_addon' });
  });
});
