'use client';

import { useTranslations } from 'next-intl';
import { ArrowRight, Compass } from 'lucide-react';
import { PLANS, formatUsd } from '@flacroncv/career-shared';
import { Link } from '@/i18n/routing';
import { careerBuildEnabled } from '@/lib/career-switch';

/** Lowest monthly price of a career plan that is sold as an add-on (Starter). */
export function careerAddonFromCents(): number {
  return Math.min(PLANS.starter.monthlyCents, PLANS.professional.monthlyCents, PLANS.career_pro.monthlyCents);
}

/**
 * Small, separate note under the homepage pricing section: the career tools
 * are an optional add-on with their own prices. FlacronCV's plan cards above
 * are not touched. Rendered only when the career build switch is on.
 */
export default function CareerAddonTeaser() {
  const t = useTranslations('career_pricing');
  if (!careerBuildEnabled()) return null;
  return (
    <section aria-labelledby="career-addon-teaser-title" className="bg-stone-50 pb-16 sm:pb-20 dark:bg-stone-900/50">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="mx-auto flex max-w-3xl flex-col gap-4 rounded-2xl border border-dashed border-stone-300 bg-white p-5 sm:flex-row sm:items-center sm:justify-between dark:border-stone-600 dark:bg-stone-800">
          <div className="flex items-start gap-3">
            <Compass className="mt-0.5 h-5 w-5 shrink-0 text-brand-600 dark:text-brand-400" aria-hidden="true" />
            <div>
              <h3 id="career-addon-teaser-title" className="text-base font-semibold text-stone-900 dark:text-white">
                {t('teaser_title', { amount: formatUsd(careerAddonFromCents()) })}
              </h3>
              <p className="mt-1 text-sm text-stone-600 dark:text-stone-400">{t('teaser_body')}</p>
            </div>
          </div>
          <Link
            href="/pricing#career"
            className="inline-flex shrink-0 items-center gap-1.5 rounded-lg text-sm font-semibold text-brand-700 underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 dark:text-brand-400"
          >
            {t('teaser_link')}
            <ArrowRight className="h-4 w-4 rtl:rotate-180" aria-hidden="true" />
          </Link>
        </div>
      </div>
    </section>
  );
}
