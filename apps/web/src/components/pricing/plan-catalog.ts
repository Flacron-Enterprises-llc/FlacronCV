import { ALLOWANCES, PLAN_ORDER, type BillingInterval, type PlanAllowances, type PlanId } from '@flacroncv/career-shared';

/**
 * The five public plans (spec §5), in display order. Prices and allowances are
 * read from `@flacroncv/career-shared` (catalog.ts) — never restated here.
 */
export const PRICING_PLANS: readonly PlanId[] = PLAN_ORDER;

/**
 * Plans existing customers may still be on. They keep their price, billing and
 * limits (PLAN_CONTRACT "LEGACY"), but are never offered to anyone new, so no
 * pricing or upgrade surface lists them.
 */
export const LEGACY_PLANS = ['pro', 'career_accelerator', 'enterprise'] as const;
export type LegacyPlanId = (typeof LEGACY_PLANS)[number];

/** Career access a legacy plan maps to by default (PLAN_CONTRACT). Used to pick the next plan up. */
export const LEGACY_EQUIVALENT: Record<LegacyPlanId, PlanId> = {
  pro: 'starter',
  career_accelerator: 'professional',
  enterprise: 'career_pro',
};

export function isPricingPlan(value: unknown): value is PlanId {
  return typeof value === 'string' && (PRICING_PLANS as readonly string[]).includes(value);
}

export function isLegacyPlan(value: unknown): value is LegacyPlanId {
  return typeof value === 'string' && (LEGACY_PLANS as readonly string[]).includes(value);
}

/** The five-plan tier whose allowances describe this stored plan. Unknown or missing reads as Free. */
export function equivalentPlan(stored: string | null | undefined): PlanId {
  if (isPricingPlan(stored)) return stored;
  if (isLegacyPlan(stored)) return LEGACY_EQUIVALENT[stored];
  return 'free';
}

/** The plan an upgrade prompt offers: the next of the five above the customer's tier, or null on Business. */
export function nextPlanUp(stored: string | null | undefined): PlanId | null {
  const index = PRICING_PLANS.indexOf(equivalentPlan(stored));
  return PRICING_PLANS[index + 1] ?? null;
}

/** Where a signed-in customer reviews and confirms a plan before Stripe checkout. */
export function billingPlanHref(planId: PlanId, interval: BillingInterval): string {
  return `/settings/billing?plan=${planId}&interval=${interval}#change-plan`;
}

/** Highest template tier each plan unlocks (PLAN_CONTRACT V1 limits table). */
export const TEMPLATE_TIER: Record<PlanId, 'free' | 'pro' | 'enterprise'> = {
  free: 'free',
  starter: 'pro',
  professional: 'pro',
  career_pro: 'enterprise',
  business: 'enterprise',
};

// ─── Feature states (spec §5 "launch vs later", §21 "truthful presentation") ──

export type FeatureState = 'available' | 'coming_soon' | 'provider_dependent';

/** Every row of the comparison table: spec §6, §7 (alerts, geography, advanced access) and the §10 Business capacities. */
export const COMPARISON_ROWS = [
  'careerProfiles',
  'resumeVersions',
  'documentCredits',
  'resumeAnalyses',
  'actionPacks',
  'alertItems',
  'alertIntelligence',
  'matchingSchedule',
  'alertDelivery',
  'savedSearches',
  'locationProfiles',
  'localRadiusMiles',
  'scenarioReports',
  'followedCompanies',
  'trackedApplications',
  'textInterviewSessions',
  'voiceMinutes',
  'skillReports',
  'projectBriefInSkillReport',
  'coachingResponses',
  'evidenceItems',
  'portfolioPages',
  'assistedForms',
  'storageBytes',
  'pdfExport',
  'docxExport',
  'removeExportBranding',
  'mapSessions',
  'specialistModes',
  'applicationAnalytics',
  'portfolioAnalytics',
  'staffSeats',
  'activeCandidates',
] as const satisfies ReadonlyArray<keyof PlanAllowances>;
export type ComparisonRow = (typeof COMPARISON_ROWS)[number];

/** Rows that are the core CV product and exist whether or not the career tools are switched on. */
const CORE_ROWS: ReadonlySet<ComparisonRow> = new Set<ComparisonRow>([
  'resumeVersions',
  'documentCredits',
  'resumeAnalyses',
  'trackedApplications',
  'pdfExport',
  'docxExport',
  'removeExportBranding',
]);

/**
 * The single feature-state map. A feature is "available" unless listed:
 * - provider_dependent: built, but works only once its outside provider is
 *   connected (map tiles; alert delivery beyond the in-app alert centre needs
 *   the mailer and push/Telegram adapters). Live job feeds are connected, so
 *   alert items, saved searches and the matching schedule are available.
 * - coming_soon: allowance exists in the catalog, the feature is not built yet.
 * Flip an entry here when a feature ships; every pricing and billing surface
 * reads this, so they cannot disagree.
 */
export const FEATURE_STATE: Partial<Record<ComparisonRow, FeatureState>> = {
  // voiceMinutes: speech-to-text is connected (OpenAI, SPEECH_PROVIDER=openai).
  mapSessions: 'provider_dependent',
  // alertItems, savedSearches, matchingSchedule: live job feeds (Greenhouse/Lever) are connected.
  // alertDelivery: in-app works; email needs the mailer and push/Telegram have no adapter yet.
  alertDelivery: 'provider_dependent',
  assistedForms: 'coming_soon',
};

/** Per-level states for rows whose value is a level rather than a count. */
const LEVEL_STATE: Partial<Record<ComparisonRow, Partial<Record<string, FeatureState>>>> = {
  // alertIntelligence: every level is built (advanced goal/action links; Business organization queue and assignment).
  // alertDelivery: the whole row is provider_dependent (feeds; push/Telegram/immediate mail need their own provider too).
};

/** Whole-row state. Career rows read "coming soon" while the career tools are switched off. */
export function featureState(row: ComparisonRow, careerEnabled: boolean): FeatureState {
  if (!careerEnabled && !CORE_ROWS.has(row)) return 'coming_soon';
  return FEATURE_STATE[row] ?? 'available';
}

/** State of one plan's cell: the row state, narrowed by the plan's level where levels differ. */
export function cellState(row: ComparisonRow, planId: PlanId, careerEnabled: boolean): FeatureState {
  const rowState = featureState(row, careerEnabled);
  if (rowState !== 'available') return rowState;
  const level = ALLOWANCES[planId][row];
  return (typeof level === 'string' && LEVEL_STATE[row]?.[level]) || 'available';
}

/** Rows whose definition appears under "What each unit means" (spec §8 table, plus capacities). */
export const DEFINED_UNITS = [
  'documentCredits',
  'resumeAnalyses',
  'actionPacks',
  'alertItems',
  'textInterviewSessions',
  'voiceMinutes',
  'skillReports',
  'scenarioReports',
  'coachingResponses',
  'assistedForms',
  'mapSessions',
  'locationProfiles',
  'savedSearches',
  'followedCompanies',
  'resumeVersions',
  'trackedApplications',
  'evidenceItems',
  'portfolioPages',
  'storageBytes',
  'careerProfiles',
] as const satisfies readonly ComparisonRow[];
