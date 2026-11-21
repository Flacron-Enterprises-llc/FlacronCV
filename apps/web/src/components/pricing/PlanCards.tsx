'use client';

import type { ReactNode } from 'react';
import { useTranslations } from 'next-intl';
import {
  ALLOWANCES,
  PLANS,
  RECOMMENDED_PLAN_ID,
  monthlyEquivalentCents,
  type BillingInterval,
} from '@flacroncv/career-shared';
import { Link } from '@/i18n/routing';
import Badge from '@/components/ui/Badge';
import { cn } from '@/lib/utils';
import { useAuth } from '@/providers/AuthProvider';
import { fcgeUpgradeClicked } from '@/lib/fcge';
import { PRICING_PLANS, billingPlanHref, cellState } from './plan-catalog';
import { planOnSale, usePlanAvailability } from './plan-availability';
import { usePlanFormat } from './plan-format';
import { FeatureStateBadge } from './FeatureStateBadge';
import { careerBuildEnabled } from '@/lib/career-switch';


const focusRing =
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-stone-950';
const cta = cn('inline-flex w-full items-center justify-center rounded-lg px-4 py-2.5 text-sm font-semibold transition-colors', focusRing);
const outline =
  'border border-brand-600 text-brand-700 hover:bg-brand-50 dark:border-brand-500/60 dark:text-brand-400 dark:hover:bg-brand-950/50';
const solid = 'bg-brand-600 text-white shadow-sm hover:bg-brand-700';

/**
 * Exactly five plan cards (spec §5): Free, Starter, Professional (recommended),
 * Career Pro, Business, with Contact Sales beneath Business. Each card shows
 * the monthly price, the annual upfront charge, document credits, alert
 * intelligence, saved searches, location profiles and interview allowance.
 * A paid card leads to checkout only when the server has a price for it;
 * otherwise it says "Coming soon" and offers Contact us — never a dead button.
 */
export function PlanCards({
  interval,
  contactSalesHref = '/pricing#contact-sales',
  headingLevel = 'h3',
}: {
  interval: BillingInterval;
  contactSalesHref?: string;
  headingLevel?: 'h2' | 'h3';
}) {
  const t = useTranslations('plan_catalog');
  const tFeatures = useTranslations('career_pricing');
  const { user } = useAuth();
  const { availability } = usePlanAvailability();
  const fmt = usePlanFormat();
  const careerOn = careerBuildEnabled();
  const Heading = headingLevel;

  return (
    <div className="grid items-stretch gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
      {PRICING_PLANS.map((id) => {
        const plan = PLANS[id];
        const allowance = ALLOWANCES[id];
        const recommended = id === RECOMMENDED_PLAN_ID;
        const free = id === 'free';
        const onSale = planOnSale(availability, id, interval);
        const checkoutHref = billingPlanHref(id, interval);
        const href = free
          ? user
            ? '/dashboard'
            : '/register'
          : user
            ? checkoutHref
            : `/register?callbackUrl=${encodeURIComponent(checkoutHref)}`;
        return (
          <article
            key={id}
            aria-labelledby={`plan-card-${id}`}
            data-testid={`plan-card-${id}`}
            className={cn(
              'relative flex min-w-0 flex-col rounded-2xl border p-5 sm:p-6',
              recommended
                ? 'border-brand-500 bg-white shadow-xl ring-1 ring-brand-500 dark:border-brand-400 dark:bg-stone-800 dark:ring-brand-400'
                : 'border-stone-200 bg-white dark:border-stone-700 dark:bg-stone-800',
            )}
          >
            <Heading id={`plan-card-${id}`} className="text-xl font-bold text-stone-900 dark:text-white">
              {fmt.planName(id)}
            </Heading>
            {recommended ? (
              <Badge variant="brand" className="mt-2 self-start whitespace-normal">
                {t('recommended')}
              </Badge>
            ) : null}
            <p className="mt-2 text-sm text-stone-500 dark:text-stone-400">{t(`positioning.${id}`)}</p>

            <div className="mt-5">
              {free ? (
                <p className="flex flex-wrap items-baseline gap-1">
                  <span className="text-3xl font-extrabold tabular-nums text-stone-900 dark:text-white">{fmt.usd(0)}</span>
                  <span className="text-sm text-stone-500 dark:text-stone-400">{t('free_forever')}</span>
                </p>
              ) : interval === 'monthly' ? (
                <>
                  <p className="flex flex-wrap items-baseline gap-1">
                    <span className="text-3xl font-extrabold tabular-nums text-stone-900 dark:text-white">
                      {fmt.usd(plan.monthlyCents)}
                    </span>
                    <span className="text-sm text-stone-500 dark:text-stone-400">{t('per_month')}</span>
                  </p>
                  <p className="mt-1 text-xs text-stone-500 dark:text-stone-400">
                    {t('or_annual_upfront', { amount: fmt.usd(plan.annualCents) })}
                  </p>
                </>
              ) : (
                <>
                  <p className="flex flex-wrap items-baseline gap-1">
                    <span className="text-3xl font-extrabold tabular-nums text-stone-900 dark:text-white">
                      {fmt.usd(plan.annualCents)}
                    </span>
                    <span className="text-sm text-stone-500 dark:text-stone-400">{t('per_year_upfront')}</span>
                  </p>
                  <p className="mt-1 text-xs text-stone-500 dark:text-stone-400">
                    {t('monthly_equivalent', { amount: fmt.usd(monthlyEquivalentCents(plan.annualCents)) })}
                  </p>
                  <p className="mt-0.5 text-xs text-stone-500 dark:text-stone-400">
                    {t('or_monthly', { amount: fmt.usd(plan.monthlyCents) })}
                  </p>
                </>
              )}
              {!free && interval === 'annual' ? (
                <p className="mt-1 text-xs font-medium text-brand-700 dark:text-brand-400">{t('allowances_monthly')}</p>
              ) : null}
            </div>

            <dl className="mt-5 flex-1 space-y-2 text-sm">
              <Fact label={tFeatures('documents')} value={fmt.cell('documentCredits', id)} />
              <Fact
                label={tFeatures('alert_intelligence')}
                value={fmt.cell('alertIntelligence', id)}
                badge={<FeatureStateBadge state={cellState('alertIntelligence', id, careerOn)} />}
                stacked
              />
              <Fact
                label={tFeatures('saved_searches')}
                value={fmt.cell('savedSearches', id)}
                badge={<FeatureStateBadge state={cellState('savedSearches', id, careerOn)} />}
              />
              <Fact label={tFeatures('location_profiles')} value={fmt.cell('locationProfiles', id)} />
              <div>
                <dt className="text-stone-500 dark:text-stone-400">{tFeatures('interview')}</dt>
                <dd className="mt-0.5 text-stone-800 dark:text-stone-200">
                  {allowance.textInterviewSessions === null
                    ? tFeatures('not_included')
                    : t('text_sessions', { count: allowance.textInterviewSessions, amount: fmt.count(allowance.textInterviewSessions) })}
                </dd>
                {allowance.voiceMinutes !== null ? (
                  <dd className="mt-0.5 text-stone-800 dark:text-stone-200">
                    {t('voice_minutes', { count: allowance.voiceMinutes, amount: fmt.count(allowance.voiceMinutes) })}
                    <FeatureStateBadge state={cellState('voiceMinutes', id, careerOn)} />
                  </dd>
                ) : null}
              </div>
            </dl>

            <div className="mt-6 space-y-2">
              {free ? (
                <Link href={href} className={cn(cta, outline)}>
                  {user ? t('cta_open_dashboard') : t('cta_start_free')}
                </Link>
              ) : onSale ? (
                <Link
                  href={href}
                  className={cn(cta, recommended ? solid : outline)}
                  onClick={() => fcgeUpgradeClicked(id)}
                >
                  {t('cta_choose', { plan: fmt.planName(id) })}
                </Link>
              ) : (
                <>
                  <p
                    data-testid={`plan-card-${id}-coming-soon`}
                    className="rounded-lg border border-dashed border-stone-300 px-4 py-2.5 text-center text-sm font-semibold text-stone-600 dark:border-stone-600 dark:text-stone-300"
                  >
                    {t('coming_soon')}
                  </p>
                  <Link href="/contact-us" className={cn(cta, outline)}>
                    {t('contact_us')}
                  </Link>
                </>
              )}
              {id === 'business' ? (
                <Link
                  href={contactSalesHref}
                  className={cn('block rounded text-center text-sm font-semibold text-brand-700 underline-offset-2 hover:underline dark:text-brand-400', focusRing)}
                >
                  {t('contact_sales')}
                </Link>
              ) : null}
            </div>
          </article>
        );
      })}
    </div>
  );
}

function Fact({
  label,
  value,
  badge,
  stacked = false,
}: {
  label: string;
  value: string;
  badge?: ReactNode;
  stacked?: boolean;
}) {
  if (stacked) {
    return (
      <div>
        <dt className="text-stone-500 dark:text-stone-400">{label}</dt>
        <dd className="mt-0.5 text-stone-800 dark:text-stone-200">
          {value}
          {badge}
        </dd>
      </div>
    );
  }
  return (
    <div className="flex min-w-0 flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
      <dt className="min-w-0 text-stone-500 dark:text-stone-400">{label}</dt>
      <dd className="ms-auto shrink-0 font-semibold tabular-nums text-stone-900 dark:text-white">{value}</dd>
      {badge ? <dd className="w-full [&>span]:ms-0">{badge}</dd> : null}
    </div>
  );
}

/** Auto-renewal and tax wording shown beneath every set of plan cards, before any checkout. */
export function PlanTermsNote() {
  const t = useTranslations('plan_catalog');
  return (
    <div className="mx-auto mt-6 max-w-3xl space-y-1 text-center text-xs leading-5 text-stone-500 dark:text-stone-400">
      <p>{t('auto_renew_note')}</p>
      <p>{t('annual_note')}</p>
      <p>{t('taxes_note')}</p>
    </div>
  );
}
