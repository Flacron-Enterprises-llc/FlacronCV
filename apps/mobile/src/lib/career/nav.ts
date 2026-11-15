import { ALLOWANCES, type PlanAllowances, type PlanId } from '../../../../../packages/career-shared/src/catalog';
import type { CareerAccessView } from '../../../../../packages/career-api-client/src/types';
import { t } from '../../i18n';

/**
 * Career area states (website: components/career/CareerNav.tsx). Spec
 * section 21: every area is listed as available, coming soon, or not in the
 * caller's plan, instead of being hidden. The state is only an honest label:
 * the career API refuses the calls either way.
 *
 * Links are the website's paths (`/career/...`); `mobileRoute` turns one into
 * the app route. Copy lives in `careerBusiness.nav`.
 */

export const CAREER_SECTIONS = [
  {
    key: 'profile',
    links: [
      ['/career', 'overview'],
      ['/career/profile', 'profile'],
      ['/career/evidence', 'evidence'],
      ['/career/portfolios', 'portfolios'],
      ['/career/documents', 'documents'],
    ],
  },
  {
    key: 'jobs',
    links: [
      ['/career/opportunities', 'opportunities'],
      ['/career/opportunities/map', 'map'],
      ['/career/alerts', 'alerts'],
      ['/career/action-pack', 'actionPack'],
      ['/career/forms', 'forms'],
      ['/career/learning-loop', 'learningLoop'],
    ],
  },
  {
    key: 'growth',
    links: [
      ['/career/interviews', 'interviews'],
      ['/career/interviews/voice', 'voice'],
      ['/career/coach', 'coach'],
      ['/career/learning', 'learning'],
      ['/career/relocation', 'relocation'],
      ['/career/scenarios', 'scenarios'],
      ['/career/maintenance', 'maintenance'],
    ],
  },
  {
    key: 'teams',
    links: [
      ['/career/business', 'business'],
      ['/career/recruiting', 'recruiting'],
      ['/career/developer', 'developer'],
      ['/career/services', 'services'],
      ['/career/data', 'data'],
    ],
  },
] as const;

export type CareerHref = (typeof CAREER_SECTIONS)[number]['links'][number][0];
export type CareerSectionKey = (typeof CAREER_SECTIONS)[number]['key'];

/** Pages whose actions sit behind an operator switch (`/access` features). */
export const LINK_FEATURE: Partial<Record<CareerHref, string>> = {
  '/career/evidence': 'evidenceItems',
  '/career/portfolios': 'portfolioPages',
  '/career/opportunities/map': 'mapSessions',
  '/career/action-pack': 'actionPacks',
  '/career/forms': 'assistedForms',
  '/career/learning-loop': 'applicationAnalytics',
  '/career/interviews/voice': 'voiceMinutes',
  '/career/coach': 'coachingResponses',
  '/career/learning': 'skillReports',
  '/career/scenarios': 'scenarioReports',
  '/career/business': 'staffSeats',
};

/** The plan allowance that decides whether a page is in the caller's plan. */
export const LINK_ALLOWANCE: Partial<Record<CareerHref, keyof PlanAllowances>> = {
  '/career/evidence': 'evidenceItems',
  '/career/portfolios': 'portfolioPages',
  '/career/opportunities/map': 'mapSessions',
  '/career/action-pack': 'actionPacks',
  '/career/forms': 'assistedForms',
  '/career/learning-loop': 'applicationAnalytics',
  '/career/interviews/voice': 'voiceMinutes',
  '/career/coach': 'coachingResponses',
  '/career/learning': 'skillReports',
  '/career/scenarios': 'scenarioReports',
  '/career/business': 'staffSeats',
};

/**
 * Areas that cannot be used yet whatever the switches say. Employer
 * recruiting and human services stay closed until pricing and providers are
 * agreed. Form filling needs a browser helper on a computer, which is not
 * published, and the app has no form helper of its own, so it is always
 * "coming soon" here (the website reads NEXT_PUBLIC_CAREER_FORM_EXTENSION).
 */
export const LINK_COMING: readonly CareerHref[] = ['/career/forms', '/career/recruiting', '/career/services'];

export type CareerLinkState = 'available' | 'soon' | 'plan';

type AccessLike = Pick<CareerAccessView, 'features' | 'careerPlan'> | undefined | null;

export function linkSwitchedOn(href: CareerHref, features: Record<string, boolean> | undefined): boolean {
  const feature = LINK_FEATURE[href];
  return !feature || features?.[feature] === true;
}

/** Whether the caller's plan includes the page. An unknown plan is not refused here (the API decides). */
export function planIncludes(href: CareerHref, careerPlan: string | undefined): boolean {
  const field = LINK_ALLOWANCE[href];
  if (!field || !careerPlan || !Object.prototype.hasOwnProperty.call(ALLOWANCES, careerPlan)) return true;
  const value = ALLOWANCES[careerPlan as PlanId][field];
  return !(value === null || value === undefined || value === false || value === 'none');
}

export function linkState(href: CareerHref, access: AccessLike): CareerLinkState {
  if (LINK_COMING.includes(href) || !linkSwitchedOn(href, access?.features)) return 'soon';
  if (!planIncludes(href, access?.careerPlan)) return 'plan';
  return 'available';
}

/** The app route for a website career path. */
export function mobileRoute(href: CareerHref): string {
  return href === '/career' ? '/(dashboard)/career' : `/(dashboard)${href}`;
}

/** The area's name in the current language. */
export function linkLabel(key: string): string {
  return t(`careerBusiness.nav.${key}`);
}

/** The badge text for a state; null when the area is available. */
export function stateLabel(state: CareerLinkState): string | null {
  if (state === 'soon') return t('careerBusiness.nav.stateSoon');
  if (state === 'plan') return t('careerBusiness.nav.statePlan');
  return null;
}

export interface CareerLinkRow {
  href: CareerHref;
  key: string;
  route: string;
  state: CareerLinkState;
}

/** Every area grouped by section, each with its state, for a menu or the plans screen. */
export function careerLinkRows(access: AccessLike): { key: CareerSectionKey; links: CareerLinkRow[] }[] {
  return CAREER_SECTIONS.map((section) => ({
    key: section.key,
    links: section.links.map(([href, key]) => ({ href, key, route: mobileRoute(href), state: linkState(href, access) })),
  }));
}
