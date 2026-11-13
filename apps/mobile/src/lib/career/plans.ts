import {
  ALLOWANCES,
  PLAN_ORDER,
  PLANS,
  RECOMMENDED_PLAN_ID,
  type PlanAllowances,
  type PlanId,
} from '../../../../../packages/career-shared/src/catalog';
import { formatUsd } from '../../../../../packages/career-shared/src/money';
import type { CareerAccessView } from '../../../../../packages/career-api-client/src/types';
import { formatNumber, hasKey, t } from '../../i18n';

/**
 * Career plans comparison (information only). Allowances and prices come from
 * the career catalog (packages/career-shared/src/catalog.ts), never restated
 * here. The rows are the website's public pricing comparison rows
 * (apps/web/src/components/pricing/CareerPricing.tsx `ROWS`, V2's comparison
 * table), in the same order, worded with the same translations
 * (`career_pricing.features.*` / `intel.*` / `delivery.*` / `levels.*`).
 *
 * There is no purchase button, price-led call to action or link to buy
 * anywhere in this flow (Apple App Review 3.1.1 / 3.1.3, Google Play Payments
 * policy). Whether prices are shown at all is `SHOW_CAREER_PRICES` in
 * src/config/career.ts, off by default; see the comment there.
 */

export const PLAN_ROWS = [
  'documentCredits',
  'alertItems',
  'alertIntelligence',
  'alertDelivery',
  'savedSearches',
  'locationProfiles',
  'localRadiusMiles',
  'textInterviewSessions',
  'voiceMinutes',
  'resumeVersions',
  'resumeAnalyses',
  'actionPacks',
  'trackedApplications',
  'coachingResponses',
  'pdfExport',
  'docxExport',
  'skillReports',
  'scenarioReports',
  'evidenceItems',
  'portfolioPages',
  'portfolioAnalytics',
  'projectBriefInSkillReport',
  'assistedForms',
  'mapSessions',
  'applicationAnalytics',
  'staffSeats',
  'activeCandidates',
] as const satisfies readonly (keyof PlanAllowances)[];
export type PlanRow = (typeof PLAN_ROWS)[number];

export const CAREER_PLAN_IDS: readonly PlanId[] = PLAN_ORDER;
export const RECOMMENDED_CAREER_PLAN: PlanId = RECOMMENDED_PLAN_ID;

export function isCareerPlanId(value: unknown): value is PlanId {
  return typeof value === 'string' && (PLAN_ORDER as readonly string[]).includes(value);
}

const camel = (value: string) => value.replace(/_([a-z])/g, (_, c: string) => c.toUpperCase());

/** The row's name in the current language (website `career_pricing.features.*`). */
export function rowLabel(row: PlanRow): string {
  return t(`careerHub.plans.features.${row}`);
}

/**
 * One plan's value for one row, worded like the website's `formatAllowance`:
 * a count, a level name, "Yes", or "Not included" (`included: false`).
 */
export function rowValue(plan: PlanId, row: PlanRow): { included: boolean; text: string } {
  const value = ALLOWANCES[plan][row];
  const none = { included: false, text: t('careerHub.plans.notIncluded') };
  if (typeof value === 'boolean') return value ? { included: true, text: t('careerHub.plans.yes') } : none;
  if (value === null || value === undefined) return none;
  if (row === 'alertIntelligence') return { included: true, text: label(`careerHub.plans.intel.${camel(String(value))}`, String(value)) };
  if (row === 'alertDelivery') return { included: true, text: label(`careerHub.plans.delivery.${camel(String(value))}`, String(value)) };
  if (row === 'applicationAnalytics' || row === 'portfolioAnalytics') {
    return value === 'none' ? none : { included: true, text: label(`careerHub.plans.levels.${camel(String(value))}`, String(value)) };
  }
  if (row === 'localRadiusMiles') return { included: true, text: t('careerHub.plans.miles', { count: formatNumber(value as number) }) };
  if (typeof value === 'number') return { included: true, text: formatNumber(value) };
  return { included: true, text: String(value) };
}

function label(key: string, fallback: string): string {
  return hasKey(key) ? t(key) : fallback;
}

export function careerPlanName(plan: string): string {
  const key = `careerHub.plans.plan.${camel(plan)}`;
  return hasKey(key) ? t(key) : plan;
}

/** Exact catalog amounts in USD (career-shared `formatUsd`, as the website prints them). Only shown when prices are switched on. */
export function planPrices(plan: PlanId): { monthly: string; annual: string } {
  return { monthly: formatUsd(PLANS[plan].monthlyCents), annual: formatUsd(PLANS[plan].annualCents) };
}

/** The career plan the career service says this account has, or null when career tools are not included. */
export function currentCareerPlan(access: CareerAccessView | undefined): PlanId | null {
  if (!access?.enabled) return null;
  return isCareerPlanId(access.careerPlan) ? access.careerPlan : null;
}
