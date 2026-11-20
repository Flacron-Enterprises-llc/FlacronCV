'use client';

import { useTranslations } from 'next-intl';
import { ALLOWANCES } from '@flacroncv/career-shared';
import type { PlanAllowances, PlanId } from '@flacroncv/career-shared';
import { useSearchParams } from 'next/navigation';
import { Link, usePathname } from '@/i18n/routing';
import { cn } from '@/lib/utils';
import { useCareerAccess } from './CareerServices';
import { formExtensionAvailable } from './scope/ScopePanels';

/** The in-app template gallery (kept here so the nav model has no UI imports). */
export const TEMPLATES_HREF = '/cv/new/pick-template';

/**
 * One app, one navigation: the V1 pages and the career pages share the
 * dashboard sidebar, grouped by what the person is doing. `career` entries
 * come from the career service and only appear when it grants access.
 */
export const NAV_GROUPS = [
  {
    // Shown at the top, under the V1 dashboard, with no heading.
    key: 'home',
    links: [{ href: '/career', key: 'overview', career: true }],
  },
  {
    key: 'documents',
    links: [
      { href: '/cv', key: 'my_cvs', career: false },
      { href: '/cover-letters', key: 'my_cover_letters', career: false },
      { href: '/career/documents', key: 'documents', career: true },
      { href: TEMPLATES_HREF, key: 'templates', career: false },
    ],
  },
  {
    key: 'job_search',
    links: [
      { href: '/career/opportunities', key: 'opportunities', career: true },
      { href: '/jobs', key: 'job_tracker', career: false },
      { href: '/career/alerts', key: 'alerts', career: true },
      { href: '/career/action-pack', key: 'action_pack', career: true },
      { href: '/career/forms', key: 'forms', career: true },
      { href: '/career/learning-loop', key: 'learning_loop', career: true },
    ],
  },
  {
    key: 'interview',
    links: [
      { href: '/career/interviews', key: 'interviews', career: true },
      { href: '/career/coach', key: 'coach', career: true },
    ],
  },
  {
    key: 'career',
    links: [
      { href: '/career/profile', key: 'profile', career: true },
      { href: '/career/evidence', key: 'evidence', career: true },
      { href: '/career/portfolios', key: 'portfolios', career: true },
      { href: '/career/learning', key: 'learning', career: true },
      { href: '/career/relocation', key: 'relocation', career: true },
      { href: '/career/scenarios', key: 'scenarios', career: true },
      { href: '/career/maintenance', key: 'maintenance', career: true },
    ],
  },
  {
    key: 'business',
    links: [
      { href: '/career/business', key: 'business', career: true },
      { href: '/career/developer', key: 'developer', career: true },
    ],
  },
] as const;

/**
 * Sub-pages reached through tabs on their parent page rather than the
 * sidebar (voice is a mode of interview practice, the map a view of jobs).
 */
export const PAGE_TABS = [
  {
    key: 'interviews',
    tabs: [
      { href: '/career/interviews', key: 'tab_text' },
      { href: '/career/interviews/voice', key: 'tab_voice' },
    ],
  },
  {
    key: 'opportunities',
    tabs: [
      { href: '/career/opportunities', key: 'tab_list' },
      { href: '/career/opportunities/map', key: 'tab_map' },
    ],
  },
] as const;

/**
 * Pages whose actions sit behind an operator switch (`feature_flags`, else the
 * catalog phase; see career-server `isFeatureEnabled`). `/access` reports each
 * switch. The career API refuses the calls either way; navigation only hides
 * what cannot be used yet.
 */
export const LINK_FEATURE: Record<string, string> = {
  '/career/evidence': 'evidenceItems',
  '/career/portfolios': 'portfolioPages',
  '/career/opportunities/map': 'mapSessions',
  '/career/action-pack': 'actionPacks',
  '/career/forms': 'assistedForms',
  '/career/learning-loop': 'applicationAnalytics',
  '/career/coach': 'coachingResponses',
  '/career/interviews/voice': 'voiceMinutes',
  '/career/learning': 'skillReports',
  '/career/scenarios': 'scenarioReports',
  '/career/business': 'staffSeats',
  '/career/developer': 'staffSeats',
};

/** The plan allowance that decides whether a page is in the caller's plan. */
export const LINK_ALLOWANCE: Record<string, keyof PlanAllowances> = {
  '/career/evidence': 'evidenceItems',
  '/career/portfolios': 'portfolioPages',
  '/career/opportunities/map': 'mapSessions',
  '/career/action-pack': 'actionPacks',
  '/career/forms': 'assistedForms',
  '/career/learning-loop': 'applicationAnalytics',
  '/career/coach': 'coachingResponses',
  '/career/interviews/voice': 'voiceMinutes',
  '/career/learning': 'skillReports',
  '/career/scenarios': 'scenarioReports',
  '/career/business': 'staffSeats',
  '/career/developer': 'staffSeats',
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

type Access = { enabled?: boolean; features?: Record<string, boolean>; careerPlan?: string } | undefined;

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

/** Whether a page can be used now, is not open yet, or needs a higher plan. */
export function linkState(href: string, access: Access): CareerLinkState {
  if (LINK_COMING[href]?.() || !linkSwitchedOn(href, access?.features)) return 'soon';
  if (!planIncludes(href, access?.careerPlan)) return 'plan';
  return 'available';
}

export interface SidebarLink {
  href: string;
  key: string;
  career: boolean;
  /** `plan`: shown with a lock; the page explains the upgrade. */
  state: 'available' | 'plan';
}

/**
 * The sidebar, for this person. Pages that are not open yet are left out
 * rather than listed as "coming soon"; pages a higher plan unlocks stay, with
 * a lock. Team tools only appear for plans that include them. Without career
 * access (or while it loads) only the V1 pages are listed.
 */
export function sidebarGroups(access: Access): Array<{ key: string; links: SidebarLink[] }> {
  const career = access?.enabled === true;
  return NAV_GROUPS.map((group) => ({
    key: group.key as string,
    links: group.links.flatMap((link): SidebarLink[] => {
      if (!link.career) return [{ href: link.href, key: link.key, career: false, state: 'available' }];
      if (!career) return [];
      const state = linkState(link.href, access);
      if (state === 'soon') return [];
      if (group.key === 'business' && state !== 'available') return [];
      return [{ href: link.href, key: link.key, career: true, state }];
    }),
  })).filter((group) => group.links.length > 0);
}

/** The tabs a page shows: only those that can be opened (a single tab shows no bar). */
export function pageTabs(pathname: string, access: Access): Array<{ href: string; key: string; state: 'available' | 'plan' }> | null {
  const family = PAGE_TABS.find((entry) => entry.tabs.some((tab) => tab.href === pathname));
  if (!family || access?.enabled !== true) return null;
  const tabs = family.tabs.flatMap((tab) => {
    const state = linkState(tab.href, access);
    return state === 'soon' ? [] : [{ href: tab.href as string, key: tab.key as string, state }];
  });
  return tabs.length > 1 ? tabs : null;
}

/**
 * Text / voice practice and list / map view, as a segmented control at the
 * top of those pages. Everything else is reached from the sidebar.
 */
export function CareerPageTabs() {
  const t = useTranslations('career.nav');
  const pathname = usePathname();
  const access = useCareerAccess();
  // Switching between text and voice keeps the listing being practised.
  const opportunityId = useSearchParams()?.get('opportunityId');
  const tabs = pageTabs(pathname, access.data);
  if (!tabs) return null;
  const query = opportunityId ? `?opportunityId=${encodeURIComponent(opportunityId)}` : '';
  return (
    <nav aria-label={t('label')} className="mb-6">
      <ul className="inline-flex gap-1 rounded-xl border border-stone-200 bg-stone-100/70 p-1 dark:border-stone-700 dark:bg-stone-800/60">
        {tabs.map((tab) => {
          const active = tab.href === pathname;
          return (
            <li key={tab.href}>
              <Link
                href={`${tab.href}${query}`}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  'inline-flex min-h-[2.25rem] items-center rounded-lg px-4 text-sm font-semibold transition-colors',
                  active
                    ? 'bg-white text-stone-900 shadow-sm dark:bg-stone-900 dark:text-white'
                    : 'text-stone-600 hover:text-stone-900 dark:text-stone-400 dark:hover:text-white',
                )}
              >
                {t(tab.key)}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
