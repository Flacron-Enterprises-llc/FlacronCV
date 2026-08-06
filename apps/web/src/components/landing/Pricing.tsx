'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/routing';
import { Check, ShieldCheck, Lock, Trash2, Zap } from 'lucide-react';
import Button from '@/components/ui/Button';
import Badge from '@/components/ui/Badge';
import {
  PLAN_CONFIGS,
  SubscriptionPlan,
  customerFacingPlans,
  YEARLY_BILLING_ENABLED,
  yearlySavings,
  yearlySavingsPercent,
} from '@flacroncv/shared-types';
import { cn } from '@/lib/utils';
import { useInView } from '@/hooks/useInView';
import { useAuth } from '@/providers/AuthProvider';

/** Per-plan presentation. Which of these actually render is decided by
 *  `customerFacingPlans()` — see the visibility rule in shared-types. */
const PLAN_PRESENTATION: Record<
  SubscriptionPlan,
  { featured: boolean; bestForKey: string; ctaKey: string }
> = {
  [SubscriptionPlan.FREE]: {
    featured: false,
    bestForKey: 'pricing.best_for_free',
    ctaKey: 'pricing.get_started',
  },
  [SubscriptionPlan.PRO]: {
    featured: true,
    bestForKey: 'pricing.best_for_pro',
    ctaKey: 'pricing.upgrade',
  },
  [SubscriptionPlan.CAREER_ACCELERATOR]: {
    featured: false,
    bestForKey: 'pricing.best_for_career_accelerator',
    ctaKey: 'pricing.upgrade',
  },
  [SubscriptionPlan.ENTERPRISE]: {
    featured: false,
    bestForKey: 'pricing.best_for_enterprise',
    // Enterprise has a real Stripe price and the in-app billing page sells it
    // directly, so advertising "Contact Sales" here sent the two flows in
    // different directions. Self-serve upgrade, consistent with billing.
    ctaKey: 'pricing.upgrade',
  },
};

export default function Pricing() {
  const t = useTranslations();
  const { user } = useAuth();
  const [yearly, setYearly] = useState(false);
  const { ref: sectionRef, isInView } = useInView({ threshold: 0.1 });

  // Resolve the CTA destination based on auth state so logged-in users never
  // bounce through /register on their way to the app.
  //
  //   not signed in            → /register
  //   signed in, Free plan     → /dashboard for Free, /settings/billing to buy
  //   signed in, already PAID  → /contact-us
  //
  // That last case matters: /settings/billing only renders its upgrade cards
  // when the visitor is on the Free plan (the page gates them behind
  // `isFreePlan`, because a paid subscriber changes plan through the Stripe
  // portal). Sending a Pro subscriber there from an "Upgrade" button under
  // Enterprise dropped them on a page with no Enterprise card and no way to
  // buy it — a dead end. Until in-app plan switching exists for paid users,
  // routing them to a human is the honest destination.
  const isPaidSubscriber = !!user && user.subscription?.plan !== SubscriptionPlan.FREE;

  const planCtaHref = (key: SubscriptionPlan): string => {
    if (!user) return '/register';
    if (key === SubscriptionPlan.FREE) return '/dashboard';
    return isPaidSubscriber ? '/contact-us' : '/settings/billing';
  };

  // Shown plans come from the shared visibility rule, so this page and the
  // in-app billing comparison can never advertise different catalogues.
  const plans = customerFacingPlans().map((key) => ({
    key,
    featured: PLAN_PRESENTATION[key].featured,
    bestFor: t(PLAN_PRESENTATION[key].bestForKey),
    cta: t(PLAN_PRESENTATION[key].ctaKey),
  }));

  return (
    <section id="pricing" className="py-16 sm:py-20 bg-stone-50 dark:bg-stone-900/50">
      <div
        ref={sectionRef}
        className={`mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 transition-all duration-700 ${isInView ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'}`}
      >
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="text-3xl font-extrabold tracking-tight text-stone-900 sm:text-4xl dark:text-white">
            {t('pricing.title')}
          </h2>
          <p className="mt-4 text-lg text-stone-600 dark:text-stone-400">
            {t('pricing.subtitle')}
          </p>

          {/* Billing interval toggle. Yearly billing has no real Stripe price
              yet, so the Yearly option is genuinely DISABLED rather than
              clickable-into-a-dead-end: previously it toggled to a panel that
              just said "Coming soon", which read as a broken control. It is
              announced as disabled to assistive tech and explained below. */}
          <div className="mt-8 inline-flex items-center gap-1 rounded-full border border-stone-200 bg-white p-1 dark:border-stone-700 dark:bg-stone-800">
            <button
              className={cn(
                'rounded-full px-5 py-2 text-sm font-medium transition-all focus:outline-none',
                !yearly
                  ? 'bg-brand-600 text-white shadow-sm'
                  : 'text-stone-600 hover:text-stone-900 dark:text-stone-300 dark:hover:text-white',
              )}
              onClick={() => setYearly(false)}
              aria-pressed={!yearly}
            >
              {t('pricing.monthly')}
            </button>
            <button
              className={cn(
                'flex items-center gap-2 rounded-full px-5 py-2 text-sm font-medium transition-all focus:outline-none',
                YEARLY_BILLING_ENABLED
                  ? yearly
                    ? 'bg-brand-600 text-white shadow-sm'
                    : 'text-stone-600 hover:text-stone-900 dark:text-stone-300 dark:hover:text-white'
                  : 'cursor-not-allowed text-stone-400 dark:text-stone-500',
              )}
              onClick={() => YEARLY_BILLING_ENABLED && setYearly(true)}
              disabled={!YEARLY_BILLING_ENABLED}
              aria-pressed={yearly}
              title={YEARLY_BILLING_ENABLED ? undefined : t('pricing.yearly_unavailable_note')}
            >
              {t('pricing.yearly')}
              {/* The badge tracks the flag. It was unconditional, so once real
                  annual prices were configured and YEARLY_BILLING_ENABLED went
                  true this control became clickable while still reading
                  "Coming soon" — a working button labelled as unavailable. */}
              <span
                className={cn(
                  'rounded-full px-2 py-0.5 text-[11px] font-bold',
                  YEARLY_BILLING_ENABLED
                    ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/60 dark:text-emerald-400'
                    : 'bg-amber-100 text-amber-700 dark:bg-amber-900/60 dark:text-amber-400',
                )}
              >
                {YEARLY_BILLING_ENABLED
                  ? t('pricing.save_vs_monthly', { percent: yearlySavingsPercent(SubscriptionPlan.PRO) })
                  : t('pricing.yearly_coming_soon')}
              </span>
            </button>
          </div>
          {!YEARLY_BILLING_ENABLED && (
            <p className="mt-3 text-xs text-stone-500 dark:text-stone-400">
              {t('pricing.yearly_unavailable_note')}
            </p>
          )}
        </div>

        {/* Trust strip */}
        <div className="mt-8 grid grid-cols-2 items-center justify-items-center gap-x-4 gap-y-3 text-sm text-stone-500 sm:flex sm:flex-wrap sm:justify-center sm:gap-x-8 sm:gap-y-2 dark:text-stone-400">
          <div className="flex items-center gap-2">
            <Lock className="h-4 w-4 text-emerald-500" />
            {t('pricing.trust_stripe')}
          </div>
          <div className="flex items-center gap-2">
            <ShieldCheck className="h-4 w-4 text-emerald-500" />
            {t('pricing.trust_data')}
          </div>
          <div className="flex items-center gap-2">
            <Trash2 className="h-4 w-4 text-emerald-500" />
            {t('pricing.trust_cancel')}
          </div>
          <div className="flex items-center gap-2">
            <ShieldCheck className="h-4 w-4 text-emerald-500" />
            {t('pricing.trust_ssl')}
          </div>
        </div>

        {/* Column count follows the number of visible plans so the grid stays
            balanced whether 3 or 4 plans are configured. */}
        <div
          className={cn(
            'mt-10 grid gap-8 sm:grid-cols-2',
            plans.length >= 4 ? 'lg:grid-cols-4' : 'lg:grid-cols-3',
          )}
        >
          {plans.map(({ key, featured, bestFor, cta }) => {
            const config = PLAN_CONFIGS[key];
            const monthlyPrice = config.priceMonthly;
            // Belt and braces: the Yearly toggle is already disabled while
            // YEARLY_BILLING_ENABLED is false, but the flag is re-checked here
            // so no future state change can render an annual price the checkout
            // cannot actually sell.
            const showYearly = YEARLY_BILLING_ENABLED && yearly;

            return (
              <div
                key={key}
                className={cn(
                  'relative flex flex-col rounded-2xl border p-6 sm:p-8 transition-shadow hover:shadow-lg',
                  featured
                    ? 'border-brand-500 bg-white shadow-xl ring-1 ring-brand-500 dark:border-brand-400 dark:bg-stone-800 dark:ring-brand-400'
                    : 'border-stone-200 bg-white dark:border-stone-700 dark:bg-stone-800',
                )}
              >
                {featured && (
                  <div className="absolute -top-3.5 left-1/2 -translate-x-1/2">
                    <Badge variant="brand" size="md">
                      {t('pricing.popular')}
                    </Badge>
                  </div>
                )}

                {/* Plan header */}
                <div className="mb-6">
                  <div className="flex items-center gap-2 mb-1">
                    <h3 className="text-xl font-bold text-stone-900 dark:text-white">
                      {config.name}
                    </h3>
                    {featured && (
                      <Zap className="h-4 w-4 text-brand-500" />
                    )}
                  </div>
                  <p className="text-xs text-stone-500 dark:text-stone-400">
                    {bestFor}
                  </p>

                  {/* Price display. A free plan costs $0 on either interval, so
                      it never shows an annual figure or a saving. */}
                  {showYearly && monthlyPrice > 0 ? (
                    <div className="mt-5">
                      <div className="flex items-baseline gap-1">
                        <span className="text-4xl font-extrabold text-stone-900 dark:text-white">
                          ${config.priceYearly.toFixed(2)}
                        </span>
                        <span className="text-sm text-stone-500 dark:text-stone-400">
                          {t('pricing.per_year')}
                        </span>
                      </div>
                      {/* The saving is derived from this plan's own two prices,
                          so it cannot drift from them. */}
                      <p className="mt-1.5 text-xs font-semibold text-emerald-600 dark:text-emerald-400">
                        {t('pricing.save_vs_monthly', { percent: yearlySavingsPercent(key) })}
                        {' · '}
                        {t('pricing.save_amount', { amount: `$${yearlySavings(key).toFixed(2)}` })}
                      </p>
                      <p className="mt-1 text-xs text-stone-500 dark:text-stone-400">
                        ${(config.priceYearly / 12).toFixed(2)}
                        {t('pricing.per_month_billed_yearly')}
                      </p>
                    </div>
                  ) : (
                    <div className="mt-5 flex items-baseline gap-1">
                      <span className="text-4xl font-extrabold text-stone-900 dark:text-white">
                        {monthlyPrice === 0 ? '$0' : `$${monthlyPrice.toFixed(2)}`}
                      </span>
                      <span className="text-sm text-stone-500 dark:text-stone-400">
                        {t('pricing.per_month')}
                      </span>
                    </div>
                  )}
                </div>

                {/* Features. Limits are per account — see the note below the
                    grid; Enterprise is NOT a multi-seat team plan (the product
                    has no team/seat concept), so its 500 credits are one
                    account's allowance, not a shared pool. */}
                <ul className="mb-8 flex-1 space-y-3">
                  {config.features.map((feature) => (
                    <li key={feature} className="flex items-start gap-3 text-sm">
                      <Check className="mt-0.5 h-4 w-4 flex-shrink-0 text-emerald-500" />
                      <span className="text-stone-600 dark:text-stone-400">{feature}</span>
                    </li>
                  ))}
                </ul>

                <Link href={planCtaHref(key)}>
                  <Button
                    variant={featured ? 'primary' : 'outline'}
                    className="w-full"
                    size="lg"
                  >
                    {cta}
                  </Button>
                </Link>
              </div>
            );
          })}
        </div>

        {/* Bottom note */}
        <p className="mt-8 text-center text-sm text-stone-500 dark:text-stone-400">
          {t('pricing.trial_note')}
        </p>
        <p className="mt-2 text-center text-xs text-stone-500 dark:text-stone-400">
          {t('pricing.limits_per_account')}
        </p>

        {/* Purchase terms. The client asked for taxes, renewal, cancellation and
            refund information near the point of purchase, plus a plain
            definition of an AI credit and whether credits roll over. */}
        <div className="mx-auto mt-8 max-w-3xl rounded-xl border border-stone-200 bg-white p-5 dark:border-stone-700 dark:bg-stone-800/50">
          <h3 className="text-sm font-semibold text-stone-900 dark:text-white">
            {t('pricing.terms_title')}
          </h3>
          <dl className="mt-3 grid gap-x-8 gap-y-3 sm:grid-cols-2">
            {(
              ['credit', 'rollover', 'renewal', 'cancellation', 'refunds', 'taxes'] as const
            ).map((k) => (
              <div key={k}>
                <dt className="text-xs font-semibold text-stone-700 dark:text-stone-300">
                  {t(`pricing.terms_${k}_title`)}
                </dt>
                <dd className="mt-0.5 text-xs text-stone-500 dark:text-stone-400">
                  {t(`pricing.terms_${k}_desc`)}
                </dd>
              </div>
            ))}
          </dl>
        </div>
      </div>
    </section>
  );
}
