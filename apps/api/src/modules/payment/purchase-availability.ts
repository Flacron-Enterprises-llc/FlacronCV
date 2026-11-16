/**
 * Whether a pack or capacity add-on may be BOUGHT right now.
 *
 * A configured Stripe price alone never makes a feature purchasable. A pack
 * is on sale only when all three hold:
 *   1. the feature behind it is built (`implemented`);
 *   2. the operator switch for that feature is on in the career service;
 *   3. every outside provider it needs is configured there (AI, speech,
 *      object storage, map tiles, job feeds).
 * The career service reports 2 and 3 for the signed-in person (GET /access).
 * When it cannot be asked (no CAREER_API_URL, timeout, error), nothing is on
 * sale: fail closed. Packs are granted into the career ledger, so without the
 * career service a bought pack could not be used anyway.
 *
 * This only controls NEW purchases. Packs already bought, their remaining
 * units, renewals of existing capacity add-ons and downloads are untouched.
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

/**
 * One row per add-on in CAREER_ADDONS (career-addons.ts). The spec test fails
 * if an add-on is missing here, so a new add-on can never be sold by default.
 */
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

/** What the career service reports for the signed-in person. */
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

/** Pure decision. `ctx` null means the career service could not be asked. */
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

/** Where the V1 API gets the context. Implementations must fail closed (return null). */
export interface AvailabilitySource {
  forCaller(idToken: string | null): Promise<AvailabilityContext | null>;
}

export const PURCHASE_AVAILABILITY_SOURCE = Symbol('PURCHASE_AVAILABILITY_SOURCE');

type Fetch = (url: string, init: { method: string; headers: Record<string, string>; signal?: AbortSignal }) => Promise<{
  status: number;
  json(): Promise<unknown>;
}>;

const CAREER_API_PATH = '/api/career/v1';

/**
 * Asks the career service's GET /access with the caller's OWN ID token (the
 * same server-to-server channel the usage meter uses). Any failure → null.
 */
export class CareerAccessAvailabilitySource implements AvailabilitySource {
  private readonly base: string | null;

  constructor(
    careerApiUrl: string | undefined | null,
    private readonly fetchImpl: Fetch = globalThis.fetch as unknown as Fetch,
    private readonly timeoutMs = 4000,
  ) {
    const trimmed = (careerApiUrl ?? '').trim().replace(/\/+$/, '');
    this.base = trimmed ? (trimmed.endsWith(CAREER_API_PATH) ? trimmed : `${trimmed}${CAREER_API_PATH}`) : null;
  }

  async forCaller(idToken: string | null): Promise<AvailabilityContext | null> {
    if (!this.base || !idToken) return null;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const res = await this.fetchImpl(`${this.base}/access`, {
        method: 'GET',
        headers: { Authorization: `Bearer ${idToken}` },
        signal: controller.signal,
      });
      if (res.status !== 200) return null;
      const body = (await res.json()) as { features?: unknown; providers?: unknown } | null;
      return parseContext(body);
    } catch {
      return null;
    } finally {
      clearTimeout(timer);
    }
  }
}

function booleanRecord(value: unknown): Record<string, boolean> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  const out: Record<string, boolean> = {};
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) if (v === true) out[k] = true;
  return out;
}

/** Only literal `true` counts; anything else (missing, "true", 1) is off. */
export function parseContext(body: { features?: unknown; providers?: unknown } | null): AvailabilityContext | null {
  if (!body || typeof body !== 'object') return null;
  // An old career service without `providers` cannot vouch for any provider: treat all as missing.
  return { features: booleanRecord(body.features), providers: booleanRecord(body.providers) };
}
