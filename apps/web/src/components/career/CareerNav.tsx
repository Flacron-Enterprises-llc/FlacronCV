'use client';

import { useTranslations } from 'next-intl';
import { Link, usePathname } from '@/i18n/routing';
import { cn } from '@/lib/utils';
import { useCareerAccess } from './CareerServices';

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
    <nav aria-label={t('label')} className="mb-6 space-y-2">
      {CAREER_SECTIONS.map((section) => (
        <div key={section.key} className="flex min-w-0 items-center gap-2">
          <span className="w-20 shrink-0 text-xs font-semibold uppercase tracking-wide text-stone-500 dark:text-stone-400">
            {t(`group_${section.key}`)}
          </span>
          <ul className="flex min-w-0 gap-1 overflow-x-auto pb-1">
            {section.links.map(([href, key]) => {
              const active = isActive(pathname, href);
              return (
                <li key={href} className="shrink-0">
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
