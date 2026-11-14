'use client';

import { useTranslations } from 'next-intl';
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
      ['/career/plans', 'plans'],
      ['/career/data', 'data'],
    ],
  },
] as const;

/**
 * Pages whose actions sit behind an operator switch (`feature_flags`, else the
 * catalog phase; see career-server `isFeatureEnabled`). `/access` reports each
 * switch; a page whose switch is off is left out of the menu, because every
 * action on it would answer `feature_unavailable`. Hiding is only navigation:
 * the career API refuses the calls either way.
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

export function linkSwitchedOn(href: string, features: Record<string, boolean> | undefined): boolean {
  const feature = LINK_FEATURE[href];
  return !feature || features?.[feature] === true;
}

/**
 * Pages only one plan can use. The operator switch for staff seats is on
 * for everyone, but only the Business plan has seats, so other plans would
 * reach a page where every action is refused.
 */
export const LINK_PLAN: Record<string, string> = {
  '/career/business': 'business',
};

/** Pages whose tool is not published yet; see `formExtensionAvailable`. */
const LINK_RELEASED: Record<string, () => boolean> = {
  '/career/forms': formExtensionAvailable,
};

export function linkVisible(
  href: string,
  access: { features?: Record<string, boolean>; careerPlan?: string } | undefined,
): boolean {
  if (!linkSwitchedOn(href, access?.features)) return false;
  const plan = LINK_PLAN[href];
  if (plan && access?.careerPlan !== plan) return false;
  const released = LINK_RELEASED[href];
  return !released || released();
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
            {section.links.filter(([href]) => linkVisible(href, access.data)).map(([href, key]) => {
              const active = isActive(pathname, href);
              return (
                <li key={href}>
                  <Link
                    href={href}
                    aria-current={active ? 'page' : undefined}
                    className={cn(
                      'inline-flex min-h-[2.25rem] items-center rounded-lg px-3 text-sm font-medium transition-colors',
                      active
                        ? 'bg-brand-50 text-brand-700 dark:bg-brand-950/40 dark:text-brand-300'
                        : 'text-stone-600 hover:bg-stone-100 hover:text-stone-900 dark:text-stone-300 dark:hover:bg-stone-800 dark:hover:text-white',
                    )}
                  >
                    {t(key)}
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
