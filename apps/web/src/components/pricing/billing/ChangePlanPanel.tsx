'use client';

import { useEffect, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { useMutation, useQuery } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  ALLOWANCES,
  PLANS,
  RECOMMENDED_PLAN_ID,
  monthlyEquivalentCents,
  planMeets,
  trialFor,
  type BillingInterval,
  type PlanId,
} from '@flacroncv/career-shared';
import Badge from '@/components/ui/Badge';
import Button from '@/components/ui/Button';
import Card from '@/components/ui/Card';
import { Link } from '@/i18n/routing';
import { cn } from '@/lib/utils';
import { legalDocLinks } from '@/components/auth/LegalAcceptanceModal';
import { api } from '@/lib/api';
import { useApiErrorMessage } from '@/hooks/useApiErrorMessage';
import { IntervalToggle } from '../IntervalToggle';
import { PRICING_PLANS, equivalentPlan, isLegacyPlan, isPricingPlan } from '../plan-catalog';
import { planOnSale, usePlanAvailability } from '../plan-availability';
import { usePlanFormat } from '../plan-format';

export interface ChangePlanPanelProps {
  /** The stored V1 plan (five-plan id or legacy id). */
  currentPlan: string;
  /** A paid subscription billed through Stripe exists, so changes go through the portal. */
  hasPaidStripeSubscription: boolean;
  /** Paid, but billed by a mobile store or granted by support: no web checkout or portal. */
  managedElsewhere: boolean;
  /** Pre-selection from the pricing page (?plan=&interval=). */
  initialPlan?: string | null;
  initialInterval?: string | null;
  trialEligible: boolean;
  checkoutPending: boolean;
  portalPending: boolean;
  onCheckout: (planId: PlanId, interval: BillingInterval, expectTrial: boolean) => void;
  onPortal: () => void;
  /** A paid-to-paid switch went through in-app: refresh the account. */
  onPlanChanged?: (plan: string) => void;
}

/** `POST /payments/change-plan/preview`: Stripe's prorated upcoming invoice for the switch. */
export interface PlanChangePreview {
  fromPlan?: string;
  toPlan: string;
  currency: string;
  /** Smallest currency unit; negative = credit for unused time. */
  prorationAmount: number;
  /** What the invoice created at switch time asks for now (smallest unit). */
  amountDue: number;
  /** Sent back with the switch so it bills exactly what was shown. */
  prorationDate: number;
  currentPeriodEnd: string;
  /** Upgrades apply now; downgrades at the end of the paid period. */
  timing?: 'now' | 'at_period_end';
  effectiveAt?: string;
}

export const PLAN_CHANGE_PREVIEW_ENDPOINT = '/payments/change-plan/preview';
export const PLAN_CHANGE_ENDPOINT = '/payments/change-plan';

const apiInterval = (interval: BillingInterval) => (interval === 'annual' ? 'yearly' : 'monthly');

/**
 * Upgrade / downgrade between the five plans (spec §11, §16 "upgrade preview").
 * Nothing is charged from here: a plan opens a review that states the price,
 * the interval, the automatic renewal and (for paying customers) how the change
 * is billed, and only then continues to Stripe. Legacy customers are told that
 * switching gives up their legacy price for good.
 */
export function ChangePlanPanel({
  currentPlan,
  hasPaidStripeSubscription,
  managedElsewhere,
  initialPlan,
  initialInterval,
  trialEligible,
  checkoutPending,
  portalPending,
  onCheckout,
  onPortal,
  onPlanChanged,
}: ChangePlanPanelProps) {
  const t = useTranslations('plan_catalog.change');
  const tCatalog = useTranslations('plan_catalog');
  const tBilling = useTranslations('billing');
  const fmt = usePlanFormat();
  const locale = useLocale();
  const formatApiError = useApiErrorMessage();
  const { availability } = usePlanAvailability();
  const [interval, setBillingInterval] = useState<BillingInterval>(initialInterval === 'annual' ? 'annual' : 'monthly');
  const [selected, setSelected] = useState<PlanId | null>(
    isPricingPlan(initialPlan) && initialPlan !== currentPlan ? initialPlan : null,
  );
  const legacy = isLegacyPlan(currentPlan);
  const tier = equivalentPlan(currentPlan);

  // The pricing page links here with #change-plan; bring the review into view once.
  useEffect(() => {
    if (selected && typeof document !== 'undefined') {
      document.getElementById('change-plan')?.scrollIntoView?.({ block: 'start' });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const amount = (id: PlanId) => (interval === 'annual' ? PLANS[id].annualCents : PLANS[id].monthlyCents);
  const direction = (id: PlanId): 'upgrade' | 'downgrade' | 'switch' =>
    id === tier ? 'switch' : planMeets(id, tier) ? 'upgrade' : 'downgrade';
  const trial = selected ? trialFor(selected, interval) : null;
  const showTrial = Boolean(trial && trialEligible && !hasPaidStripeSubscription && currentPlan === 'free');

  // Paid → paid for a Stripe subscriber: switched in-app after a proration
  // preview (spec §16 "upgrade preview"). Moving to Free stays a cancellation in
  // the portal, and any refusal (store-billed account, unconfigured price, Stripe
  // unavailable) falls back to the portal, so the customer is never stuck.
  const inAppSwitch = Boolean(selected && selected !== 'free' && hasPaidStripeSubscription && !managedElsewhere);
  const preview = useQuery({
    queryKey: ['plan-change-preview', selected, interval],
    queryFn: () =>
      api.post<PlanChangePreview>(PLAN_CHANGE_PREVIEW_ENDPOINT, { plan: selected, interval: apiInterval(interval) }),
    enabled: inAppSwitch,
    retry: false,
    staleTime: 0,
    gcTime: 0,
  });
  const change = useMutation({
    mutationFn: (input: { plan: PlanId; interval: BillingInterval; prorationDate: number }) =>
      api.post<{ plan: string; status: string; paymentPending?: boolean }>(PLAN_CHANGE_ENDPOINT, {
        plan: input.plan,
        interval: apiInterval(input.interval),
        prorationDate: input.prorationDate,
      }),
    onSuccess: (result, input) => {
      // An upgrade waits for its prorated payment (Stripe pending_if_incomplete): the plan
      // has NOT changed yet. Say so instead of announcing a switch that may never happen.
      if (result?.paymentPending) {
        toast.info(t('payment_pending', { plan: fmt.planName(input.plan) }));
        setSelected(null);
        onPlanChanged?.(currentPlan);
        return;
      }
      const plan = isPricingPlan(result?.plan) ? result.plan : input.plan;
      toast.success(t('changed', { plan: fmt.planName(plan) }));
      setSelected(null);
      onPlanChanged?.(plan);
    },
  });
  const portalFallback = inAppSwitch && (preview.isError || change.isError);
  const money = (minor: number, currency: string) => {
    try {
      return new Intl.NumberFormat(`${locale}-u-nu-latn`, { style: 'currency', currency: currency.toUpperCase() }).format(minor / 100);
    } catch {
      return `${(minor / 100).toFixed(2)} ${currency.toUpperCase()}`;
    }
  };
  const periodEnd = (iso: string) => {
    const date = new Date(iso);
    return Number.isNaN(date.getTime())
      ? null
      : date.toLocaleDateString(`${locale}-u-nu-latn`, { year: 'numeric', month: 'long', day: 'numeric' });
  };
  const select = (id: PlanId | null) => {
    change.reset();
    setSelected(id);
  };

  return (
    <Card>
      <div id="change-plan" className="scroll-mt-24">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h3 className="text-lg font-semibold text-stone-900 dark:text-white">{t('title')}</h3>
          <IntervalToggle
            value={interval}
            onChange={(next) => {
              setBillingInterval(next);
            }}
          />
        </div>
        <p className="mt-2 text-sm text-stone-600 dark:text-stone-400">{t('intro')}</p>
        {legacy ? (
          <p role="note" className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-900/20 dark:text-amber-200">
            {t('legacy_warning')}
          </p>
        ) : null}

        <ul className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
          {PRICING_PLANS.map((id) => {
            const current = id === currentPlan;
            const onSale = planOnSale(availability, id, interval);
            const allowance = ALLOWANCES[id];
            return (
              <li
                key={id}
                data-testid={`change-plan-${id}`}
                className={cn(
                  'flex min-w-0 flex-col rounded-xl border p-4',
                  current
                    ? 'border-brand-500 bg-brand-50/60 dark:border-brand-400 dark:bg-brand-950/30'
                    : selected === id
                      ? 'border-brand-400 ring-1 ring-brand-400'
                      : 'border-stone-200 dark:border-stone-700',
                )}
              >
                <div className="flex flex-wrap items-center gap-2">
                  <p className="font-semibold text-stone-900 dark:text-white">{fmt.planName(id)}</p>
                  {current ? <Badge variant="brand">{tCatalog('current_plan')}</Badge> : null}
                  {!current && id === RECOMMENDED_PLAN_ID ? <Badge variant="info">{tCatalog('recommended_short')}</Badge> : null}
                </div>
                <p className="mt-1 text-sm tabular-nums text-stone-700 dark:text-stone-300">
                  {id === 'free'
                    ? fmt.usd(0)
                    : `${fmt.usd(amount(id))}${tCatalog(interval === 'annual' ? 'per_year' : 'per_month')}`}
                </p>
                {id !== 'free' && interval === 'annual' ? (
                  <p className="text-xs text-stone-500 dark:text-stone-400">
                    {tCatalog('monthly_equivalent', { amount: fmt.usd(monthlyEquivalentCents(PLANS[id].annualCents)) })}
                  </p>
                ) : null}
                <p className="mt-2 flex-1 text-xs text-stone-500 dark:text-stone-400">
                  {t('summary', {
                    documents: fmt.cell('documentCredits', id),
                    analyses: fmt.cell('resumeAnalyses', id),
                    versions: fmt.cell('resumeVersions', id),
                  })}
                  {allowance.docxExport ? ` · ${t('docx')}` : ''}
                </p>
                <div className="mt-3">
                  {current ? null : managedElsewhere ? (
                    <p className="text-xs text-stone-500 dark:text-stone-400">{t('managed_elsewhere')}</p>
                  ) : id === 'free' ? (
                    hasPaidStripeSubscription ? (
                      <Button size="sm" variant="ghost" className="w-full" onClick={() => select('free')}>
                        {t('downgrade_to', { plan: fmt.planName('free') })}
                      </Button>
                    ) : null
                  ) : onSale ? (
                    <Button
                      size="sm"
                      variant={id === RECOMMENDED_PLAN_ID ? 'primary' : 'outline'}
                      className="w-full"
                      onClick={() => select(id)}
                      aria-pressed={selected === id}
                    >
                      {t(`${direction(id)}_to`, { plan: fmt.planName(id) })}
                    </Button>
                  ) : (
                    <div className="space-y-1">
                      <p className="text-center text-xs font-semibold text-stone-600 dark:text-stone-300">{tCatalog('coming_soon')}</p>
                      <Link
                        href="/contact-us"
                        className="block rounded text-center text-xs font-semibold text-brand-700 underline-offset-2 hover:underline dark:text-brand-400"
                      >
                        {tCatalog('contact_us')}
                      </Link>
                    </div>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
        <p className="mt-3 text-xs text-stone-500 dark:text-stone-400">
          <Link href="/pricing#compare" className="font-semibold text-brand-700 underline-offset-2 hover:underline dark:text-brand-400">
            {t('compare_link')}
          </Link>
        </p>

        {selected ? (
          <section
            aria-labelledby="plan-review-title"
            data-testid="plan-review"
            className="mt-5 rounded-xl border border-stone-200 bg-stone-50 p-4 dark:border-stone-700 dark:bg-stone-900"
          >
            <h4 id="plan-review-title" className="font-semibold text-stone-900 dark:text-white">
              {t('review_title')}
            </h4>
            <dl className="mt-3 grid gap-2 text-sm sm:grid-cols-2">
              <div>
                <dt className="text-stone-500 dark:text-stone-400">{t('review_plan')}</dt>
                <dd className="font-medium text-stone-900 dark:text-white">{fmt.planName(selected)}</dd>
              </div>
              <div>
                <dt className="text-stone-500 dark:text-stone-400">{t('review_price')}</dt>
                <dd className="font-medium tabular-nums text-stone-900 dark:text-white">
                  {selected === 'free'
                    ? fmt.usd(0)
                    : interval === 'annual'
                      ? t('review_annual', { amount: fmt.usd(amount(selected)) })
                      : t('review_monthly', { amount: fmt.usd(amount(selected)) })}
                </dd>
              </div>
            </dl>
            <ul className="mt-3 list-disc space-y-1 ps-5 text-sm text-stone-700 dark:text-stone-300">
              {selected === 'free' ? (
                <li>{t('downgrade_free_note')}</li>
              ) : (
                <>
                  <li>{t(interval === 'annual' ? 'auto_renew_annual' : 'auto_renew_monthly', { amount: fmt.usd(amount(selected)) })}</li>
                  {interval === 'annual' ? <li>{tCatalog('allowances_monthly')}</li> : null}
                  {hasPaidStripeSubscription ? (
                    <li>{t(direction(selected) === 'downgrade' ? 'downgrade_note' : 'upgrade_note')}</li>
                  ) : null}
                  {showTrial && trial ? (
                    <li>
                      {tBilling('trial_disclosure', {
                        days: trial.days,
                        price: fmt.usd(amount(selected)),
                        interval: tBilling(interval === 'annual' ? 'plans.year' : 'plans.month'),
                      })}
                    </li>
                  ) : null}
                  <li>{tCatalog('taxes_note')}</li>
                </>
              )}
              {legacy ? <li className="font-medium text-amber-800 dark:text-amber-300">{t('legacy_warning')}</li> : null}
            </ul>
            {inAppSwitch ? (
              <div
                data-testid="plan-change-preview"
                aria-live="polite"
                className="mt-3 rounded-lg border border-stone-200 bg-white p-3 text-sm dark:border-stone-700 dark:bg-stone-950"
              >
                {preview.isLoading ? <p className="text-stone-600 dark:text-stone-300">{t('preview_loading')}</p> : null}
                {preview.data && preview.data.timing === 'at_period_end' ? (
                  <p className="text-stone-700 dark:text-stone-200">
                    {t('preview_at_period_end', {
                      date: periodEnd(preview.data.effectiveAt ?? preview.data.currentPeriodEnd) ?? '',
                    })}
                  </p>
                ) : null}
                {preview.data && preview.data.timing !== 'at_period_end' ? (
                  <>
                    <dl className="grid gap-2 sm:grid-cols-3">
                      <div>
                        <dt className="text-stone-500 dark:text-stone-400">{t('preview_due_now')}</dt>
                        <dd className="font-semibold tabular-nums text-stone-900 dark:text-white">
                          {money(preview.data.amountDue, preview.data.currency)}
                        </dd>
                      </div>
                      <div>
                        <dt className="text-stone-500 dark:text-stone-400">
                          {t(preview.data.prorationAmount < 0 ? 'preview_credit' : 'preview_proration')}
                        </dt>
                        <dd className="font-medium tabular-nums text-stone-900 dark:text-white">
                          {money(Math.abs(preview.data.prorationAmount), preview.data.currency)}
                        </dd>
                      </div>
                      {periodEnd(preview.data.currentPeriodEnd) ? (
                        <div>
                          <dt className="text-stone-500 dark:text-stone-400">{t('preview_period_end')}</dt>
                          <dd className="font-medium text-stone-900 dark:text-white">{periodEnd(preview.data.currentPeriodEnd)}</dd>
                        </div>
                      ) : null}
                    </dl>
                    <p className="mt-2 text-xs text-stone-500 dark:text-stone-400">{t('preview_note')}</p>
                  </>
                ) : null}
                {portalFallback ? (
                  <p role="alert" className="text-amber-800 dark:text-amber-300">
                    {formatApiError(change.error ?? preview.error, t(change.isError ? 'change_failed' : 'preview_failed'))}{' '}
                    {t('portal_fallback')}
                  </p>
                ) : null}
              </div>
            ) : null}
            <p className="mt-3 text-xs leading-5 text-stone-500 dark:text-stone-400">{tBilling.rich('checkout_legal', legalDocLinks())}</p>
            <div className="mt-4 flex flex-col gap-2 sm:flex-row">
              {inAppSwitch && !portalFallback ? (
                <Button
                  onClick={() => {
                    if (preview.data && selected && selected !== 'free') {
                      change.mutate({ plan: selected, interval, prorationDate: preview.data.prorationDate });
                    }
                  }}
                  disabled={!preview.data}
                  loading={change.isPending}
                >
                  {preview.data && preview.data.amountDue > 0
                    ? t('confirm_pay', { amount: money(preview.data.amountDue, preview.data.currency) })
                    : t('confirm_change')}
                </Button>
              ) : hasPaidStripeSubscription ? (
                <Button onClick={onPortal} loading={portalPending}>
                  {t(selected === 'free' ? 'continue_cancel' : 'continue_portal')}
                </Button>
              ) : (
                <Button onClick={() => onCheckout(selected, interval, showTrial)} loading={checkoutPending}>
                  {t('continue_checkout')}
                </Button>
              )}
              <Button variant="secondary" onClick={() => select(null)} disabled={change.isPending}>
                {t('cancel')}
              </Button>
            </div>
            {hasPaidStripeSubscription && (!inAppSwitch || portalFallback) ? (
              <p className="mt-2 text-xs text-stone-500 dark:text-stone-400">{t('portal_note')}</p>
            ) : null}
          </section>
        ) : null}
      </div>
    </Card>
  );
}
