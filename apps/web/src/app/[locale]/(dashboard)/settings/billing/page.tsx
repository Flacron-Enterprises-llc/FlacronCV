'use client';
import React from 'react';

import { useState, useEffect, useRef } from 'react';
import { useTranslations } from 'next-intl';
import { useSearchParams, usePathname } from 'next/navigation';
import { useAuth } from '@/providers/AuthProvider';
import { api } from '@/lib/api';
import { useQuery, useMutation } from '@tanstack/react-query';
import {
  User,
  SubscriptionPlan,
  PLAN_CONFIGS,
} from '@flacroncv/shared-types';
import Button from '@/components/ui/Button';
import Card from '@/components/ui/Card';
import Badge from '@/components/ui/Badge';
import {
  Crown,
  Zap,
  FileText,
  Mail,
  Sparkles,
  Download,
  Check,
  X,
  ExternalLink,
  Receipt,
  Loader2,
} from 'lucide-react';
import { toast } from 'sonner';

export default function BillingPage(): React.JSX.Element | null {
  const t = useTranslations('billing');
  const { user, refreshUser } = useAuth();
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const locale = pathname.split('/')[1] || 'en';
  const [billingInterval, setBillingInterval] = useState<'monthly' | 'yearly'>('monthly');
  const [syncingPlan, setSyncingPlan] = useState(false);
  const [syncSuccess, setSyncSuccess] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  // Keep a ref to the latest user so the polling interval doesn't read a stale closure
  const userRef = useRef(user);
  useEffect(() => { userRef.current = user; }, [user]);

  // After Stripe redirects back with ?success=true, poll until plan updates
  useEffect(() => {
    if (searchParams.get('success') !== 'true') return;
    const planAtRedirect = user?.subscription?.plan ?? 'free';
    if (planAtRedirect !== 'free') {
      // Already updated before we even mounted
      setSyncSuccess(true);
      return;
    }

    setSyncingPlan(true);
    let attempts = 0;
    const MAX_ATTEMPTS = 15; // 30 seconds

    pollRef.current = setInterval(async () => {
      attempts++;
      await refreshUser();
      const latestPlan = userRef.current?.subscription?.plan ?? 'free';
      if (latestPlan !== 'free' || attempts >= MAX_ATTEMPTS) {
        clearInterval(pollRef.current!);
        setSyncingPlan(false);
        if (latestPlan !== 'free') setSyncSuccess(true);
      }
    }, 2000);

    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const currentPlan = user?.subscription?.plan || SubscriptionPlan.FREE;
  const currentPlanConfig = PLAN_CONFIGS[currentPlan];
  const isFreePlan = currentPlan === SubscriptionPlan.FREE;

  // Fetch usage stats
  const { data: usage } = useQuery({
    queryKey: ['usage'],
    queryFn: () => api.get<User['usage']>('/users/me/usage'),
    enabled: !!user,
  });

  // Create checkout session mutation
  const checkoutMutation = useMutation({
    mutationFn: ({ plan, interval }: { plan: SubscriptionPlan; interval: 'monthly' | 'yearly' }) => {
      const planConfig = PLAN_CONFIGS[plan];
      const priceId = interval === 'yearly'
        ? planConfig.stripePriceIdYearly
        : planConfig.stripePriceIdMonthly;

      return api.post<{ url: string }>('/payments/create-checkout-session', {
        priceId,
        successUrl: `${window.location.origin}/${locale}/settings/billing?success=true`,
        cancelUrl: `${window.location.origin}/${locale}/settings/billing?canceled=true`,
      });
    },
    onSuccess: (data) => {
      window.location.href = data.url;
    },
    onError: (error: Error) => {
      toast.error(error.message || t('checkoutError'));
    },
  });

  // Create portal session mutation
  const portalMutation = useMutation({
    mutationFn: () =>
      api.post<{ url: string }>('/payments/create-portal-session', {
        returnUrl: `${window.location.origin}/settings/billing`,
      }),
    onSuccess: (data) => {
      window.location.href = data.url;
    },
    onError: (error: Error) => {
      toast.error(error.message || t('portalError'));
    },
  });

  const getStatusBadge = () => {
    const status = user?.subscription?.status || 'active';
    const variantMap: Record<string, 'success' | 'warning' | 'danger' | 'info'> = {
      active: 'success',
      trialing: 'info',
      past_due: 'warning',
      canceled: 'danger',
      incomplete: 'warning',
      unpaid: 'danger',
    };
    return (
      <Badge variant={variantMap[status] || 'default'} size="md">
        {t(`status.${status}`)}
      </Badge>
    );
  };

  const formatDate = (date: Date | string | null | undefined) => {
    if (!date) return '-';
    return new Date(date).toLocaleDateString(undefined, {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  };

  const usageItems = [
    {
      icon: FileText,
      label: t('usage.cvsCreated'),
      value: usage?.cvsCreated ?? user?.usage?.cvsCreated ?? 0,
      limit: PLAN_CONFIGS[currentPlan].limits.cvs,
      color: 'text-brand-600 dark:text-brand-400',
      bg: 'bg-brand-50 dark:bg-brand-900/30',
    },
    {
      icon: Mail,
      label: t('usage.coverLetters'),
      value: usage?.coverLettersCreated ?? user?.usage?.coverLettersCreated ?? 0,
      limit: PLAN_CONFIGS[currentPlan].limits.coverLetters,
      color: 'text-emerald-600 dark:text-emerald-400',
      bg: 'bg-emerald-50 dark:bg-emerald-900/30',
    },
    {
      icon: Sparkles,
      label: t('usage.aiCredits'),
      value: usage?.aiCreditsUsed ?? user?.usage?.aiCreditsUsed ?? 0,
      limit: PLAN_CONFIGS[currentPlan].limits.aiCredits,
      color: 'text-purple-600 dark:text-purple-400',
      bg: 'bg-purple-50 dark:bg-purple-900/30',
    },
    {
      icon: Download,
      label: t('usage.exports'),
      value: usage?.exportsThisMonth ?? user?.usage?.exportsThisMonth ?? 0,
      limit: PLAN_CONFIGS[currentPlan].limits.exports,
      color: 'text-amber-600 dark:text-amber-400',
      bg: 'bg-amber-50 dark:bg-amber-900/30',
    },
  ];

  const plans = [
    { key: SubscriptionPlan.FREE, price: '$0', period: t('plans.free') },
    {
      key: SubscriptionPlan.PRO,
      price: billingInterval === 'yearly'
        ? `$${(PLAN_CONFIGS[SubscriptionPlan.PRO].priceYearly / 12).toFixed(2)}`
        : `$${PLAN_CONFIGS[SubscriptionPlan.PRO].priceMonthly}`,
      period: t('plans.perMonth'),
    },
    {
      key: SubscriptionPlan.ENTERPRISE,
      price: billingInterval === 'yearly'
        ? `$${(PLAN_CONFIGS[SubscriptionPlan.ENTERPRISE].priceYearly / 12).toFixed(2)}`
        : `$${PLAN_CONFIGS[SubscriptionPlan.ENTERPRISE].priceMonthly}`,
      period: t('plans.perMonth'),
    },
  ];

  const comparisonFeatures = [
    {
      label: t('features.cvs'),
      free: '5',
      pro: '10',
      enterprise: t('features.unlimited'),
    },
    {
      label: t('features.coverLetters'),
      free: '1',
      pro: '20',
      enterprise: t('features.unlimited'),
    },
    {
      label: t('features.aiCredits'),
      free: '5',
      pro: '100',
      enterprise: '500',
    },
    {
      label: t('features.templates'),
      free: false,
      pro: true,
      enterprise: true,
    },
    {
      label: t('features.unlimitedExports'),
      free: false,
      pro: true,
      enterprise: true,
    },
    {
      label: t('features.docxExport'),
      free: false,
      pro: true,
      enterprise: true,
    },
    {
      label: t('features.prioritySupport'),
      free: false,
      pro: true,
      enterprise: true,
    },
  ];

  return (
    <div className="space-y-8">
      {/* Post-checkout sync banner */}
      {syncingPlan && (
        <div className="flex items-center gap-3 rounded-xl border border-brand-200 bg-brand-50 px-5 py-4 dark:border-brand-800 dark:bg-brand-900/20">
          <Loader2 className="h-5 w-5 animate-spin text-brand-600 dark:text-brand-400" />
          <div>
            <p className="font-semibold text-brand-800 dark:text-brand-300">Setting up your subscription…</p>
            <p className="text-sm text-brand-600 dark:text-brand-400">This usually takes a few seconds. Your new plan and credits will appear shortly.</p>
          </div>
        </div>
      )}
      {syncSuccess && !syncingPlan && (
        <div className="flex items-center gap-3 rounded-xl border border-emerald-200 bg-emerald-50 px-5 py-4 dark:border-emerald-800 dark:bg-emerald-900/20">
          <Check className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
          <div>
            <p className="font-semibold text-emerald-800 dark:text-emerald-300">Subscription activated!</p>
            <p className="text-sm text-emerald-600 dark:text-emerald-400">Your plan has been upgraded. Enjoy your new features and credits.</p>
          </div>
        </div>
      )}

      {/* Current Plan */}
      <Card>
        <div className="flex flex-col gap-6 sm:flex-row sm:items-start sm:justify-between">
          <div className="space-y-3">
            <div className="flex items-center gap-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-brand-50 dark:bg-brand-900/30">
                <Crown className="h-6 w-6 text-brand-600 dark:text-brand-400" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-lg font-semibold text-stone-900 dark:text-white">
                    {currentPlanConfig.name} {t('plan')}
                  </h3>
                  {getStatusBadge()}
                </div>
                {!isFreePlan && user?.subscription?.currentPeriodEnd && (
                  <p className="mt-0.5 text-sm text-stone-500 dark:text-stone-400">
                    {user?.subscription?.cancelAtPeriodEnd
                      ? t('canceledAt', {
                          date: formatDate(user.subscription.currentPeriodEnd),
                        })
                      : t('renewsAt', {
                          date: formatDate(user.subscription.currentPeriodEnd),
                        })}
                  </p>
                )}
              </div>
            </div>
          </div>

          {!isFreePlan && (
            <Button
              variant="secondary"
              onClick={() => portalMutation.mutate()}
              loading={portalMutation.isPending}
              icon={<ExternalLink className="h-4 w-4" />}
            >
              {t('manageSubscription')}
            </Button>
          )}
        </div>
      </Card>

      {/* Upgrade Options - Only for free plan */}
      {isFreePlan && (
        <>
          {/* Billing Interval Toggle */}
          <div className="flex justify-center">
            <div className="inline-flex items-center gap-3 rounded-full border border-stone-200 bg-white p-1 dark:border-stone-700 dark:bg-stone-800">
              <button
                className={`rounded-full px-6 py-2 text-sm font-medium transition-all ${
                  billingInterval === 'monthly'
                    ? 'bg-brand-600 text-white shadow-sm'
                    : 'text-stone-600 hover:text-stone-900 dark:text-stone-400'
                }`}
                onClick={() => setBillingInterval('monthly')}
              >
                Monthly
              </button>
              <button
                className={`rounded-full px-6 py-2 text-sm font-medium transition-all ${
                  billingInterval === 'yearly'
                    ? 'bg-brand-600 text-white shadow-sm'
                    : 'text-stone-600 hover:text-stone-900 dark:text-stone-400'
                }`}
                onClick={() => setBillingInterval('yearly')}
              >
                Yearly
                <span className="ms-1.5 text-xs text-emerald-500 font-semibold">Save 33%</span>
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
          {/* Pro Plan */}
          <Card className="relative overflow-hidden border-brand-200 dark:border-brand-800">
            <div className="absolute end-0 top-0 rounded-es-lg bg-brand-600 px-3 py-1">
              <span className="text-xs font-semibold text-white">{t('popular')}</span>
            </div>
            <div className="mb-6">
              <h4 className="text-lg font-semibold text-stone-900 dark:text-white">
                {t('proTitle')}
              </h4>
              <div className="mt-2 flex items-baseline gap-1">
                <span className="text-3xl font-bold text-stone-900 dark:text-white">
                  ${billingInterval === 'yearly'
                    ? PLAN_CONFIGS[SubscriptionPlan.PRO].priceYearly.toFixed(2)
                    : PLAN_CONFIGS[SubscriptionPlan.PRO].priceMonthly.toFixed(2)}
                </span>
                <span className="text-sm text-stone-500 dark:text-stone-400">
                  /{billingInterval === 'yearly' ? 'year' : 'month'}
                </span>
              </div>
            </div>
            <ul className="mb-6 space-y-3">
              {PLAN_CONFIGS[SubscriptionPlan.PRO].features.map((feature) => (
                <li key={feature} className="flex items-center gap-2">
                  <Check className="h-4 w-4 shrink-0 text-brand-600 dark:text-brand-400" />
                  <span className="text-sm text-stone-600 dark:text-stone-400">{feature}</span>
                </li>
              ))}
            </ul>
            <Button
              className="w-full"
              onClick={() => checkoutMutation.mutate({ plan: SubscriptionPlan.PRO, interval: billingInterval })}
              loading={checkoutMutation.isPending}
              icon={<Zap className="h-4 w-4" />}
            >
              {t('upgradeTo', { plan: 'Pro' })}
            </Button>
          </Card>

          {/* Enterprise Plan */}
          <Card>
            <div className="mb-6">
              <h4 className="text-lg font-semibold text-stone-900 dark:text-white">
                {t('enterpriseTitle')}
              </h4>
              <div className="mt-2 flex items-baseline gap-1">
                <span className="text-3xl font-bold text-stone-900 dark:text-white">
                  ${billingInterval === 'yearly'
                    ? PLAN_CONFIGS[SubscriptionPlan.ENTERPRISE].priceYearly.toFixed(2)
                    : PLAN_CONFIGS[SubscriptionPlan.ENTERPRISE].priceMonthly.toFixed(2)}
                </span>
                <span className="text-sm text-stone-500 dark:text-stone-400">
                  /{billingInterval === 'yearly' ? 'year' : 'month'}
                </span>
              </div>
            </div>
            <ul className="mb-6 space-y-3">
              {PLAN_CONFIGS[SubscriptionPlan.ENTERPRISE].features.map((feature) => (
                <li key={feature} className="flex items-center gap-2">
                  <Check className="h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
                  <span className="text-sm text-stone-600 dark:text-stone-400">{feature}</span>
                </li>
              ))}
            </ul>
            <Button
              variant="outline"
              className="w-full"
              onClick={() => checkoutMutation.mutate({ plan: SubscriptionPlan.ENTERPRISE, interval: billingInterval })}
              loading={checkoutMutation.isPending}
              icon={<Crown className="h-4 w-4" />}
            >
              {t('upgradeTo', { plan: 'Enterprise' })}
            </Button>
          </Card>
        </div>
        </>
      )}

      {/* Usage Stats */}
      <Card>
        <h3 className="mb-6 text-lg font-semibold text-stone-900 dark:text-white">
          {t('usage.title')}
        </h3>
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
          {usageItems.map((item) => {
            const limitDisplay =
              item.limit === 'unlimited' ? '\u221E' : String(item.limit);
            const percentage =
              item.limit === 'unlimited'
                ? 0
                : Math.min((item.value / (item.limit as number)) * 100, 100);

            return (
              <div
                key={item.label}
                className="rounded-lg border border-stone-200 p-4 dark:border-stone-700"
              >
                <div className="mb-3 flex items-center gap-3">
                  <div
                    className={`flex h-9 w-9 items-center justify-center rounded-lg ${item.bg}`}
                  >
                    <item.icon className={`h-5 w-5 ${item.color}`} />
                  </div>
                  <span className="text-sm font-medium text-stone-700 dark:text-stone-300">
                    {item.label}
                  </span>
                </div>
                <div className="flex items-end justify-between">
                  <span className="text-2xl font-bold text-stone-900 dark:text-white">
                    {item.value}
                  </span>
                  <span className="text-sm text-stone-500 dark:text-stone-400">
                    / {limitDisplay}
                  </span>
                </div>
                {item.limit !== 'unlimited' && (
                  <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-stone-100 dark:bg-stone-700">
                    <div
                      className={`h-full rounded-full transition-all ${
                        percentage >= 90
                          ? 'bg-red-500'
                          : percentage >= 70
                            ? 'bg-amber-500'
                            : 'bg-brand-500'
                      }`}
                      style={{ width: `${percentage}%` }}
                    />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </Card>

      {/* Feature Comparison */}
      <Card padding="none">
        <div className="p-6 pb-0">
          <h3 className="text-lg font-semibold text-stone-900 dark:text-white">
            {t('comparison.title')}
          </h3>
        </div>
        <div className="mt-4 overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-stone-200 dark:border-stone-700">
                <th className="px-6 py-3 text-start text-sm font-medium text-stone-500 dark:text-stone-400">
                  {t('comparison.feature')}
                </th>
                {plans.map((plan) => (
                  <th
                    key={plan.key}
                    className="px-6 py-3 text-center text-sm font-medium text-stone-500 dark:text-stone-400"
                  >
                    <div>{PLAN_CONFIGS[plan.key].name}</div>
                    <div className="mt-0.5 text-xs font-normal">
                      {plan.price}
                      {plan.key !== SubscriptionPlan.FREE && (
                        <span>/{t('plans.month')}</span>
                      )}
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-100 dark:divide-stone-700/50">
              {comparisonFeatures.map((feature) => (
                <tr key={feature.label}>
                  <td className="px-6 py-3 text-sm text-stone-700 dark:text-stone-300">
                    {feature.label}
                  </td>
                  {[feature.free, feature.pro, feature.enterprise].map((value, idx) => (
                    <td key={idx} className="px-6 py-3 text-center">
                      {typeof value === 'boolean' ? (
                        value ? (
                          <Check className="mx-auto h-5 w-5 text-emerald-500" />
                        ) : (
                          <X className="mx-auto h-5 w-5 text-stone-300 dark:text-stone-600" />
                        )
                      ) : (
                        <span className="text-sm font-medium text-stone-900 dark:text-white">
                          {value}
                        </span>
                      )}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Billing History */}
      <Card>
        <div className="flex items-center gap-3">
          <Receipt className="h-5 w-5 text-stone-400" />
          <h3 className="text-lg font-semibold text-stone-900 dark:text-white">
            {t('history.title')}
          </h3>
        </div>
        <div className="mt-6 flex flex-col items-center justify-center py-8 text-center">
          <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-stone-100 dark:bg-stone-700">
            <Receipt className="h-6 w-6 text-stone-400" />
          </div>
          <p className="text-sm text-stone-500 dark:text-stone-400">
            {t('history.empty')}
          </p>
          {!isFreePlan && (
            <Button
              variant="ghost"
              size="sm"
              className="mt-3"
              onClick={() => portalMutation.mutate()}
              loading={portalMutation.isPending}
            >
              {t('history.viewInStripe')}
            </Button>
          )}
        </div>
      </Card>
    </div>
  );
}
