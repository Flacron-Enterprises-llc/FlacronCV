'use client';

import { type ReactNode, useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Lock, ShieldCheck, Trash2 } from 'lucide-react';
import type { BillingInterval } from '@flacroncv/career-shared';
import { Link } from '@/i18n/routing';
import { useInView } from '@/hooks/useInView';
import { fcgePricingVisited } from '@/lib/fcge';
import { onConsentChange } from '@/lib/consent';
import { IntervalToggle } from '@/components/pricing/IntervalToggle';
import { PlanCards, PlanTermsNote } from '@/components/pricing/PlanCards';

/**
 * The five public plans (spec §5) with a monthly/annual toggle. Used on the
 * homepage and as the top of `/pricing`, which adds the comparison, add-ons,
 * calculator and Contact Sales below.
 */
export default function Pricing({
  intro,
  interval: controlledInterval,
  onIntervalChange,
  fullPage = false,
}: {
  /**
   * Replaces the section's own heading and subtitle. `/pricing` passes its
   * page <h1> here so the page does not stack two headings that say the same
   * thing, and so its intro sits inside this section's padding and background.
   */
  intro?: ReactNode;
  /** `/pricing` shares one interval between the cards and the comparison table. */
  interval?: BillingInterval;
  onIntervalChange?: (next: BillingInterval) => void;
  /** On `/pricing` the comparison and Contact Sales are on the same page. */
  fullPage?: boolean;
} = {}) {
  const t = useTranslations();
  const tPlans = useTranslations('plan_catalog');
  const [ownInterval, setOwnInterval] = useState<BillingInterval>('monthly');
  const interval = controlledInterval ?? ownInterval;
  const changeInterval = onIntervalChange ?? setOwnInterval;
  const { ref: sectionRef, isInView } = useInView({ threshold: 0.1 });

  useEffect(() => {
    if (!isInView) return;
    fcgePricingVisited();
    return onConsentChange(() => fcgePricingVisited());
  }, [isInView]);

  return (
    <section id="pricing" className="bg-stone-50 py-16 sm:py-20 dark:bg-stone-900/50">
      <div
        ref={sectionRef}
        className={`mx-auto max-w-7xl px-4 transition-all duration-700 sm:px-6 lg:px-8 ${isInView ? 'translate-y-0 opacity-100' : 'translate-y-8 opacity-0'}`}
      >
        <div className="mx-auto max-w-2xl text-center">
          {intro ?? (
            <>
              <h2 className="text-3xl font-extrabold tracking-tight text-stone-900 sm:text-4xl dark:text-white">
                {t('pricing.title')}
              </h2>
              <p className="mt-4 text-lg text-stone-600 dark:text-stone-400">{tPlans('section_subtitle')}</p>
            </>
          )}
          <IntervalToggle className="mt-8" value={interval} onChange={changeInterval} />
          <p className="mt-3 text-xs text-stone-500 dark:text-stone-400">{tPlans('annual_toggle_note')}</p>
        </div>

        {/* One left-aligned column on phones: a centred grid of different-length
            phrases wrapped into a ragged block at 390px. */}
        <div className="mx-auto mt-8 flex w-fit flex-col items-start gap-y-2 text-sm text-stone-500 sm:w-auto sm:flex-row sm:flex-wrap sm:items-center sm:justify-center sm:gap-x-8 dark:text-stone-400">
          <div className="flex items-center gap-2">
            <Lock className="h-4 w-4 text-emerald-500" aria-hidden />
            {t('pricing.trust_stripe')}
          </div>
          <div className="flex items-center gap-2">
            <ShieldCheck className="h-4 w-4 text-emerald-500" aria-hidden />
            {t('pricing.trust_data')}
          </div>
          <div className="flex items-center gap-2">
            <Trash2 className="h-4 w-4 text-emerald-500" aria-hidden />
            {t('pricing.trust_cancel')}
          </div>
        </div>

        <div className="mt-10">
          {/* Under the page's own h1 (full pricing page) the plan names are h2; under this section's h2 they are h3. */}
          <PlanCards interval={interval} headingLevel={intro ? 'h2' : 'h3'} contactSalesHref={fullPage ? '#contact-sales' : '/pricing#contact-sales'} />
        </div>
        <PlanTermsNote />

        {fullPage ? null : (
          <p className="mt-6 text-center">
            <Link
              href="/pricing#compare"
              className="rounded text-sm font-semibold text-brand-700 underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 dark:text-brand-400"
            >
              {tPlans('compare_link')}
            </Link>
          </p>
        )}

        {/* Purchase terms near the point of purchase: credits, rollover,
            renewal, cancellation, refunds and taxes. */}
        <div className="mx-auto mt-8 max-w-3xl rounded-xl border border-stone-200 bg-white p-5 dark:border-stone-700 dark:bg-stone-800/50">
          <h3 className="text-sm font-semibold text-stone-900 dark:text-white">{t('pricing.terms_title')}</h3>
          <dl className="mt-3 grid gap-x-8 gap-y-3 sm:grid-cols-2">
            {(['credit', 'rollover', 'renewal', 'cancellation', 'refunds', 'taxes'] as const).map((k) => (
              <div key={k}>
                <dt className="text-xs font-semibold text-stone-700 dark:text-stone-300">{t(`pricing.terms_${k}_title`)}</dt>
                <dd className="mt-0.5 text-xs text-stone-500 dark:text-stone-400">{t(`pricing.terms_${k}_desc`)}</dd>
              </div>
            ))}
          </dl>
        </div>
      </div>
    </section>
  );
}
