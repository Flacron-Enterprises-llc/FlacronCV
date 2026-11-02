/**
 * The only price and allowance list for FlacronCV V2.
 * Figures are spec sections 5–10, dated 2026-10-10, stored as integer cents.
 * Do not restate these numbers in an app, a database seed, or a second file.
 */

export const CATALOG_VERSION = '2026-10-10';

/**
 * Resume import calls AI and does not spend a document credit.
 * ASSUMED: 10 completed imports per user per UTC day, on every plan.
 * Only a completed import counts. A validation failure, a provider
 * failure, and a timeout do not. Change this number here.
 * It is not a priced allowance.
 */
export const DAILY_IMPORT_LIMIT = 10;

export const PLAN_ORDER = ['free', 'starter', 'professional', 'career_pro', 'business'] as const;

export type PlanId = (typeof PLAN_ORDER)[number];

export type BillingInterval = 'monthly' | 'annual';

export type AlertIntelligence = 'basic' | 'personalized' | 'enhanced' | 'advanced' | 'organization';

export type MatchingSchedule = 'weekly' | 'daily' | 'every_6_hours' | 'hourly';

export type AlertDelivery = 'weekly_email' | 'daily_email' | 'immediate_optional';

export type ApplicationAnalytics = 'none' | 'basic_counts' | 'breakdowns' | 'trends' | 'aggregate';

export type PortfolioAnalytics = 'none' | 'basic' | 'aggregate' | 'expanded' | 'program';

export type UsageUnit =
  | 'document_credit'
  | 'resume_analysis'
  | 'action_pack'
  | 'alert_item'
  | 'text_interview'
  | 'voice_minute'
  | 'skill_report'
  | 'scenario_report'
  | 'coaching_response'
  | 'assisted_form'
  | 'map_session'
  | 'messaging_balance';

const PLAN_RANK: Record<PlanId, number> = {
  free: 0,
  starter: 1,
  professional: 2,
  career_pro: 3,
  business: 4,
};

export function planMeets(plan: PlanId, minimum: PlanId): boolean {
  return PLAN_RANK[plan] >= PLAN_RANK[minimum];
}

export interface Plan {
  id: PlanId;
  monthlyCents: number;
  annualCents: number;
  recommended: boolean;
}

export const PLANS: Record<PlanId, Plan> = {
  free: { id: 'free', monthlyCents: 0, annualCents: 0, recommended: false },
  starter: { id: 'starter', monthlyCents: 2199, annualCents: 21990, recommended: false },
  professional: { id: 'professional', monthlyCents: 3899, annualCents: 38990, recommended: true },
  career_pro: { id: 'career_pro', monthlyCents: 6899, annualCents: 68990, recommended: false },
  business: { id: 'business', monthlyCents: 20800, annualCents: 208000, recommended: false },
};

export const RECOMMENDED_PLAN_ID: PlanId = 'professional';

export type PurchaseChannel = 'stripe' | 'apple' | 'google';

/**
 * Where a price may be sold. Business monthly and annual are website
 * checkout (Stripe) only. Decided by Rodrigue, 16 October 2026.
 * Other paid prices include Stripe, Apple, and Google.
 * Flip a cell here; do not fork checkout code.
 */
export const PURCHASE_CHANNELS: Record<PlanId, Record<BillingInterval, readonly PurchaseChannel[]>> = {
  free: { monthly: [], annual: [] },
  starter: {
    monthly: ['stripe', 'apple', 'google'],
    annual: ['stripe', 'apple', 'google'],
  },
  professional: {
    monthly: ['stripe', 'apple', 'google'],
    annual: ['stripe', 'apple', 'google'],
  },
  career_pro: {
    monthly: ['stripe', 'apple', 'google'],
    annual: ['stripe', 'apple', 'google'],
  },
  business: {
    monthly: ['stripe'],
    annual: ['stripe'],
  },
};

/**
 * Professional only, monthly and annual. Seven days, card required.
 * Same rule as V1 Pro (`TRIAL_PERIOD_DAYS` in V1
 * `packages/shared-types/src/subscription.types.ts`): website checkout
 * collects a card and charges when the trial ends unless the person cancels.
 * A person who already used a trial does not get another one.
 * No other plan has a trial. Decided by Rodrigue, 16 October 2026.
 * This does not change the catalog price. `estimate()` still totals that price.
 */
export interface PlanTrial {
  days: number;
  cardRequired: true;
  intervals: readonly BillingInterval[];
}

export const PROFESSIONAL_TRIAL_DAYS = 7;

export const PLAN_TRIALS: Record<PlanId, PlanTrial | null> = {
  free: null,
  starter: null,
  professional: {
    days: PROFESSIONAL_TRIAL_DAYS,
    cardRequired: true,
    intervals: ['monthly', 'annual'],
  },
  career_pro: null,
  business: null,
};

export function trialFor(planId: PlanId, interval: BillingInterval): PlanTrial | null {
  const trial = PLAN_TRIALS[planId];
  if (!trial || !trial.intervals.includes(interval)) return null;
  return trial;
}

export function annualIsTenTimesMonthly(plan: Plan): boolean {
  return plan.annualCents === plan.monthlyCents * 10;
}

export function subscriptionChargeCents(planId: PlanId, interval: BillingInterval): number {
  const plan = PLANS[planId];
  return interval === 'annual' ? plan.annualCents : plan.monthlyCents;
}

export interface PlanAllowances {
  careerProfiles: number | null;
  careerProfileScope: 'account' | 'per_candidate';
  resumeVersions: number | null;
  resumeVersionScope: 'account' | 'per_candidate';
  documentCredits: number | null;
  resumeAnalyses: number | null;
  actionPacks: number | null;
  alertItems: number | null;
  savedSearches: number | null;
  locationProfiles: number | null;
  localRadiusMiles: number;
  followedCompanies: number | null;
  trackedApplications: number | null;
  trackedApplicationScope: 'account' | 'per_candidate';
  textInterviewSessions: number | null;
  voiceMinutes: number | null;
  skillReports: number | null;
  scenarioReports: number | null;
  coachingResponses: number | null;
  evidenceItems: number | null;
  evidenceScope: 'account' | 'per_candidate';
  portfolioPages: number | null;
  portfolioScope: 'account' | 'per_candidate';
  assistedForms: number | null;
  /** Decimal bytes. 1 MB = 1_000_000. See OPEN_DECISIONS.md. */
  storageBytes: number;
  pdfExport: boolean;
  docxExport: boolean;
  removeExportBranding: boolean;
  mapSessions: number | null;
  alertIntelligence: AlertIntelligence;
  matchingSchedule: MatchingSchedule;
  /** Section 8. Free and Starter are digests. Higher plans may also use immediate channels. */
  alertDelivery: AlertDelivery;
  /**
   * Application analytics, portfolio analytics, specialist modes and the
   * in-report project brief are on paid plans only (Starter and up), not Free.
   */
  applicationAnalytics: ApplicationAnalytics;
  portfolioAnalytics: PortfolioAnalytics;
  /** Included inside a skill-gap report. Not a second credit. */
  projectBriefInSkillReport: boolean;
  staffSeats: number | null;
  activeCandidates: number | null;
  specialistModes: boolean;
}

const MB = 1_000_000;
const GB = 1_000_000_000;

export const ALLOWANCES: Record<PlanId, PlanAllowances> = {
  free: {
    careerProfiles: 1,
    careerProfileScope: 'account',
    resumeVersions: 1,
    resumeVersionScope: 'account',
    documentCredits: 3,
    resumeAnalyses: 3,
    actionPacks: null,
    alertItems: 10,
    savedSearches: 1,
    locationProfiles: 1,
    localRadiusMiles: 25,
    followedCompanies: 3,
    trackedApplications: 25,
    trackedApplicationScope: 'account',
    textInterviewSessions: null,
    voiceMinutes: null,
    skillReports: null,
    scenarioReports: null,
    coachingResponses: 5,
    evidenceItems: 3,
    evidenceScope: 'account',
    portfolioPages: null,
    portfolioScope: 'account',
    assistedForms: null,
    storageBytes: 100 * MB,
    pdfExport: true,
    docxExport: false,
    removeExportBranding: false,
    mapSessions: null,
    alertIntelligence: 'basic',
    matchingSchedule: 'weekly',
    alertDelivery: 'weekly_email',
    applicationAnalytics: 'none',
    portfolioAnalytics: 'none',
    projectBriefInSkillReport: false,
    staffSeats: null,
    activeCandidates: null,
    specialistModes: false,
  },
  starter: {
    careerProfiles: 1,
    careerProfileScope: 'account',
    resumeVersions: 5,
    resumeVersionScope: 'account',
    documentCredits: 20,
    resumeAnalyses: 15,
    actionPacks: null,
    alertItems: 50,
    savedSearches: 3,
    locationProfiles: 2,
    localRadiusMiles: 50,
    followedCompanies: 10,
    trackedApplications: 100,
    trackedApplicationScope: 'account',
    textInterviewSessions: 2,
    voiceMinutes: null,
    skillReports: 1,
    scenarioReports: null,
    coachingResponses: 30,
    evidenceItems: 20,
    evidenceScope: 'account',
    portfolioPages: 1,
    portfolioScope: 'account',
    assistedForms: null,
    storageBytes: 1 * GB,
    pdfExport: true,
    docxExport: true,
    removeExportBranding: true,
    mapSessions: null,
    alertIntelligence: 'personalized',
    matchingSchedule: 'daily',
    alertDelivery: 'daily_email',
    applicationAnalytics: 'basic_counts',
    portfolioAnalytics: 'basic',
    projectBriefInSkillReport: true,
    staffSeats: null,
    activeCandidates: null,
    specialistModes: true,
  },
  professional: {
    careerProfiles: 1,
    careerProfileScope: 'account',
    resumeVersions: 20,
    resumeVersionScope: 'account',
    documentCredits: 60,
    resumeAnalyses: 60,
    actionPacks: 10,
    alertItems: 200,
    savedSearches: 10,
    locationProfiles: 5,
    localRadiusMiles: 100,
    followedCompanies: 30,
    trackedApplications: 500,
    trackedApplicationScope: 'account',
    textInterviewSessions: 5,
    voiceMinutes: 30,
    skillReports: 5,
    scenarioReports: 1,
    coachingResponses: 100,
    evidenceItems: 100,
    evidenceScope: 'account',
    portfolioPages: 1,
    portfolioScope: 'account',
    assistedForms: 20,
    storageBytes: 5 * GB,
    pdfExport: true,
    docxExport: true,
    removeExportBranding: true,
    mapSessions: 50,
    alertIntelligence: 'enhanced',
    matchingSchedule: 'every_6_hours',
    alertDelivery: 'immediate_optional',
    applicationAnalytics: 'breakdowns',
    portfolioAnalytics: 'aggregate',
    projectBriefInSkillReport: true,
    staffSeats: null,
    activeCandidates: null,
    specialistModes: true,
  },
  career_pro: {
    careerProfiles: 1,
    careerProfileScope: 'account',
    resumeVersions: 50,
    resumeVersionScope: 'account',
    documentCredits: 150,
    resumeAnalyses: 150,
    actionPacks: 30,
    alertItems: 500,
    savedSearches: 25,
    locationProfiles: 10,
    localRadiusMiles: 200,
    followedCompanies: 100,
    trackedApplications: 2000,
    trackedApplicationScope: 'account',
    textInterviewSessions: 15,
    voiceMinutes: 120,
    skillReports: 15,
    scenarioReports: 5,
    coachingResponses: 250,
    evidenceItems: 300,
    evidenceScope: 'account',
    portfolioPages: 3,
    portfolioScope: 'account',
    assistedForms: 75,
    storageBytes: 20 * GB,
    pdfExport: true,
    docxExport: true,
    removeExportBranding: true,
    mapSessions: 200,
    alertIntelligence: 'advanced',
    matchingSchedule: 'hourly',
    alertDelivery: 'immediate_optional',
    applicationAnalytics: 'trends',
    portfolioAnalytics: 'expanded',
    projectBriefInSkillReport: true,
    staffSeats: null,
    activeCandidates: null,
    specialistModes: true,
  },
  business: {
    careerProfiles: 1,
    careerProfileScope: 'per_candidate',
    resumeVersions: 20,
    resumeVersionScope: 'per_candidate',
    documentCredits: 500,
    resumeAnalyses: 500,
    actionPacks: 100,
    alertItems: 2000,
    savedSearches: 100,
    locationProfiles: 50,
    localRadiusMiles: 200,
    followedCompanies: 100,
    trackedApplications: 500,
    trackedApplicationScope: 'per_candidate',
    textInterviewSessions: 50,
    voiceMinutes: 300,
    skillReports: 50,
    scenarioReports: 25,
    coachingResponses: 500,
    evidenceItems: 100,
    evidenceScope: 'per_candidate',
    portfolioPages: 1,
    portfolioScope: 'per_candidate',
    assistedForms: 200,
    storageBytes: 100 * GB,
    pdfExport: true,
    docxExport: true,
    removeExportBranding: true,
    mapSessions: 1000,
    alertIntelligence: 'organization',
    matchingSchedule: 'hourly',
    alertDelivery: 'immediate_optional',
    applicationAnalytics: 'aggregate',
    portfolioAnalytics: 'program',
    projectBriefInSkillReport: true,
    staffSeats: 3,
    activeCandidates: 50,
    specialistModes: true,
  },
};

/** Allowance fields that are a monthly count of a usage unit. */
export type UnitAllowanceField =
  | 'documentCredits'
  | 'resumeAnalyses'
  | 'actionPacks'
  | 'alertItems'
  | 'textInterviewSessions'
  | 'voiceMinutes'
  | 'skillReports'
  | 'scenarioReports'
  | 'coachingResponses'
  | 'assistedForms'
  | 'mapSessions';

/**
 * Which monthly allowance a usage unit spends. `null` means no plan
 * includes that unit: the messaging balance is prepaid only (section 8).
 * A null allowance on a plan means the plan does not include the unit.
 */
export const UNIT_ALLOWANCE_FIELD: Record<UsageUnit, UnitAllowanceField | null> = {
  document_credit: 'documentCredits',
  resume_analysis: 'resumeAnalyses',
  action_pack: 'actionPacks',
  alert_item: 'alertItems',
  text_interview: 'textInterviewSessions',
  voice_minute: 'voiceMinutes',
  skill_report: 'skillReports',
  scenario_report: 'scenarioReports',
  coaching_response: 'coachingResponses',
  assisted_form: 'assistedForms',
  map_session: 'mapSessions',
  messaging_balance: null,
};

export function includedUnits(planId: PlanId, unit: UsageUnit): number | null {
  const field = UNIT_ALLOWANCE_FIELD[unit];
  return field === null ? null : ALLOWANCES[planId][field];
}

/** Phase from spec section 15. Allowances can exist before the feature is switched on. */
export const FEATURE_PHASE = {
  documentCredits: 1,
  alertItems: 1,
  resumeAnalyses: 1,
  alertIntelligence: 1,
  alertDelivery: 1,
  savedSearches: 1,
  locationProfiles: 1,
  textInterviewSessions: 1,
  pdfExport: 1,
  docxExport: 1,
  resumeVersions: 1,
  trackedApplications: 1,
  coachingResponses: 1,
  actionPacks: 2,
  skillReports: 2,
  evidenceItems: 2,
  portfolioPages: 2,
  portfolioAnalytics: 2,
  projectBriefInSkillReport: 2,
  specialistModes: 2,
  voiceMinutes: 3,
  scenarioReports: 3,
  applicationAnalytics: 3,
  assistedForms: 3,
  mapSessions: 3,
  staffSeats: 4,
  activeCandidates: 4,
} as const;

export type FeatureId = keyof typeof FEATURE_PHASE;

export type AddonKind = 'usage_pack' | 'capacity' | 'organization' | 'balance' | 'future_offer';

export interface Addon {
  id: string;
  kind: AddonKind;
  unit:
    | UsageUnit
    | 'location_profile'
    | 'saved_search'
    | 'portfolio_page'
    | 'storage_byte'
    | 'staff_seat'
    | 'active_candidate'
    | 'white_label'
    | 'api_read'
    | 'unspecified';
  /** Units granted by one purchase. Storage add-ons use bytes. */
  units: number;
  priceCents: number;
  billing: 'one_time' | 'monthly';
  minPlan: PlanId;
  /** One-time packs. Spec section 9: twelve months after purchase. */
  expiresAfterMonths?: number;
  status: 'active' | 'future';
  /** False when the spec says "from" and the figure is not a checkout price. */
  firmPrice: boolean;
}

export const ADDONS: readonly Addon[] = [
  { id: 'document_s', kind: 'usage_pack', unit: 'document_credit', units: 10, priceCents: 499, billing: 'one_time', minPlan: 'starter', expiresAfterMonths: 12, status: 'active', firmPrice: true },
  { id: 'document_m', kind: 'usage_pack', unit: 'document_credit', units: 30, priceCents: 1299, billing: 'one_time', minPlan: 'starter', expiresAfterMonths: 12, status: 'active', firmPrice: true },
  { id: 'document_l', kind: 'usage_pack', unit: 'document_credit', units: 100, priceCents: 3499, billing: 'one_time', minPlan: 'starter', expiresAfterMonths: 12, status: 'active', firmPrice: true },
  { id: 'analysis_25', kind: 'usage_pack', unit: 'resume_analysis', units: 25, priceCents: 699, billing: 'one_time', minPlan: 'starter', expiresAfterMonths: 12, status: 'active', firmPrice: true },
  { id: 'action_s', kind: 'usage_pack', unit: 'action_pack', units: 5, priceCents: 799, billing: 'one_time', minPlan: 'professional', expiresAfterMonths: 12, status: 'active', firmPrice: true },
  { id: 'action_l', kind: 'usage_pack', unit: 'action_pack', units: 20, priceCents: 2499, billing: 'one_time', minPlan: 'professional', expiresAfterMonths: 12, status: 'active', firmPrice: true },
  { id: 'alert_s', kind: 'usage_pack', unit: 'alert_item', units: 100, priceCents: 399, billing: 'one_time', minPlan: 'starter', expiresAfterMonths: 12, status: 'active', firmPrice: true },
  { id: 'alert_l', kind: 'usage_pack', unit: 'alert_item', units: 500, priceCents: 1499, billing: 'one_time', minPlan: 'starter', expiresAfterMonths: 12, status: 'active', firmPrice: true },
  { id: 'text_interview_5', kind: 'usage_pack', unit: 'text_interview', units: 5, priceCents: 799, billing: 'one_time', minPlan: 'starter', expiresAfterMonths: 12, status: 'active', firmPrice: true },
  { id: 'voice_s', kind: 'usage_pack', unit: 'voice_minute', units: 60, priceCents: 999, billing: 'one_time', minPlan: 'professional', expiresAfterMonths: 12, status: 'active', firmPrice: true },
  { id: 'voice_l', kind: 'usage_pack', unit: 'voice_minute', units: 180, priceCents: 2499, billing: 'one_time', minPlan: 'professional', expiresAfterMonths: 12, status: 'active', firmPrice: true },
  { id: 'skill_5', kind: 'usage_pack', unit: 'skill_report', units: 5, priceCents: 799, billing: 'one_time', minPlan: 'starter', expiresAfterMonths: 12, status: 'active', firmPrice: true },
  { id: 'scenario_3', kind: 'usage_pack', unit: 'scenario_report', units: 3, priceCents: 999, billing: 'one_time', minPlan: 'professional', expiresAfterMonths: 12, status: 'active', firmPrice: true },
  { id: 'coaching_100', kind: 'usage_pack', unit: 'coaching_response', units: 100, priceCents: 999, billing: 'one_time', minPlan: 'starter', expiresAfterMonths: 12, status: 'active', firmPrice: true },
  { id: 'assisted_form_25', kind: 'usage_pack', unit: 'assisted_form', units: 25, priceCents: 699, billing: 'one_time', minPlan: 'professional', expiresAfterMonths: 12, status: 'active', firmPrice: true },
  { id: 'map_200', kind: 'usage_pack', unit: 'map_session', units: 200, priceCents: 399, billing: 'one_time', minPlan: 'professional', expiresAfterMonths: 12, status: 'active', firmPrice: true },
  { id: 'location_extra', kind: 'capacity', unit: 'location_profile', units: 1, priceCents: 199, billing: 'monthly', minPlan: 'starter', status: 'active', firmPrice: true },
  { id: 'saved_search_5', kind: 'capacity', unit: 'saved_search', units: 5, priceCents: 299, billing: 'monthly', minPlan: 'starter', status: 'active', firmPrice: true },
  { id: 'portfolio_extra', kind: 'capacity', unit: 'portfolio_page', units: 1, priceCents: 299, billing: 'monthly', minPlan: 'starter', status: 'active', firmPrice: true },
  { id: 'storage_10gb', kind: 'capacity', unit: 'storage_byte', units: 10 * GB, priceCents: 299, billing: 'monthly', minPlan: 'starter', status: 'active', firmPrice: true },
  { id: 'messaging_topup', kind: 'balance', unit: 'messaging_balance', units: 1, priceCents: 1000, billing: 'one_time', minPlan: 'starter', status: 'active', firmPrice: true },
  { id: 'staff_seat', kind: 'organization', unit: 'staff_seat', units: 1, priceCents: 1900, billing: 'monthly', minPlan: 'business', status: 'active', firmPrice: true },
  { id: 'candidates_25', kind: 'organization', unit: 'active_candidate', units: 25, priceCents: 4900, billing: 'monthly', minPlan: 'business', status: 'active', firmPrice: true },
  { id: 'candidates_100', kind: 'organization', unit: 'active_candidate', units: 100, priceCents: 14900, billing: 'monthly', minPlan: 'business', status: 'active', firmPrice: true },
  { id: 'storage_100gb_business', kind: 'organization', unit: 'storage_byte', units: 100 * GB, priceCents: 999, billing: 'monthly', minPlan: 'business', status: 'active', firmPrice: true },
  { id: 'white_label', kind: 'organization', unit: 'white_label', units: 1, priceCents: 9900, billing: 'monthly', minPlan: 'business', status: 'active', firmPrice: true },
  { id: 'api_package', kind: 'organization', unit: 'api_read', units: 10000, priceCents: 9900, billing: 'monthly', minPlan: 'business', status: 'active', firmPrice: false },
  { id: 'career_maintenance', kind: 'future_offer', unit: 'unspecified', units: 0, priceCents: 499, billing: 'monthly', minPlan: 'starter', status: 'future', firmPrice: false },
];

export function addonById(id: string): Addon | undefined {
  return ADDONS.find((addon) => addon.id === id);
}

export function usagePacksFor(unit: UsageUnit): Addon[] {
  return ADDONS.filter(
    (addon) =>
      addon.kind === 'usage_pack' &&
      addon.unit === unit &&
      addon.billing === 'one_time' &&
      addon.status === 'active' &&
      addon.firmPrice,
  );
}
