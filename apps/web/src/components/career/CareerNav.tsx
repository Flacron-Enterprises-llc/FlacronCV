'use client';

import { useTranslations } from 'next-intl';
import { ALLOWANCES } from '@flacroncv/career-shared';
import type { PlanAllowances, PlanId } from '@flacroncv/career-shared';
import { Link, usePathname } from '@/i18n/routing';
import { cn } from '@/lib/utils';
import { useCareerAccess } from './CareerServices';
import { formExtensionAvailable } from './scope/ScopePanels';

/**
 * The career area's own navigation, inside V1's dashboard shell. Grouped so
 * the V1 sidebar needs one entry, not twenty.
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
      ['/career/action-pack', 'action_pack'],
      ['/career/forms', 'forms'],
      ['/career/learning-loop', 'learning_loop'],
    ],
  },
  {
    key: 'growth',
    links: [
      ['/career/interviews', 'interviews'],
      ['/career/interviews/voice', 'voice'],
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

/**
 * Pages whose actions sit behind an operator switch (`feature_flags`, else the
 * catalog phase; see career-server `isFeatureEnabled`). `/access` reports each
 * switch; a page whose switch is off is shown as "coming soon". The career
 * API refuses the calls either way: the badge is only an honest label.
 */
export const LINK_FEATURE: Record<string, string> = {
  '/career/evidence': 'evidenceItems',
  '/career/portfolios': 'portfolioPages',
  '/career/opportunities/map': 'mapSessions',
  '/career/action-pack': 'actionPacks',
  '/career/forms': 'assistedForms',
  '/career/learning-loop': 'applicationAnalytics',
  '/career/interviews/voice': 'voiceMinutes',
  '/career/learning': 'skillReports',
  '/career/scenarios': 'scenarioReports',
  '/career/business': 'staffSeats',
};

/** The plan allowance that decides whether a page is in the caller's plan. */
export const LINK_ALLOWANCE: Record<string, keyof PlanAllowances> = {
  '/career/evidence': 'evidenceItems',
  '/career/portfolios': 'portfolioPages',
  '/career/opportunities/map': 'mapSessions',
  '/career/action-pack': 'actionPacks',
  '/career/forms': 'assistedForms',
  '/career/learning-loop': 'applicationAnalytics',
  '/career/interviews/voice': 'voiceMinutes',
  '/career/learning': 'skillReports',
  '/career/scenarios': 'scenarioReports',
  '/career/business': 'staffSeats',
};

/**
 * Areas that cannot be bought or used yet whatever the switches say:
 * employer recruiting and human services stay closed until their pricing
 * and providers are agreed; the form extension until it is published.
 */
const LINK_COMING: Record<string, () => boolean> = {
  '/career/forms': () => !formExtensionAvailable(),
  '/career/recruiting': () => true,
  '/career/services': () => true,
};

export type CareerLinkState = 'available' | 'soon' | 'plan';

export function linkSwitchedOn(href: string, features: Record<string, boolean> | undefined): boolean {
  const feature = LINK_FEATURE[href];
  return !feature || features?.[feature] === true;
}

function planIncludes(href: string, careerPlan: string | undefined): boolean {
  const field = LINK_ALLOWANCE[href];
  if (!field || !careerPlan || !(careerPlan in ALLOWANCES)) return true;
  const value = ALLOWANCES[careerPlan as PlanId][field];
  if (value === null || value === false || value === 'none') return false;
  return true;
}

/**
 * Spec section 21: every area is listed as available, coming soon, or not in
 * the caller's plan, instead of being hidden.
 */
export function linkState(
  href: string,
  access: { features?: Record<string, boolean>; careerPlan?: string } | undefined,
): CareerLinkState {
  if (LINK_COMING[href]?.() || !linkSwitchedOn(href, access?.features)) return 'soon';
  if (!planIncludes(href, access?.careerPlan)) return 'plan';
  return 'available';
}

function isActive(pathname: string, href: string): boolean {
  if (href === '/career') return pathname === '/career';
  // The most specific link wins: /career/opportunities/map is not also /career/opportunities.
  const all = CAREER_SECTIONS.flatMap((section) => section.links.map(([link]) => link as string));
  const longest = all.filter((link) => pathname === link || pathname.startsWith(`${link}/`)).sort((a, b) => b.length - a.length)[0];
  return longest === href;
}

export function CareerNav() {
  const t = useTranslations('career.nav');
  const pathname = usePathname();
  const access = useCareerAccess();
  // Without access the gate explains why; a menu of closed pages would only mislead.
  if (!access.data?.enabled) return null;
  return (
    <nav aria-label={t('label')} className="mb-6 space-y-3 sm:space-y-2">
      {CAREER_SECTIONS.map((section) => (
        // Links wrap instead of scrolling sideways: on a phone a cut-off row
        // hid entries mid-word with nothing to show there was more.
        <div key={section.key} className="flex min-w-0 flex-col gap-1 sm:flex-row sm:items-start sm:gap-2">
          <span className="shrink-0 pt-0 text-xs font-semibold uppercase tracking-wide text-stone-500 dark:text-stone-400 sm:w-20 sm:pt-2.5">
            {t(`group_${section.key}`)}
          </span>
          <ul className="flex min-w-0 flex-wrap gap-1">
            {section.links.map(([href, key]) => {
              const active = isActive(pathname, href);
              const state = linkState(href, access.data);
              return (
                <li key={href}>
                  <Link
                    href={href}
                    aria-current={active ? 'page' : undefined}
                    className={cn(
                      'inline-flex min-h-[2.25rem] items-center gap-1.5 rounded-lg px-3 text-sm font-medium transition-colors',
                      active
                        ? 'bg-brand-50 text-brand-700 dark:bg-brand-950/40 dark:text-brand-300'
                        : state === 'available'
                          ? 'text-stone-600 hover:bg-stone-100 hover:text-stone-900 dark:text-stone-300 dark:hover:bg-stone-800 dark:hover:text-white'
                          : 'text-stone-500 hover:bg-stone-100 dark:text-stone-400 dark:hover:bg-stone-800',
                    )}
                  >
                    {t(key)}
                    {state === 'available' ? null : (
                      <span className="rounded bg-stone-100 px-1.5 py-0.5 text-[11px] font-semibold leading-none text-stone-600 dark:bg-stone-800 dark:text-stone-300">
                        {t(state === 'soon' ? 'state_soon' : 'state_plan')}
                      </span>
                    )}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
  );
}
