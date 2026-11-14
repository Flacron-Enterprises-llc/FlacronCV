import { ApiError } from '../../../../../packages/career-api-client/src/client';
import type { ScenarioOptionInput as SharedScenarioOptionInput, ScenarioOptionView } from '../../../../../packages/career-api-client/src/types';
import { formatNumber, t } from '../../i18n';
import { careerErrorMessage } from '../career-view';
import { providerUnavailableMessage } from './action-packs';

/**
 * Pure logic for the mobile scenario planner (tested in scenarios.test.ts).
 * Up to three routes, each a name + destination and pay in cents or blank
 * (unknown), source "user" (the person's own figures). The app does not ask
 * for cost or duration, so both are sent as unknown (null) — never as 0 or an
 * invented 12 months. Uses one scenario-report credit. The comparison is not
 * a promise of earnings or employment. Reopening and editing saved
 * comparisons is on the website for now.
 */

export const MAX_ROUTES = 3;

export interface RouteDraft {
  name: string;
  destination: string;
  /** Pay in cents as typed; blank means unknown. */
  wage: string;
}

export const FIRST_ROUTE: RouteDraft = { name: 'Stay', destination: 'London', wage: '' };
export const BLANK_ROUTE: RouteDraft = { name: '', destination: '', wage: '' };

export type ScenarioOptionInput = SharedScenarioOptionInput & { source: 'user' };

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

/**
 * Builds the options the website sends: rows without a name or destination
 * are skipped, at most three are sent. A pay value must be a whole number of
 * cents (digits only); the website's free text field would silently turn
 * anything else into "unknown", so the app asks instead.
 */
export function buildScenarioOptions(
  routes: RouteDraft[],
): { ok: true; options: ScenarioOptionInput[] } | { ok: false; index: number | null; message: string } {
  const options: ScenarioOptionInput[] = [];
  for (let index = 0; index < routes.length; index += 1) {
    const route = routes[index];
    const name = route.name.trim();
    const destination = route.destination.trim();
    if (name.length === 0 || destination.length === 0) continue;
    if (name.length > 120 || destination.length > 120) {
      return { ok: false, index, message: t('careerPlans.scenarios.validation.tooLong', { number: index + 1 }) };
    }
    const wage = route.wage.trim();
    if (wage !== '' && !/^\d{1,12}$/.test(wage)) {
      return { ok: false, index, message: t('careerPlans.scenarios.validation.payInvalid', { number: index + 1 }) };
    }
    options.push({ name, destination, costCents: null, months: null, wageCents: wage === '' ? null : Number(wage), source: 'user' });
  }
  if (options.length === 0) return { ok: false, index: null, message: t('careerPlans.scenarios.validation.noRoutes') };
  return { ok: true, options: options.slice(0, MAX_ROUTES) };
}

export function scenarioSignature(options: ScenarioOptionInput[]): string {
  return JSON.stringify(options.map((o) => [o.name, o.destination, o.wageCents]));
}

/** "Pay unknown" or the amount the user entered, shown in currency units (no currency is assumed). */
export function payLabel(option: Pick<ScenarioOptionView, 'wageCents'>): string {
  if (option.wageCents === null) return t('careerPlans.scenarios.payUnknown');
  const units = option.wageCents / 100;
  return t('careerPlans.scenarios.payEntered', { amount: formatNumber(units, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) });
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
