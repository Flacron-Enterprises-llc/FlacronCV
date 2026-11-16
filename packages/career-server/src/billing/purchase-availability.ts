import type { FeatureId } from '@flacroncv/career-shared';
import type { ProviderReadiness } from '../integration/provider-readiness';
import { isFeatureEnabled } from '../metering/access';
import type { CatalogSnapshot } from './catalog';
import type { Db } from './db';

/**
 * Whether a pack may be BOUGHT right now through a career-server checkout
 * path (Stripe pack checkout; store product maps). Copy of the rule table in
 * apps/api/src/modules/payment/purchase-availability.ts, which decides what
 * V1 sells; `purchase-availability.spec.ts` loads that file at test time and
 * fails when the two differ.
 *
 * A configured price alone never makes a feature purchasable. A pack is on
 * sale only when all three hold:
 *   1. the feature behind it is built (`implemented`);
 *   2. the operator switch for that feature is on (`feature_flags` / phase);
 *   3. every outside provider it needs is ready (`providerReadiness`).
 *
 * Only NEW purchases are refused. Packs already bought and their remaining
 * units are untouched.
 */
export type PurchaseProvider = 'ai' | 'speech' | 'objectStorage' | 'mapTiles' | 'jobFeeds';

export const PURCHASE_PROVIDERS: readonly PurchaseProvider[] = ['ai', 'speech', 'objectStorage', 'mapTiles', 'jobFeeds'];

export interface AddonRequirement {
  /** False while the feature is not built at all. */
  implemented: boolean;
  /** Career operator switch (catalog FeatureId) that must be on. */
  feature: string;
  providers: readonly PurchaseProvider[];
}

/** Same rows as the V1 API table (parity-tested). A missing add-on is never on sale. */
export const ADDON_REQUIREMENTS: Readonly<Record<string, AddonRequirement>> = {
  document_s: { implemented: true, feature: 'documentCredits', providers: ['ai'] },
  document_m: { implemented: true, feature: 'documentCredits', providers: ['ai'] },
  document_l: { implemented: true, feature: 'documentCredits', providers: ['ai'] },
  analysis_25: { implemented: true, feature: 'resumeAnalyses', providers: ['ai'] },
  action_s: { implemented: true, feature: 'actionPacks', providers: ['ai'] },
  action_l: { implemented: true, feature: 'actionPacks', providers: ['ai'] },
  // Alerts match listings from licensed job feeds; with no live feed there is nothing to alert on.
  alert_s: { implemented: true, feature: 'alertItems', providers: ['jobFeeds'] },
  alert_l: { implemented: true, feature: 'alertItems', providers: ['jobFeeds'] },
  text_interview_5: { implemented: true, feature: 'textInterviewSessions', providers: ['ai'] },
  voice_s: { implemented: true, feature: 'voiceMinutes', providers: ['speech'] },
  voice_l: { implemented: true, feature: 'voiceMinutes', providers: ['speech'] },
  skill_5: { implemented: true, feature: 'skillReports', providers: ['ai'] },
  scenario_3: { implemented: true, feature: 'scenarioReports', providers: ['ai'] },
  coaching_100: { implemented: true, feature: 'coachingResponses', providers: ['ai'] },
  // The assisted-forms browser extension is not published.
  assisted_form_25: { implemented: false, feature: 'assistedForms', providers: [] },
  map_200: { implemented: true, feature: 'mapSessions', providers: ['mapTiles'] },
  location_extra: { implemented: true, feature: 'locationProfiles', providers: [] },
  // Saved searches run against feed listings, like alerts.
  saved_search_5: { implemented: true, feature: 'savedSearches', providers: ['jobFeeds'] },
  portfolio_extra: { implemented: true, feature: 'portfolioPages', providers: [] },
  storage_10gb: { implemented: true, feature: 'evidenceItems', providers: ['objectStorage'] },
  staff_seat: { implemented: true, feature: 'staffSeats', providers: [] },
  candidates_25: { implemented: true, feature: 'activeCandidates', providers: [] },
  candidates_100: { implemented: true, feature: 'activeCandidates', providers: [] },
  storage_100gb_business: { implemented: true, feature: 'activeCandidates', providers: ['objectStorage'] },
};

export interface AvailabilityContext {
  /** Operator switches; a missing entry is off. */
  features: Record<string, boolean>;
  /** Provider readiness; a missing entry is not configured. */
  providers: Partial<Record<PurchaseProvider, boolean>>;
}

export type PurchaseBlockReason = 'unknown_addon' | 'not_built' | 'service_unavailable' | 'feature_off' | 'provider_missing';

export type AddonAvailability =
  | { available: true }
  | { available: false; reason: PurchaseBlockReason; provider?: PurchaseProvider };

/** Pure decision, identical to the V1 API's. `ctx` null means the context could not be read. */
export function addonAvailability(addonId: string, ctx: AvailabilityContext | null): AddonAvailability {
  const req = ADDON_REQUIREMENTS[addonId];
  if (!req) return { available: false, reason: 'unknown_addon' };
  if (!req.implemented) return { available: false, reason: 'not_built' };
  if (!ctx) return { available: false, reason: 'service_unavailable' };
  if (ctx.features[req.feature] !== true) return { available: false, reason: 'feature_off' };
  for (const provider of req.providers) {
    if (ctx.providers[provider] !== true) return { available: false, reason: 'provider_missing', provider };
  }
  return { available: true };
}

/**
 * The parts of the rule known without a database: built and providers ready.
 * Used where no operator switch can be read (loading store product maps).
 */
export function staticAddonAvailability(addonId: string, readiness: ProviderReadiness): AddonAvailability {
  const req = ADDON_REQUIREMENTS[addonId];
  if (!req) return { available: false, reason: 'unknown_addon' };
  return addonAvailability(addonId, { features: { [req.feature]: true }, providers: { ...readiness } });
}

/** The full rule for one pack: built, its operator switch on, its providers ready. */
export async function packAvailability(
  db: Db,
  snapshot: CatalogSnapshot,
  addonId: string,
  readiness: ProviderReadiness,
): Promise<AddonAvailability> {
  const req = ADDON_REQUIREMENTS[addonId];
  if (!req) return { available: false, reason: 'unknown_addon' };
  if (!req.implemented) return { available: false, reason: 'not_built' };
  const enabled = await isFeatureEnabled(db, snapshot, req.feature as FeatureId);
  return addonAvailability(addonId, { features: { [req.feature]: enabled }, providers: { ...readiness } });
}
