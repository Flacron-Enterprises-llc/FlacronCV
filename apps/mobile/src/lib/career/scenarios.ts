import { ApiError } from '../../../../../packages/career-api-client/src/client';
import type { ScenarioOptionView } from '../../../../../packages/career-api-client/src/types';
import { careerErrorMessage } from '../career-view';
import { PROVIDER_UNAVAILABLE_MESSAGE } from './action-packs';

/**
 * Pure logic for the mobile scenario planner (tested in scenarios.test.ts).
 * Same request as the website's scenario page: up to three routes, each a
 * name + destination, pay in cents or blank (unknown), cost 0 and 12 months,
 * source "user". Uses one scenario-report credit. The comparison is not a
 * promise of earnings or employment.
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

export type ScenarioOptionInput = {
  name: string;
  destination: string;
  costCents: number;
  months: number;
  wageCents: number | null;
  source: 'user';
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
      return { ok: false, index, message: `Route ${index + 1}: keep the name and destination under 120 characters.` };
    }
    const wage = route.wage.trim();
    if (wage !== '' && !/^\d{1,12}$/.test(wage)) {
      return { ok: false, index, message: `Route ${index + 1}: pay must be a whole number of cents, or blank when unknown.` };
    }
    options.push({ name, destination, costCents: 0, months: 12, wageCents: wage === '' ? null : Number(wage), source: 'user' });
  }
  if (options.length === 0) return { ok: false, index: null, message: 'Give at least one route a name and a destination.' };
  return { ok: true, options: options.slice(0, MAX_ROUTES) };
}

export function scenarioSignature(options: ScenarioOptionInput[]): string {
  return JSON.stringify(options.map((o) => [o.name, o.destination, o.wageCents]));
}

/** "Pay unknown" or the amount the user entered, shown in currency units (no currency is assumed). */
export function payLabel(option: Pick<ScenarioOptionView, 'wageCents'>): string {
  if (option.wageCents === null) return 'Pay unknown';
  const units = option.wageCents / 100;
  return `Pay you entered: ${units.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function scenarioErrorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    switch (error.code) {
      case 'plan_upgrade_required':
        return 'Scenario reports start on a higher career plan. Nothing was saved.';
      case 'quota_exhausted':
      case 'capacity_exceeded':
        return 'Your scenario report allowance is used up. Nothing extra was saved.';
      case 'feature_unavailable':
        return 'The scenario planner is not open yet. No credit was used.';
      case 'provider_unavailable':
        return PROVIDER_UNAVAILABLE_MESSAGE;
      case 'validation_error':
        return 'Each route needs a name and a destination. No credit was used.';
      default:
        break;
    }
  }
  return careerErrorMessage(error, 'The comparison was not created. No credit was used.');
}
