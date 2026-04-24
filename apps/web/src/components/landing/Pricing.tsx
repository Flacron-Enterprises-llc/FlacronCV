'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/routing';
import { Check, ShieldCheck, Lock, Trash2, Zap } from 'lucide-react';
import Button from '@/components/ui/Button';
import Badge from '@/components/ui/Badge';
import { PLAN_CONFIGS, SubscriptionPlan } from '@flacroncv/shared-types';
import { cn } from '@/lib/utils';
import { useInView } from '@/hooks/useInView';
import { useAuth } from '@/providers/AuthProvider';

export default function Pricing() {
  const t = useTranslations();
  const { user } = useAuth();
  const [yearly, setYearly] = useState(false);
  const { ref: sectionRef, isInView } = useInView({ threshold: 0.1 });

  // Resolve the CTA destination based on auth state so logged-in users never
  // bounce through /register on their way to the app.
  //   Free  — authenticated → /dashboard (they already have an account)
  //   Pro   — authenticated → /settings/billing (direct upgrade path)
  //   Ent.  — always /contact-us regardless of auth
  const planCtaHref = (key: SubscriptionPlan): string => {
    if (key === SubscriptionPlan.ENTERPRISE) return '/contact-us';
    if (!user) return '/register';
    return key === SubscriptionPlan.PRO ? '/settings/billing' : '/dashboard';
  };

  const plans = [
    {
      key: SubscriptionPlan.FREE,
      featured: false,
      bestFor: t('pricing.best_for_free'),
      cta: t('pricing.get_started'),
    },
    {
      key: SubscriptionPlan.PRO,
      featured: true,
      bestFor: t('pricing.best_for_pro'),
      cta: t('pricing.upgrade'),
    },
    {
      key: SubscriptionPlan.ENTERPRISE,
      featured: false,
      bestFor: t('pricing.best_for_enterprise'),
      cta: t('pricing.contact_sales'),
    },
  ];

  return (
    <section id="pricing" className="py-20 sm:py-28 bg-stone-50 dark:bg-stone-900/50">
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

          {/* Toggle */}
          <div className="mt-8 inline-flex items-center gap-1 rounded-full border border-stone-200 bg-white p-1 dark:border-stone-700 dark:bg-stone-800">
            <button
              className={cn(
                'rounded-full px-5 py-2 text-sm font-medium transition-all focus:outline-none',
                !yearly
                  ? 'bg-brand-600 text-white shadow-sm'
                  : 'text-stone-600 hover:text-stone-900 dark:text-stone-300 dark:hover:text-white',
              )}
              onClick={() => setYearly(false)}
            >
              {t('pricing.monthly')}
            </button>
            <button
              className={cn(
                'flex items-center gap-2 rounded-full px-5 py-2 text-sm font-medium transition-all focus:outline-none',
                yearly
                  ? 'bg-brand-600 text-white shadow-sm'
                  : 'text-stone-600 hover:text-stone-900 dark:text-stone-300 dark:hover:text-white',
              )}
              onClick={() => setYearly(true)}
            >
              {t('pricing.yearly')}
              <span className={cn(
                'rounded-full px-2 py-0.5 text-[11px] font-bold transition-colors',
                yearly
                  ? 'bg-white/20 text-white'
                  : 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/60 dark:text-emerald-400',
              )}>
                {t('pricing.save')}
              </span>
            </button>
          </div>
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

        <div className="mt-10 grid gap-8 lg:grid-cols-3">
          {plans.map(({ key, featured, bestFor, cta }) => {
            const config = PLAN_CONFIGS[key];
            const monthlyPrice = config.priceMonthly;
            const perMonth = yearly ? config.priceYearly / 12 : monthlyPrice;
            const annualTotal = config.priceYearly;
            const monthlyCost12 = monthlyPrice * 12;
            const savingsAmount = monthlyCost12 - annualTotal;
            const savingsPct = monthlyCost12 > 0 ? Math.round((savingsAmount / monthlyCost12) * 100) : 0;
            const isFree = monthlyPrice === 0;

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

                  {/* Price display */}
                  <div className="mt-5">
                    {isFree ? (
                      <div className="flex items-baseline gap-1">
                        <span className="text-4xl font-extrabold text-stone-900 dark:text-white">$0</span>
                        <span className="text-sm text-stone-500 dark:text-stone-400">/month</span>
                      </div>
                    ) : (
                      <>
                        <div className="flex items-baseline gap-1">
                          <span className="text-4xl font-extrabold text-stone-900 dark:text-white">
                            ${perMonth.toFixed(2)}
                          </span>
                          <span className="text-sm text-stone-500 dark:text-stone-400">/mo</span>
                        </div>
                        {yearly ? (
                          <div className="mt-1.5 space-y-0.5">
                            <p className="text-sm text-stone-500 dark:text-stone-400">
                              {t('pricing.billed_as')}{' '}
                              <span className="font-semibold text-stone-700 dark:text-stone-300">
                                ${annualTotal.toFixed(2)}/year
                              </span>
                            </p>
                            {savingsPct > 0 && (
                              <p className="text-xs font-semibold text-emerald-600 dark:text-emerald-400">
                                {t('pricing.save_amount', { amount: savingsAmount.toFixed(2) })}
                              </p>
                            )}
                          </div>
                        ) : (
                          <p className="mt-1 text-xs text-stone-400 dark:text-stone-500">
                            {t('pricing.switch_yearly_save')} {savingsPct > 0 ? `${savingsPct}%` : ''}
                          </p>
                        )}
                      </>
                    )}
                  </div>
                </div>

                {/* Features */}
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
      </div>
    </section>
  );
}
