import {
  ALLOWANCES,
  PLAN_ORDER,
  PLANS,
  PLAN_TRIALS,
  PURCHASE_CHANNELS,
  RECOMMENDED_PLAN_ID,
  type BillingInterval,
  type PlanAllowances,
  type PlanId,
} from '../../../../packages/career-shared/src/catalog';
import { monthlyEquivalentCents } from '../../../../packages/career-shared/src/money';
import { PLAN_CONFIGS } from '../../../../packages/shared-types/src/subscription.types';
import { planMeetsTier } from '../../../../packages/shared-types/src/template.tiers';
import type { SubscriptionPlan as SharedPlan } from '../../../../packages/shared-types/src/enums';
import { formatCurrency, formatNumber, hasKey, t } from '../i18n';

/**
 * The five public plans for the app, read from the one catalog
 * (packages/career-shared/src/catalog.ts: prices, allowances, purchase
 * channels, trials) and shared-types (V1 template tier, DOCX, branding).
 * No figure is restated here. Ported from the website's
 * apps/web/src/components/pricing/plan-catalog.ts + plan-format.ts so the
 * app's cards, comparison and feature states match the pricing page.
 */

export type { BillingInterval, PlanId };

export const PRICING_PLANS: readonly PlanId[] = PLAN_ORDER;
export const RECOMMENDED_PLAN: PlanId = RECOMMENDED_PLAN_ID;

/** Plans existing customers may still be on; never offered to anyone new. */
export const LEGACY_PLANS = ['pro', 'career_accelerator', 'enterprise'] as const;
export type LegacyPlanId = (typeof LEGACY_PLANS)[number];

/** Five-plan tier a legacy plan maps to by default (PLAN_CONTRACT career plan map). */
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

/** The five-plan tier whose allowances describe a stored plan. Unknown or missing reads as Free. */
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

/**
 * The lowest of the five plans that meets `minimum` (a plan id the API names
 * as `minimumPlan`, or a template tier such as `pro` / `enterprise`). Template
 * tiers go through `planMeetsTier` — never through a plan-order index, which
 * mis-ranks the legacy tier ids against the five plans.
 */
export function lowestPlanMeeting(minimum: string | null | undefined): PlanId | null {
  if (!minimum) return null;
  if (isPricingPlan(minimum)) return minimum;
  return PRICING_PLANS.find((plan) => planMeetsTier(plan as SharedPlan, minimum as SharedPlan)) ?? null;
}

/** Highest template tier each plan unlocks, from shared-types `limits.templates`. */
export function templateTierOfPlan(plan: PlanId): 'free' | 'pro' | 'career_accelerator' | 'enterprise' {
  return PLAN_CONFIGS[plan as SharedPlan].limits.templates as 'free' | 'pro' | 'career_accelerator' | 'enterprise';
}

/** True when this store may sell the plan at this interval (catalog `PURCHASE_CHANNELS`; Business is web only). */
export function soldInStore(plan: PlanId, interval: BillingInterval, store: 'apple' | 'google'): boolean {
  return PURCHASE_CHANNELS[plan][interval].includes(store);
}

/** The catalog trial (Professional, 7 days) — shown only when the store product itself has one. */
export function catalogTrialDays(plan: PlanId, interval: BillingInterval): number | null {
  const trial = PLAN_TRIALS[plan];
  return trial && trial.intervals.includes(interval) ? trial.days : null;
}

// ─── Prices ──────────────────────────────────────────────────────────────────

/** Catalog cents in USD, in the app language ("$21.99"). Free is "$0". */
export function usd(cents: number): string {
  if (cents === 0) return formatCurrency(0, 'usd').replace(/[.,]00(?=\D*$)/, '');
  return formatCurrency(cents / 100, 'usd');
}

export interface CardPrice {
  /** The big figure. */
  headline: string;
  /** "/month", "/year, paid upfront" or "no card needed". */
  suffix: string;
  /** Secondary lines under the figure. */
  notes: string[];
}

/**
 * The price block of a plan card, worded like the website's PlanCards. When
 * the store returned its own localized price for the product, that price is
 * the headline (it is what the store will charge) and the catalog USD figure
 * is not shown next to it.
 */
export function cardPrice(plan: PlanId, interval: BillingInterval, storePrice?: string | null): CardPrice {
  const entry = PLANS[plan];
  if (plan === 'free') return { headline: usd(0), suffix: t('plans.card.freeForever'), notes: [] };
  if (interval === 'monthly') {
    return {
      headline: storePrice || usd(entry.monthlyCents),
      suffix: t('plans.card.perMonth'),
      notes: storePrice ? [] : [t('plans.card.orAnnualUpfront', { amount: usd(entry.annualCents) })],
    };
  }
  return {
    headline: storePrice || usd(entry.annualCents),
    suffix: t('plans.card.perYearUpfront'),
    notes: [
      ...(storePrice
        ? []
        : [
            t('plans.card.monthlyEquivalent', { amount: usd(monthlyEquivalentCents(entry.annualCents)) }),
            t('plans.card.orMonthly', { amount: usd(entry.monthlyCents) }),
          ]),
      t('plans.card.allowancesMonthly'),
    ],
  };
}

// ─── Names ───────────────────────────────────────────────────────────────────

/** Plan name in the app language (five plans and the legacy names). */
export function planName(plan: string): string {
  const key = `settings.plans.${plan}`;
  return hasKey(key) ? t(key) : plan;
}

/** What to call the stored plan: the five-plan name, or "Pro (legacy) — your price is kept". */
export function planLabel(stored: string | null | undefined): string {
  if (!stored) return planName('free');
  if (isLegacyPlan(stored)) return t('plans.legacyLabel', { plan: planName(stored) });
  return planName(stored);
}

// ─── Comparison and feature states (website plan-catalog.ts) ─────────────────

export type FeatureState = 'available' | 'coming_soon' | 'provider_dependent';

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
] as const satisfies readonly (keyof PlanAllowances)[];
export type ComparisonRow = (typeof COMPARISON_ROWS)[number];

/** Core CV product rows: they exist whether or not the career tools are switched on. */
const CORE_ROWS: ReadonlySet<ComparisonRow> = new Set<ComparisonRow>([
  'resumeVersions',
  'documentCredits',
  'resumeAnalyses',
  'trackedApplications',
  'pdfExport',
  'docxExport',
  'removeExportBranding',
]);

/** Same map as the website: flip an entry when a feature ships. */
export const FEATURE_STATE: Partial<Record<ComparisonRow, FeatureState>> = {
  voiceMinutes: 'provider_dependent',
  mapSessions: 'provider_dependent',
  coachingResponses: 'coming_soon',
  assistedForms: 'coming_soon',
};

const LEVEL_STATE: Partial<Record<ComparisonRow, Partial<Record<string, FeatureState>>>> = {
  alertIntelligence: { advanced: 'coming_soon', organization: 'coming_soon' },
  alertDelivery: { immediate_optional: 'provider_dependent' },
};

/** Whole-row state. Career rows read "coming soon" while the career tools are switched off. */
export function featureState(row: ComparisonRow, careerEnabled: boolean): FeatureState {
  if (!careerEnabled && !CORE_ROWS.has(row)) return 'coming_soon';
  return FEATURE_STATE[row] ?? 'available';
}

/** One plan's cell state: the row state, narrowed by the plan's level where levels differ. */
export function cellState(row: ComparisonRow, plan: PlanId, careerEnabled: boolean): FeatureState {
  const rowState = featureState(row, careerEnabled);
  if (rowState !== 'available') return rowState;
  const level = ALLOWANCES[plan][row];
  return (typeof level === 'string' && LEVEL_STATE[row]?.[level]) || 'available';
}

/** Units explained under "What each unit means". */
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

export function rowLabel(row: ComparisonRow): string {
  return t(`plans.rows.${row}`);
}

export function stateLabel(state: FeatureState): string | null {
  if (state === 'coming_soon') return t('plans.state.comingSoon');
  if (state === 'provider_dependent') return t('plans.state.providerDependent');
  return null;
}

const MB = 1_000_000;
const GB = 1_000_000_000;

/** Storage in decimal units, as the catalog counts it ("100 MB", "10 GB"). */
export function storageLabel(bytes: number): string {
  return bytes >= GB
    ? t('plans.cell.storageGb', { amount: formatNumber(bytes / GB, { maximumFractionDigits: 0 }) })
    : t('plans.cell.storageMb', { amount: formatNumber(bytes / MB, { maximumFractionDigits: 0 }) });
}

function levelLabel(group: 'intel' | 'delivery' | 'levels' | 'schedule', value: string): string {
  const key = `plans.${group}.${value}`;
  return hasKey(key) ? t(key) : value;
}

/** One comparison cell, worded like the website's `usePlanFormat().cell`. */
export function cellText(row: ComparisonRow, plan: PlanId): { included: boolean; text: string } {
  const allowance = ALLOWANCES[plan];
  const value = allowance[row];
  const none = { included: false, text: t('plans.cell.notIncluded') };
  if (typeof value === 'boolean') return value ? { included: true, text: t('plans.cell.yes') } : none;
  if (value === null || value === undefined) return none;
  switch (row) {
    case 'alertIntelligence':
      return { included: true, text: levelLabel('intel', String(value)) };
    case 'alertDelivery':
      return { included: true, text: levelLabel('delivery', String(value)) };
    case 'matchingSchedule':
      return { included: true, text: levelLabel('schedule', String(value)) };
    case 'applicationAnalytics':
    case 'portfolioAnalytics':
      return value === 'none' ? none : { included: true, text: levelLabel('levels', String(value)) };
    case 'localRadiusMiles':
      return { included: true, text: t('plans.cell.miles', { count: formatNumber(value as number, { maximumFractionDigits: 0 }) }) };
    case 'storageBytes':
      return { included: true, text: storageLabel(value as number) };
    default:
      break;
  }
  const amount = formatNumber(value as number, { maximumFractionDigits: 0 });
  const scope =
    (row === 'resumeVersions' && allowance.resumeVersionScope) ||
    (row === 'careerProfiles' && allowance.careerProfileScope) ||
    (row === 'trackedApplications' && allowance.trackedApplicationScope) ||
    (row === 'evidenceItems' && allowance.evidenceScope) ||
    (row === 'portfolioPages' && allowance.portfolioScope) ||
    'account';
  return { included: true, text: scope === 'per_candidate' ? t('plans.cell.perCandidate', { amount }) : amount };
}

/** The four facts a plan card shows (website PlanCards), plus the interview allowance lines. */
export function cardFacts(plan: PlanId, careerEnabled: boolean): { label: string; value: string; state: FeatureState }[] {
  const allowance = ALLOWANCES[plan];
  const facts: { label: string; value: string; state: FeatureState }[] = [
    { label: t('plans.card.documents'), value: cellText('documentCredits', plan).text, state: 'available' },
    { label: t('plans.card.resumeVersions'), value: cellText('resumeVersions', plan).text, state: 'available' },
    { label: t('plans.card.alertIntelligence'), value: cellText('alertIntelligence', plan).text, state: cellState('alertIntelligence', plan, careerEnabled) },
    { label: t('plans.card.savedSearches'), value: cellText('savedSearches', plan).text, state: cellState('savedSearches', plan, careerEnabled) },
    { label: t('plans.card.locationProfiles'), value: cellText('locationProfiles', plan).text, state: cellState('locationProfiles', plan, careerEnabled) },
  ];
  const interview =
    allowance.textInterviewSessions === null
      ? t('plans.cell.notIncluded')
      : t('plans.card.textSessions', {
          count: allowance.textInterviewSessions,
          amount: formatNumber(allowance.textInterviewSessions, { maximumFractionDigits: 0 }),
        });
  facts.push({ label: t('plans.card.interview'), value: interview, state: cellState('textInterviewSessions', plan, careerEnabled) });
  if (allowance.voiceMinutes !== null) {
    facts.push({
      label: t('plans.card.voice'),
      value: t('plans.card.voiceMinutes', {
        count: allowance.voiceMinutes,
        amount: formatNumber(allowance.voiceMinutes, { maximumFractionDigits: 0 }),
      }),
      state: cellState('voiceMinutes', plan, careerEnabled),
    });
  }
  return facts;
}

/**
 * Catalog benefits of an offered plan for an upgrade prompt (website
 * UpgradeModal): credits, analyses, CV versions, template reach, DOCX,
 * no branding, unlimited PDF. Read from the catalog, never hand-written.
 */
export function planBenefits(plan: PlanId): string[] {
  const allowance = ALLOWANCES[plan];
  const versions = allowance.resumeVersions ?? 0;
  return [
    t('plans.benefits.documentCredits', { count: allowance.documentCredits ?? 0, amount: formatNumber(allowance.documentCredits ?? 0) }),
    t('plans.benefits.resumeAnalyses', { count: allowance.resumeAnalyses ?? 0, amount: formatNumber(allowance.resumeAnalyses ?? 0) }),
    t('plans.benefits.resumeVersions', { count: versions, amount: formatNumber(versions) }),
    t(`plans.templateReach.${templateTierOfPlan(plan)}`),
    ...(allowance.docxExport ? [t('plans.benefits.docx')] : []),
    ...(allowance.removeExportBranding ? [t('plans.benefits.noBranding')] : []),
    t('plans.benefits.pdfUnlimited'),
  ];
}
