'use client';

import { useMemo, useRef, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { useQuery } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Check, Lock, Minus } from 'lucide-react';
import { ALLOWANCES, PLANS, RECOMMENDED_PLAN_ID, type PlanId } from '@flacroncv/career-shared';
import Button from '@/components/ui/Button';
import Card from '@/components/ui/Card';
import { api } from '@/lib/api';
import { cn } from '@/lib/utils';
import { useApiErrorMessage } from '@/hooks/useApiErrorMessage';
import { useAuth } from '@/providers/AuthProvider';
import { useCareerAccess } from './CareerServices';

/** Individual career plans offered here. Business (seats, candidates) is a team product and is not sold in this flow. */
const OFFERED: readonly PlanId[] = ['starter', 'professional', 'career_pro'];

/** Benefits shown on each card, straight from the V2 catalog allowances. */
const BENEFITS = [
  'documentCredits',
  'resumeAnalyses',
  'actionPacks',
  'textInterviewSessions',
  'voiceMinutes',
  'skillReports',
  'scenarioReports',
  'assistedForms',
  'mapSessions',
  'evidenceItems',
  'portfolioPages',
  'docxExport',
] as const;
type Benefit = (typeof BENEFITS)[number];
type Interval = 'month' | 'year';

interface CareerBillingStatus {
  mode: 'disabled' | 'addon_fixture';
  purchasable: boolean;
  configuredPrices: string[];
  careerSubscription: { plan: string | null; status: string | null; currentPeriodEnd: string | null; cancelAtPeriodEnd: boolean; source: string | null } | null;
}

function money(cents: number, locale: string): string {
  return new Intl.NumberFormat(locale, { style: 'currency', currency: 'USD' }).format(cents / 100);
}

/**
 * Career plans and their price, from the V2 catalog. Shows the amount, the
 * interval and what is included before anything is confirmed. Nothing is
 * charged here: a confirmed purchase goes to Stripe Checkout through V1's
 * billing, and only while purchase is switched on (it is off until the
 * commercial model is decided). The V1 plan and its benefits are not changed.
 */
export function CareerPlansScreen() {
  const t = useTranslations('career.plans');
  const locale = useLocale();
  const { user } = useAuth();
  const formatApiError = useApiErrorMessage();
  const access = useCareerAccess();
  const [interval, setInterval] = useState<Interval>('month');
  const [selected, setSelected] = useState<PlanId | null>(null);
  const [busy, setBusy] = useState(false);
  const inFlight = useRef(false);
  const status = useQuery<CareerBillingStatus>({
    queryKey: ['career-billing-status', user?.uid ?? 'anon'],
    queryFn: () => api.get<CareerBillingStatus>('/career-billing/status'),
    enabled: Boolean(user),
    retry: false,
  });

  const purchasable = Boolean(status.data?.purchasable);
  const amountOf = (plan: PlanId) => (interval === 'year' ? PLANS[plan].annualCents : PLANS[plan].monthlyCents);
  const benefitText = (plan: PlanId, benefit: Benefit): string | null => {
    const value = ALLOWANCES[plan][benefit] as number | boolean | null;
    if (value === null || value === false || value === 0) return null;
    if (value === true) return t(`benefit.${benefit}`);
    return t(`benefit.${benefit}`, { count: value });
  };
  const current = status.data?.careerSubscription;
  const currentLabel = useMemo(() => {
    if (!access.data?.enabled) return t('current_none');
    // A locally seeded entitlement must never read as a purchase.
    const source = current?.source === 'local_fixture' ? t('fixture_badge') : t(`source.${access.data.source ?? 'v1_plan_map'}`);
    return t('current_plan', { plan: t(`plan.${access.data.careerPlan}`), source });
  }, [access.data, current?.source, t]);

  async function confirmPurchase() {
    if (!selected || inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    try {
      const result = await api.post<{ url: string | null }>('/career-billing/checkout', {
        plan: selected,
        interval,
        expectedAmountCents: amountOf(selected),
        confirmed: true,
      });
      if (result.url) window.location.assign(result.url);
    } catch (error) {
      toast.error(formatApiError(error, t('checkout_failed')));
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-stone-900 dark:text-white">{t('title')}</h1>
        <p className="mt-2 max-w-3xl text-sm text-stone-600 dark:text-stone-300">{t('intro')}</p>
        <p className="mt-2 text-sm font-medium text-stone-800 dark:text-stone-100">{currentLabel}</p>
        {current?.source === 'local_fixture' ? (
          <p className="mt-1 inline-block rounded bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-900 dark:bg-amber-900/40 dark:text-amber-200">
            {t('fixture_badge')}
          </p>
        ) : null}
      </div>

      {!purchasable ? (
        <Card padding="md" role="status">
          <div className="flex items-start gap-3">
            <Lock className="mt-0.5 h-5 w-5 shrink-0 text-brand-600" aria-hidden="true" />
            <div>
              <p className="text-sm font-semibold text-stone-900 dark:text-white">{t('disabled_title')}</p>
              <p className="mt-1 text-sm text-stone-600 dark:text-stone-300">{t('disabled_body')}</p>
            </div>
          </div>
        </Card>
      ) : (
        <p className="rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:bg-amber-900/30 dark:text-amber-100" role="note">
          {t('fixture_mode_notice')}
        </p>
      )}

      <div className="inline-flex rounded-lg border border-stone-200 p-1 dark:border-stone-700" role="group" aria-label={t('interval_label')}>
        {(['month', 'year'] as const).map((value) => (
          <button
            key={value}
            type="button"
            aria-pressed={interval === value}
            onClick={() => setInterval(value)}
            className={cn(
              'rounded-md px-4 py-1.5 text-sm font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500',
              interval === value ? 'bg-brand-600 text-white' : 'text-stone-700 hover:bg-stone-100 dark:text-stone-200 dark:hover:bg-stone-800',
            )}
          >
            {t(`interval.${value}`)}
          </button>
        ))}
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        {OFFERED.map((plan) => (
          <Card key={plan} padding="lg" className={cn('flex flex-col', plan === RECOMMENDED_PLAN_ID && 'ring-2 ring-brand-500')}>
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-lg font-semibold text-stone-900 dark:text-white">{t(`plan.${plan}`)}</h2>
              {plan === RECOMMENDED_PLAN_ID ? <span className="rounded-full bg-brand-50 px-2 py-0.5 text-xs font-semibold text-brand-700 dark:bg-brand-950/40 dark:text-brand-300">{t('recommended')}</span> : null}
            </div>
            <p className="mt-3 text-3xl font-bold text-stone-900 dark:text-white">
              {money(amountOf(plan), locale)}
              <span className="ms-1 text-sm font-normal text-stone-500 dark:text-stone-400">{t(`per.${interval}`)}</span>
            </p>
            {interval === 'year' ? <p className="text-xs text-stone-500 dark:text-stone-400">{t('annual_note')}</p> : null}
            <ul className="mt-4 flex-1 space-y-1.5 text-sm">
              {BENEFITS.map((benefit) => {
                const text = benefitText(plan, benefit);
                return (
                  <li key={benefit} className={cn('flex items-start gap-2', text ? 'text-stone-700 dark:text-stone-200' : 'text-stone-400 dark:text-stone-500')}>
                    {text ? <Check className="mt-0.5 h-4 w-4 shrink-0 text-green-600" aria-hidden="true" /> : <Minus className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />}
                    <span>{text ?? t(`benefit_none.${benefit}`)}</span>
                  </li>
                );
              })}
            </ul>
            <Button className="mt-5" variant={selected === plan ? 'primary' : 'outline'} onClick={() => setSelected(plan)} aria-pressed={selected === plan}>
              {t('review')}
            </Button>
          </Card>
        ))}
      </div>
      <p className="text-xs text-stone-500 dark:text-stone-400">{t('renewal_note')}</p>

      {selected ? (
        <Card padding="lg" role="region" aria-label={t('review_title')}>
          <h2 className="text-lg font-semibold text-stone-900 dark:text-white">{t('review_title')}</h2>
          <dl className="mt-3 grid gap-2 text-sm sm:grid-cols-2">
            <div>
              <dt className="text-stone-500 dark:text-stone-400">{t('review_plan')}</dt>
              <dd className="font-medium text-stone-900 dark:text-white">{t(`plan.${selected}`)}</dd>
            </div>
            <div>
              <dt className="text-stone-500 dark:text-stone-400">{t('review_amount')}</dt>
              <dd className="font-medium text-stone-900 dark:text-white">
                {money(amountOf(selected), locale)} {t(`per.${interval}`)}
              </dd>
            </div>
          </dl>
          <p className="mt-3 text-sm text-stone-600 dark:text-stone-300">{purchasable ? t('review_v1_unchanged_fixture') : t('review_model_pending')}</p>
          <p className="mt-1 text-sm text-stone-600 dark:text-stone-300">{t('review_no_charge_yet')}</p>
          <div className="mt-4 flex flex-wrap gap-3">
            <Button onClick={() => void confirmPurchase()} disabled={!purchasable || busy} loading={busy}>
              {purchasable ? t('confirm', { amount: money(amountOf(selected), locale) }) : t('confirm_disabled')}
            </Button>
            <Button variant="ghost" onClick={() => setSelected(null)}>
              {t('cancel')}
            </Button>
          </div>
        </Card>
      ) : null}
    </div>
  );
}
