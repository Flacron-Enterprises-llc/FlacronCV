import { ApiError } from '../../../../../packages/career-api-client/src/client';
import type {
  ScenarioOptionInput,
  ScenarioOptionView,
  ScenarioResult,
} from '../../../../../packages/career-api-client/src/types';
import {
  isCalendarDate,
  MAX_SCENARIO_OPTIONS,
  SCENARIO_NOTE_MAX,
  SCENARIO_TEXT_MAX,
  type ScenarioSource,
  type ScenarioUncertainty,
} from '../../../../../packages/career-shared/src/remaining';
import { formatNumber, t } from '../../i18n';
import { careerErrorMessage } from '../career-view';
import { providerUnavailableMessage } from './action-packs';

/**
 * Pure logic for the mobile scenario planner (tested in scenarios.test.ts),
 * the same rules as the website's ScenariosPanel. Up to three routes, each
 * with pay, cost and months as typed (blank stays unknown, never 0), where
 * the figures come from (the person's own, published market data with its
 * name and date, or an estimate), how sure they are, known requirements, and
 * optional links to a location profile and a skill report. A new comparison
 * uses one scenario report after a confirmation that shows the balance;
 * reopening and editing a saved one recomputes from the person's values and
 * is free. Nothing here predicts earnings or a job offer.
 */

export const MAX_ROUTES = MAX_SCENARIO_OPTIONS;
export { SCENARIO_NOTE_MAX, SCENARIO_TEXT_MAX };

export const SOURCES: readonly ScenarioSource[] = ['user', 'market', 'estimate'];
export const UNCERTAINTIES: readonly ScenarioUncertainty[] = ['unknown', 'low', 'medium', 'high'];

export interface RouteDraft {
  name: string;
  destination: string;
  /** Whole currency units as typed; converted to cents when sent. Blank = unknown. */
  pay: string;
  cost: string;
  months: string;
  source: ScenarioSource;
  sourceName: string;
  /** YYYY-MM-DD or blank. */
  sourceDate: string;
  uncertainty: ScenarioUncertainty;
  requirements: string;
  locationProfileId: string;
  skillReportId: string;
}

export const BLANK_ROUTE: RouteDraft = {
  name: '',
  destination: '',
  pay: '',
  cost: '',
  months: '',
  source: 'user',
  sourceName: '',
  sourceDate: '',
  uncertainty: 'unknown',
  requirements: '',
  locationProfileId: '',
  skillReportId: '',
};

export function addRoute(routes: RouteDraft[]): RouteDraft[] {
  return routes.length >= MAX_ROUTES ? routes : [...routes, { ...BLANK_ROUTE }];
}

export function removeRoute(routes: RouteDraft[], index: number): RouteDraft[] {
  if (routes.length <= 1) return routes;
  return routes.filter((_, i) => i !== index);
}

export function updateRoute(routes: RouteDraft[], index: number, patch: Partial<RouteDraft>): RouteDraft[] {
  return routes.map((route, i) => (i === index ? { ...route, ...patch } : route));
}

/** "55 000" / "55,000.50" -> cents; null when blank; NaN when not a non-negative number. */
export function payToCents(value: string): number | null {
  const clean = value.replace(/[\s,]/g, '');
  if (clean === '') return null;
  const amount = Number(clean);
  return Number.isFinite(amount) && amount >= 0 ? Math.round(amount * 100) : Number.NaN;
}

/** Whole months; null when blank; NaN when not a whole non-negative number. */
export function wholeOrBlank(value: string): number | null {
  const clean = value.trim();
  if (clean === '') return null;
  const n = Number(clean);
  return Number.isInteger(n) && n >= 0 ? n : Number.NaN;
}

export type RouteProblem = 'need_route' | 'bad_number' | 'bad_date' | 'market_needs_source' | 'too_long';

/** The first problem with a filled route, or null. */
export function routeProblem(route: RouteDraft): RouteProblem | null {
  if (!route.name.trim() || !route.destination.trim()) return 'need_route';
  if (route.name.trim().length > SCENARIO_TEXT_MAX || route.destination.trim().length > SCENARIO_TEXT_MAX || route.sourceName.trim().length > SCENARIO_TEXT_MAX) {
    return 'too_long';
  }
  if (route.requirements.trim().length > SCENARIO_NOTE_MAX) return 'too_long';
  if ([payToCents(route.pay), payToCents(route.cost), wholeOrBlank(route.months)].some((v) => Number.isNaN(v))) return 'bad_number';
  if (route.sourceDate.trim() && !isCalendarDate(route.sourceDate.trim())) return 'bad_date';
  // Market figures are only market data when they say where and when they come from.
  if (route.source === 'market' && (!route.sourceName.trim() || !route.sourceDate.trim())) return 'market_needs_source';
  return null;
}

export function problemMessage(problem: RouteProblem, number: number | null): string {
  const prefix = number === null ? '' : `${t('careerPlans.scope.route_n', { n: number })}: `;
  switch (problem) {
    case 'need_route':
      return t('careerPlans.scope.scenario_need_route');
    case 'bad_number':
      return prefix + t('careerPlans.scope.scenario_bad_pay');
    case 'bad_date':
      return prefix + t('careerPlans.scope.scenario_bad_date');
    case 'market_needs_source':
      return prefix + t('careerPlans.scope.scenario_market_needs_source');
    case 'too_long':
      return t('careerPlans.scenarios.validation.tooLong', { number: number ?? 1 });
  }
}

export function routeToInput(route: RouteDraft): ScenarioOptionInput {
  return {
    name: route.name.trim(),
    destination: route.destination.trim(),
    costCents: payToCents(route.cost),
    months: wholeOrBlank(route.months),
    wageCents: payToCents(route.pay),
    source: route.source,
    sourceName: route.sourceName.trim() || null,
    sourceDate: route.sourceDate.trim() || null,
    uncertainty: route.uncertainty,
    requirements: route.requirements.trim() || null,
    locationProfileId: route.locationProfileId || null,
    skillReportId: route.skillReportId || null,
  };
}

/**
 * The options to send: rows left completely blank are skipped, every other
 * row must be complete and valid, at most three are sent.
 */
export function buildScenarioOptions(
  routes: RouteDraft[],
): { ok: true; options: ScenarioOptionInput[] } | { ok: false; index: number | null; message: string } {
  const filled = routes.map((route, index) => ({ route, index })).filter(({ route }) => route.name.trim() || route.destination.trim());
  if (filled.length === 0) return { ok: false, index: null, message: problemMessage('need_route', null) };
  for (const { route, index } of filled) {
    const problem = routeProblem(route);
    if (problem) return { ok: false, index, message: problemMessage(problem, index + 1) };
  }
  return { ok: true, options: filled.slice(0, MAX_ROUTES).map(({ route }) => routeToInput(route)) };
}

/** Same routes and links, same signature: a retry reuses the idempotency key. */
export function scenarioSignature(options: ScenarioOptionInput[], title = ''): string {
  return JSON.stringify([title.trim(), options]);
}

/** A saved comparison back into editable drafts (amounts in whole units again). */
export function resultToDrafts(result: Pick<ScenarioResult, 'options'>): RouteDraft[] {
  const text = (cents: number | null) => (cents === null ? '' : String(cents / 100));
  const drafts = result.options.map((option) => ({
    name: option.name,
    destination: option.destination,
    pay: text(option.wageCents),
    cost: text(option.costCents),
    months: option.months === null ? '' : String(option.months),
    source: option.source,
    sourceName: option.sourceName ?? '',
    sourceDate: option.sourceDate ?? '',
    uncertainty: option.uncertainty,
    requirements: option.requirements ?? '',
    locationProfileId: option.locationProfileId ?? '',
    skillReportId: option.skillReportId ?? '',
  }));
  return drafts.length > 0 ? drafts : [{ ...BLANK_ROUTE }];
}

/** The confirmation before a paid comparison, with the balance before and after when known. */
export function confirmBody(remaining: number | null): string {
  if (remaining === null) return t('careerPlans.scope.scenario_confirm_body');
  return t('careerPlans.scope.scenario_confirm_balance', { remaining, after: Math.max(0, remaining - 1) });
}

/** An amount in whole currency units, or "unknown" (no currency is assumed). */
export function amountLabel(cents: number | null): string {
  if (cents === null) return t('careerPlans.scope.wage_unknown');
  return formatNumber(cents / 100, { maximumFractionDigits: 2 });
}

export function monthsLabel(months: number | null): string {
  return months === null ? t('careerPlans.scope.wage_unknown') : formatNumber(months);
}

export function sourceLabel(source: ScenarioSource): string {
  switch (source) {
    case 'market':
      return t('careerPlans.scope.source_market');
    case 'estimate':
      return t('careerPlans.scope.source_estimate');
    default:
      return t('careerPlans.scope.source_user');
  }
}

export function uncertaintyLabel(level: ScenarioUncertainty): string {
  switch (level) {
    case 'low':
      return t('careerPlans.scope.uncertainty_low');
    case 'medium':
      return t('careerPlans.scope.uncertainty_medium');
    case 'high':
      return t('careerPlans.scope.uncertainty_high');
    default:
      return t('careerPlans.scope.uncertainty_unknown');
  }
}

export function wageLabelText(label: ScenarioOptionView['wageLabel']): string {
  switch (label) {
    case 'user_supplied':
      return t('careerPlans.scope.wage_label_user_supplied');
    case 'market_data':
      return t('careerPlans.scope.wage_label_market_data');
    case 'estimate':
      return t('careerPlans.scope.wage_label_estimate');
    default:
      return t('careerPlans.scope.wage_label_unknown');
  }
}

/** "Pay unknown" or the amount entered (kept for older callers). */
export function payLabel(option: Pick<ScenarioOptionView, 'wageCents'>): string {
  if (option.wageCents === null) return t('careerPlans.scenarios.payUnknown');
  return t('careerPlans.scenarios.payEntered', { amount: formatNumber(option.wageCents / 100, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) });
}

export function scenarioErrorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    switch (error.code) {
      case 'plan_upgrade_required':
        return t('careerPlans.scenarios.errors.planUpgrade');
      case 'quota_exhausted':
      case 'capacity_exceeded':
        return t('careerPlans.scenarios.errors.quota');
      case 'feature_unavailable':
        return t('careerPlans.scenarios.errors.featureOff');
      case 'provider_unavailable':
        return providerUnavailableMessage();
      case 'validation_error':
        return t('careerPlans.scenarios.errors.invalid');
      default:
        break;
    }
  }
  return careerErrorMessage(error, t('careerPlans.scenarios.errors.createFailed'));
}

/** Editing or deleting a saved comparison (free). */
export function savedScenarioErrorMessage(error: unknown): string {
  if (error instanceof ApiError && error.code === 'not_found') return t('careerPlans.scenarios.errors.notFound');
  if (error instanceof ApiError && error.code === 'validation_error') return t('careerPlans.scenarios.errors.invalidEdit');
  return careerErrorMessage(error, t('careerPlans.scenarios.errors.saveFailed'));
}
