'use client';

import { useLocale, useTranslations } from 'next-intl';
import { useQuery } from '@tanstack/react-query';
import { Compass, ExternalLink } from 'lucide-react';
import { PLANS, formatUsd } from '@flacroncv/career-shared';
import Badge from '@/components/ui/Badge';
import Button from '@/components/ui/Button';
import Card from '@/components/ui/Card';
import { Link } from '@/i18n/routing';
import { api } from '@/lib/api';
import { useAuth } from '@/providers/AuthProvider';
import { isCareerEnabled, useCareerAccess } from './CareerServices';
import {
  careerBillingStatusKey,
  careerRenewal,
  formatCareerDate,
  hasStripeCareerSubscription,
  type CareerBillingStatusView,
} from './career-subscription';

const STATUS_VARIANT: Record<string, 'success' | 'warning' | 'danger' | 'info'> = {
  active: 'success',
  trialing: 'info',
  past_due: 'warning',
  canceled: 'danger',
  incomplete: 'warning',
  unpaid: 'danger',
};

const PLAN_NAMES = ['free', 'starter', 'professional', 'career_pro', 'business'];

/**
 * The optional career tools add-on on V1's billing page. A purchased add-on is
 * a separate Stripe subscription on the customer's existing V1 Stripe customer
 * (apps/api CareerBillingService), so Stripe's customer portal — opened by
 * `onManage`, the same portal session as the V1 plan — lists it beside the V1
 * plan. Rendered only when the career build switch is on.
 */
export function CareerAddonBillingCard({ onManage, managing }: { onManage: () => void; managing: boolean }) {
  const t = useTranslations('career.addon_card');
  const tPlans = useTranslations('career.plans');
  const tBilling = useTranslations('billing');
  const locale = useLocale();
  const { user } = useAuth();
  const enabled = isCareerEnabled();
  const access = useCareerAccess();
  const status = useQuery<CareerBillingStatusView>({
    queryKey: careerBillingStatusKey(user?.uid),
    queryFn: () => api.get<CareerBillingStatusView>('/career-billing/status'),
    enabled: Boolean(user) && enabled,
    retry: false,
  });

  if (!enabled) return null;

  const sub = status.data?.careerSubscription ?? null;
  const stripeSub = hasStripeCareerSubscription(sub);
  const renewal = careerRenewal(sub);
  const planName = sub?.plan && PLAN_NAMES.includes(sub.plan) ? tPlans(`plan.${sub.plan}`) : null;
  const fixture = sub?.source === 'local_fixture';
  const includedWithPlan = !stripeSub && !fixture && access.data?.enabled && access.data.source === 'v1_plan_map';

  return (
    <Card>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-start gap-3">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-brand-50 dark:bg-brand-900/30">
            <Compass className="h-6 w-6 text-brand-600 dark:text-brand-400" aria-hidden="true" />
          </div>
          <div className="space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="text-lg font-semibold text-stone-900 dark:text-white">{t('title')}</h3>
              {stripeSub && sub?.status && STATUS_VARIANT[sub.status] ? (
                <Badge variant={STATUS_VARIANT[sub.status]} size="md">
                  {tBilling(`status.${sub.status}`)}
                </Badge>
              ) : null}
            </div>
            {status.isLoading ? (
              <p className="text-sm text-stone-500 dark:text-stone-400">{t('loading')}</p>
            ) : status.isError ? (
              <p className="text-sm text-stone-500 dark:text-stone-400">{t('unavailable')}</p>
            ) : stripeSub ? (
              <>
                {planName ? <p className="text-sm font-medium text-stone-800 dark:text-stone-100">{t('plan', { plan: planName })}</p> : null}
                {renewal ? (
                  <p className="text-sm text-stone-500 dark:text-stone-400">{tPlans(renewal.key, { date: formatCareerDate(renewal.date, locale) })}</p>
                ) : null}
                <p className="text-sm text-stone-500 dark:text-stone-400">{t('separate_note')}</p>
                <p className="text-sm text-stone-500 dark:text-stone-400">{t('portal_note')}</p>
              </>
            ) : fixture ? (
              <p className="text-sm text-stone-500 dark:text-stone-400">{tPlans('fixture_badge')}</p>
            ) : includedWithPlan ? (
              <p className="text-sm text-stone-500 dark:text-stone-400">{tPlans('source.v1_plan_map')}</p>
            ) : (
              <>
                <p className="text-sm font-medium text-stone-800 dark:text-stone-100">{t('none')}</p>
                <p className="text-sm text-stone-500 dark:text-stone-400">{t('none_body', { amount: formatUsd(PLANS.starter.monthlyCents) })}</p>
              </>
            )}
          </div>
        </div>
        <div className="flex shrink-0 flex-wrap gap-2">
          {stripeSub ? (
            <Button variant="secondary" onClick={onManage} loading={managing} icon={<ExternalLink className="h-4 w-4" />}>
              {t('manage')}
            </Button>
          ) : null}
          <Link
            href="/career/plans"
            className="inline-flex items-center justify-center rounded-lg border border-brand-600 px-4 py-2.5 text-sm font-semibold text-brand-600 hover:bg-brand-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2 dark:border-brand-500/60 dark:text-brand-400 dark:hover:bg-brand-950/50 dark:focus-visible:ring-offset-stone-950"
          >
            {stripeSub ? t('see_plans') : t('add')}
          </Link>
        </div>
      </div>
    </Card>
  );
}
