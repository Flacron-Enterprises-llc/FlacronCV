'use client';
import React from 'react';

import { useState, useEffect } from 'react';
import { useTranslations } from 'next-intl';
import { useSearchParams, usePathname } from 'next/navigation';
import { useAuth } from '@/providers/AuthProvider';
import { api } from '@/lib/api';
import { useQuery, useMutation } from '@tanstack/react-query';
import {
  User,
  SubscriptionPlan,
  PLAN_CONFIGS,
  BillingInvoice,
  TRIAL_PERIOD_DAYS,
  customerFacingPlans,
  isPlanPurchasable,
  YEARLY_BILLING_ENABLED,
  yearlySavingsPercent,
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
  AlertCircle,
} from 'lucide-react';
import { toast } from 'sonner';
import { track } from '@/lib/analytics';
import { toDate } from '@/lib/format-date';

export default function BillingPage(): React.JSX.Element | null {
  const t = useTranslations('billing');
  const { user, refreshUser } = useAuth();
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const locale = pathname.split('/')[1] || 'en';
  const [billingInterval, setBillingInterval] = useState<'monthly' | 'yearly'>('monthly');
  const [syncSuccess, setSyncSuccess] = useState(false);
  const [verifying, setVerifying] = useState(searchParams.get('success') === 'true');

  // After Stripe redirects back with ?success=true&session_id=..., verify immediately
  useEffect(() => {
    if (searchParams.get('success') !== 'true') return;
    const sessionId = searchParams.get('session_id');
    if (!sessionId) { setVerifying(false); return; }

    api.post('/payments/verify-session', { sessionId })
      .then(() => refreshUser())
      .then(() => { setSyncSuccess(true); setVerifying(false); track('plan_upgraded'); })
      .catch(() => {
        // Verification failed — fall back to a single refresh after 3s
        setTimeout(() => refreshUser().then(() => { setSyncSuccess(true); setVerifying(false); }), 3000);
      });
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

  // Real billing history (A3). The API returns [] for users with no Stripe
  // customer, so this is safe to fetch for anyone signed in (incl. downgraded
  // users who still have past invoices).
  const {
    data: invoices,
    isLoading: invoicesLoading,
    isError: invoicesError,
    refetch: refetchInvoices,
  } = useQuery({
    queryKey: ['invoices'],
    queryFn: () => api.get<BillingInvoice[]>('/payments/invoices'),
    enabled: !!user,
  });

  const formatMoney = (amountMinor: number, currency: string) => {
    try {
      return new Intl.NumberFormat(locale, { style: 'currency', currency: currency.toUpperCase() }).format(
        amountMinor / 100,
      );
    } catch {
      return `${(amountMinor / 100).toFixed(2)} ${currency.toUpperCase()}`;
    }
  };

  const invoiceStatusVariant: Record<string, 'success' | 'warning' | 'danger' | 'default'> = {
    paid: 'success',
    open: 'warning',
    void: 'danger',
    uncollectible: 'danger',
    draft: 'default',
  };
  const invoiceStatusKeys = ['paid', 'open', 'void', 'uncollectible', 'draft'];

  // Create checkout session mutation
  const checkoutMutation = useMutation({
    mutationFn: ({ plan, interval }: { plan: SubscriptionPlan; interval: 'monthly' | 'yearly' }) => {
      // A plan with no configured Stripe price (e.g. Career Accelerator until
      // the client sets it) is not purchasable. This stays a client-side check
      // so the user gets "coming soon" rather than a round-trip and an error.
      if (!PLAN_CONFIGS[plan].stripePriceIdMonthly) return Promise.reject(new Error(t('coming_soon')));

      // Send the PLAN, never a price id. The server resolves the actual Stripe
      // price from its own configuration — the ids in PLAN_CONFIGS are only
      // fallbacks and belong to whichever Stripe account was current when they
      // were written, which is not necessarily the one the API is talking to.
      return api.post<{ url: string }>('/payments/create-checkout-session', {
        plan,
        interval,
        successUrl: `${window.location.origin}/${locale}/settings/billing?success=true&session_id={CHECKOUT_SESSION_ID}`,
        cancelUrl: `${window.location.origin}/${locale}/settings/billing?canceled=true`,
      });
    },
    onSuccess: (data, variables) => {
      track('checkout_started', { plan: variables.plan, interval: variables.interval });
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

  /**
   * `currentPeriodEnd` is written to Firestore as a Date, so it reaches the
   * client as a serialised Firestore Timestamp — `{_seconds, _nanoseconds}` —
   * not as a Date or an ISO string. That object is truthy, so it passed the
   * `!date` guard, and `new Date({_seconds: …})` yields an Invalid Date whose
   * `toLocaleDateString()` returns the literal string "Invalid Date". Hence
   * "Your free trial ends on Invalid Date".
   *
   * `toDate` understands every shape a Firestore timestamp arrives in and
   * returns null for anything unparseable. The parameter is `unknown` because
   * the old signature — `Date | string | null | undefined` — did not describe
   * the value actually being passed, which is what hid the bug from the
   * type-checker.
   */
  const formatDate = (date: unknown) => {
    const d = toDate(date);
    if (!d) return '-';
    return d.toLocaleDateString(undefined, {
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
      color: 'text-stone-600 dark:text-stone-400',
      bg: 'bg-stone-100 dark:bg-stone-800',
    },
    {
      icon: Sparkles,
      label: t('usage.aiCredits'),
      value: usage?.aiCreditsUsed ?? user?.usage?.aiCreditsUsed ?? 0,
      limit: PLAN_CONFIGS[currentPlan].limits.aiCredits,
      color: 'text-stone-600 dark:text-stone-400',
      bg: 'bg-stone-100 dark:bg-stone-800',
    },
    {
      icon: Download,
      label: t('usage.exports'),
      value: usage?.exportsThisMonth ?? user?.usage?.exportsThisMonth ?? 0,
      limit: PLAN_CONFIGS[currentPlan].limits.exports,
      color: 'text-stone-600 dark:text-stone-400',
      bg: 'bg-stone-100 dark:bg-stone-800',
    },
  ];

  // Same visibility rule as the public pricing page — a plan is listed only if
  // a customer can actually buy it. This is what keeps the two catalogues in
  // agreement; previously this page advertised Career Accelerator ("coming
  // soon") while public pricing did not list it at all.
  const visiblePlans = customerFacingPlans();

  // Price and suffix for the SELECTED interval, used by both the plan cards and
  // the comparison table so they cannot tell different stories. The cards used
  // to render priceMonthly unconditionally — harmless only while the Yearly
  // toggle was disabled. With annual selectable that would advertise
  // "$29.99/month" on a button that charges $299.99 once.
  const planAmount = (plan: SubscriptionPlan) =>
    billingInterval === 'yearly' ? PLAN_CONFIGS[plan].priceYearly : PLAN_CONFIGS[plan].priceMonthly;
  const intervalSuffix = billingInterval === 'yearly' ? t('per_year') : `/${t('plans.month')}`;

  const plans = visiblePlans.map((key) =>
    key === SubscriptionPlan.FREE
      ? { key, price: '$0', period: t('plans.free') }
      : { key, price: `$${planAmount(key).toFixed(2)}`, period: intervalSuffix },
  );

  // Career Accelerator becomes purchasable only once a real Stripe price is set.
  // Until then it is hidden from BOTH surfaces rather than shown as "coming
  // soon" on one of them; set its Stripe price id to reveal it everywhere.
  const careerPurchasable = isPlanPurchasable(SubscriptionPlan.CAREER_ACCELERATOR);

  // A never-subscribed user is eligible for the free trial (mirrors the backend).
  const trialEligible = TRIAL_PERIOD_DAYS > 0 && !user?.subscription?.stripeSubscriptionId;
  const isTrialing = user?.subscription?.status === 'trialing';
  const upgradeCta = (plan: string) =>
    trialEligible ? t('start_trial', { days: TRIAL_PERIOD_DAYS }) : t('upgradeTo', { plan });

  // Maps a plan to its column key in `comparisonFeatures`. Typed as a full
  // Record, so adding a plan to the enum without adding its column is a
  // compile error rather than a silently blank cell.
  const FEATURE_KEY_BY_PLAN: Record<SubscriptionPlan, 'free' | 'pro' | 'career' | 'enterprise'> = {
    [SubscriptionPlan.FREE]: 'free',
    [SubscriptionPlan.PRO]: 'pro',
    [SubscriptionPlan.CAREER_ACCELERATOR]: 'career',
    [SubscriptionPlan.ENTERPRISE]: 'enterprise',
  };

  const comparisonFeatures = [
    {
      label: t('features.cvs'),
      free: '5',
      pro: '10',
      career: '25',
      enterprise: t('features.unlimited'),
    },
    {
      label: t('features.coverLetters'),
      free: '1',
      pro: '20',
      career: '50',
      enterprise: t('features.unlimited'),
    },
    {
      label: t('features.aiCredits'),
      free: '5',
      pro: '100',
      career: '250',
      enterprise: '500',
    },
    {
      label: t('features.templates'),
      free: false,
      pro: true,
      career: true,
      enterprise: true,
    },
    {
      label: t('features.unlimitedExports'),
      free: false,
      pro: true,
      career: true,
      enterprise: true,
    },
    {
      label: t('features.docxExport'),
      free: false,
      pro: true,
      career: true,
      enterprise: true,
    },
    {
      label: t('features.prioritySupport'),
      free: false,
      pro: true,
      career: true,
      enterprise: true,
    },
  ];

  return (
    <div className="space-y-6">
      {syncSuccess && (
        <div className="flex items-center gap-3 rounded-xl border border-emerald-200 bg-emerald-50 px-5 py-4 dark:border-emerald-800 dark:bg-emerald-900/20">
          <Check className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
          <div>
            <p className="font-semibold text-emerald-800 dark:text-emerald-300">{t('activated_title')}</p>
            <p className="text-sm text-emerald-600 dark:text-emerald-400">{t('activated_desc')}</p>
          </div>
        </div>
      )}

      {verifying && !syncSuccess && (
        <div className="flex items-center gap-3 rounded-xl border border-brand-200 bg-brand-50 px-5 py-4 dark:border-brand-800 dark:bg-brand-900/20">
          <div className="h-4 w-4 animate-spin rounded-full border-2 border-brand-500 border-t-transparent" />
          <p className="font-medium text-brand-800 dark:text-brand-300">{t('verifying_payment')}</p>
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
                    {isTrialing
                      ? t('trialEnds', { date: formatDate(user.subscription.currentPeriodEnd) })
                      : user?.subscription?.cancelAtPeriodEnd
                        ? t('canceledAt', { date: formatDate(user.subscription.currentPeriodEnd) })
                        : t('renewsAt', { date: formatDate(user.subscription.currentPeriodEnd) })}
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
                {t('monthly')}
              </button>
              {/* Follows YEARLY_BILLING_ENABLED rather than being hard-disabled.
                  Real year-interval Stripe prices are configured and verified
                  ($299.99 and $999.99, interval=year), so annual is genuinely
                  purchasable and labelling it "Coming soon" was false. The flag
                  still governs: if the annual price ids are ever removed it
                  turns off, and this control reverts to disabled with the
                  badge — see the yearly-billing guard in plan-advertising.spec. */}
              <button
                type="button"
                disabled={!YEARLY_BILLING_ENABLED}
                title={YEARLY_BILLING_ENABLED ? undefined : t('yearly_unavailable_note')}
                aria-pressed={billingInterval === 'yearly'}
                onClick={() => YEARLY_BILLING_ENABLED && setBillingInterval('yearly')}
                className={`rounded-full px-6 py-2 text-sm font-medium transition-all ${
                  !YEARLY_BILLING_ENABLED
                    ? 'cursor-not-allowed text-stone-400 dark:text-stone-500'
                    : billingInterval === 'yearly'
                      ? 'bg-brand-600 text-white shadow-sm'
                      : 'text-stone-600 hover:text-stone-900 dark:text-stone-400'
                }`}
              >
                {t('yearly')}
                {YEARLY_BILLING_ENABLED ? (
                  <span className="ms-1.5 text-xs font-semibold text-emerald-600 dark:text-emerald-400">
                    {t('yearly_save', { percent: yearlySavingsPercent(SubscriptionPlan.PRO) })}
                  </span>
                ) : (
                  <span className="ms-1.5 text-xs font-semibold text-amber-500">{t('yearly_coming_soon')}</span>
                )}
              </button>
            </div>
          </div>

          {/* auto-fit/minmax rather than lg:grid-cols-3: viewport breakpoints
              ignore the 256px sidebar, so 3 columns were being forced into ~790px
              and each card collapsed to ~250px (clipped by Card's overflow-hidden).
              This reflows to 2 or 1 column based on the ACTUAL container width.
              min(100%,17rem) keeps it safe on very narrow screens. */}
          <div className="grid gap-6 grid-cols-[repeat(auto-fit,minmax(min(100%,17rem),1fr))]">
          {/* Pro Plan */}
          <Card className="relative overflow-hidden border-brand-200 dark:border-brand-800">
            <div className="absolute end-0 top-0 rounded-es-lg bg-brand-600 px-3 py-1">
              <span className="text-xs font-semibold text-white">{t('popular')}</span>
            </div>
            <div className="mb-6">
              <h4 className="text-lg font-semibold text-stone-900 dark:text-white">
                {t('proTitle')}
              </h4>
              {/* flex-wrap: the Card is overflow-hidden (for the corner badge), so
                  without wrapping the "/month" suffix is clipped on narrow cards. */}
              <div className="mt-2 flex flex-wrap items-baseline gap-1">
                <span className="text-3xl font-bold text-stone-900 dark:text-white">
                  ${planAmount(SubscriptionPlan.PRO).toFixed(2)}
                </span>
                <span className="text-sm text-stone-500 dark:text-stone-400">
                  {intervalSuffix}
                </span>
              </div>
            </div>
            <ul className="mb-6 space-y-3">
              {PLAN_CONFIGS[SubscriptionPlan.PRO].features.map((feature) => (
                <li key={feature} className="flex items-start gap-2">
                  <Check className="h-4 w-4 shrink-0 text-brand-600 dark:text-brand-400" />
                  <span className="min-w-0 break-words text-sm text-stone-600 dark:text-stone-400">{feature}</span>
                </li>
              ))}
            </ul>
            <Button
              className="w-full"
              onClick={() => checkoutMutation.mutate({ plan: SubscriptionPlan.PRO, interval: billingInterval })}
              loading={checkoutMutation.isPending}
              icon={<Zap className="h-4 w-4" />}
            >
              {upgradeCta('Pro')}
            </Button>
          </Card>

          {/* Career Accelerator. Rendered only when it is genuinely purchasable
              — an advertised plan with no checkout is the inconsistency the
              client flagged between this page and public pricing. */}
          {careerPurchasable && (
          <Card className="relative overflow-hidden">
            <div className="mb-6">
              <h4 className="text-lg font-semibold text-stone-900 dark:text-white">
                {PLAN_CONFIGS[SubscriptionPlan.CAREER_ACCELERATOR].name}
              </h4>
              {/* flex-wrap: the Card is overflow-hidden (for the corner badge), so
                  without wrapping the "/month" suffix is clipped on narrow cards. */}
              <div className="mt-2 flex flex-wrap items-baseline gap-1">
                <span className="text-3xl font-bold text-stone-900 dark:text-white">
                  ${planAmount(SubscriptionPlan.CAREER_ACCELERATOR).toFixed(2)}
                </span>
                <span className="text-sm text-stone-500 dark:text-stone-400">
                  {intervalSuffix}
                </span>
              </div>
            </div>
            <ul className="mb-6 space-y-3">
              {PLAN_CONFIGS[SubscriptionPlan.CAREER_ACCELERATOR].features.map((feature) => (
                <li key={feature} className="flex items-start gap-2">
                  <Check className="h-4 w-4 shrink-0 text-brand-600 dark:text-brand-400" />
                  <span className="min-w-0 break-words text-sm text-stone-600 dark:text-stone-400">{feature}</span>
                </li>
              ))}
            </ul>
            <Button
              variant="outline"
              className="w-full"
              onClick={() =>
                checkoutMutation.mutate({ plan: SubscriptionPlan.CAREER_ACCELERATOR, interval: billingInterval })
              }
              loading={checkoutMutation.isPending}
              icon={<Sparkles className="h-4 w-4" />}
            >
              {upgradeCta(PLAN_CONFIGS[SubscriptionPlan.CAREER_ACCELERATOR].name)}
            </Button>
          </Card>
          )}

          {/* Enterprise Plan */}
          <Card>
            <div className="mb-6">
              <h4 className="text-lg font-semibold text-stone-900 dark:text-white">
                {t('enterpriseTitle')}
              </h4>
              {/* flex-wrap: the Card is overflow-hidden (for the corner badge), so
                  without wrapping the "/month" suffix is clipped on narrow cards. */}
              <div className="mt-2 flex flex-wrap items-baseline gap-1">
                <span className="text-3xl font-bold text-stone-900 dark:text-white">
                  ${planAmount(SubscriptionPlan.ENTERPRISE).toFixed(2)}
                </span>
                <span className="text-sm text-stone-500 dark:text-stone-400">
                  {intervalSuffix}
                </span>
              </div>
            </div>
            <ul className="mb-6 space-y-3">
              {PLAN_CONFIGS[SubscriptionPlan.ENTERPRISE].features.map((feature) => (
                <li key={feature} className="flex items-start gap-2">
                  <Check className="h-4 w-4 shrink-0 text-brand-600 dark:text-brand-400" />
                  <span className="min-w-0 break-words text-sm text-stone-600 dark:text-stone-400">{feature}</span>
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
              {upgradeCta('Enterprise')}
            </Button>
          </Card>
        </div>
        </>
      )}

      {/* Usage Stats */}
      <Card>
        {/* Plan-keyed, not cadence-keyed: "Free Plan Usage" stays honest
            before and after F.3 (which changes who the cron resets, not
            this heading). Paid keep "Usage This Month". */}
        <h3 className="mb-6 text-lg font-semibold text-stone-900 dark:text-white">
          {isFreePlan ? t('usage.title_free') : t('usage.title')}
        </h3>
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
          {usageItems.map((item) => {
            const limitDisplay =
              item.limit === 'unlimited' ? '\u221E' : String(item.limit);
            const percentage =
              item.limit === 'unlimited'
                ? 0
                : Math.min((item.value / (item.limit as number)) * 100, 100);
            const remaining =
              item.limit === 'unlimited'
                ? null
                : Math.max(0, (item.limit as number) - item.value);

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
                {remaining !== null && (
                  <p className="mt-1.5 text-xs text-stone-500 dark:text-stone-400">
                    {t('usage.remaining', { count: remaining })}
                  </p>
                )}
                {remaining !== null && remaining > 0 && percentage >= 70 && (
                  <p className="mt-1.5 text-xs text-amber-600 dark:text-amber-400">
                    {t('usage.low')}
                  </p>
                )}
                {remaining === 0 && isFreePlan && (
                  <Button
                    variant="outline"
                    className="mt-3 w-full"
                    onClick={() =>
                      checkoutMutation.mutate({
                        plan: SubscriptionPlan.PRO,
                        interval: billingInterval,
                      })
                    }
                    loading={checkoutMutation.isPending}
                    icon={<Zap className="h-4 w-4" />}
                  >
                    {upgradeCta('Pro')}
                  </Button>
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
                      {plan.key !== SubscriptionPlan.FREE && <span>{intervalSuffix}</span>}
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
                  {/* Iterate the SAME `plans` array the header uses. A fixed
                      four-cell list here silently misaligned the table the
                      moment plan visibility became dynamic: with Career
                      Accelerator unpurchasable the header renders 3 columns
                      while the body emitted 4, so every value shifted one
                      column left and "Enterprise" sat above Career
                      Accelerator's limits. Driving both from one source makes
                      that class of mismatch impossible. */}
                  {plans.map((plan) => {
                    const value = feature[FEATURE_KEY_BY_PLAN[plan.key]];
                    return (
                      <td key={plan.key} className="px-6 py-3 text-center">
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
                    );
                  })}
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
        {invoicesLoading ? (
          <div className="mt-6 space-y-2">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-14 animate-pulse rounded-lg bg-stone-100 dark:bg-stone-800" />
            ))}
          </div>
        ) : invoicesError ? (
          <div className="mt-6 flex flex-col items-center justify-center py-8 text-center">
            <AlertCircle className="mb-3 h-8 w-8 text-danger-400 dark:text-danger-500" />
            <p className="text-sm text-stone-500 dark:text-stone-400">{t('history.loadError')}</p>
            <Button variant="ghost" size="sm" className="mt-3" onClick={() => refetchInvoices()}>
              {t('history.retry')}
            </Button>
          </div>
        ) : invoices && invoices.length > 0 ? (
          <ul className="mt-4 divide-y divide-stone-100 dark:divide-stone-700/50">
            {invoices.map((inv) => {
              const label = invoiceStatusKeys.includes(inv.status)
                ? t(`history.st_${inv.status}`)
                : inv.status;
              const link = inv.invoicePdf || inv.hostedInvoiceUrl;
              const isPdf = !!inv.invoicePdf;
              return (
                <li key={inv.id} className="flex items-center justify-between gap-4 py-3">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-stone-900 dark:text-white">
                      {formatMoney(inv.amountPaid || inv.amountDue, inv.currency)}
                    </p>
                    <p className="mt-0.5 truncate text-xs text-stone-500 dark:text-stone-400">
                      {formatDate(inv.created)}
                      {inv.number ? ` · ${inv.number}` : ''}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-3">
                    <Badge variant={invoiceStatusVariant[inv.status] || 'default'} size="sm">
                      {label}
                    </Badge>
                    {link && (
                      <a
                        href={link}
                        target="_blank"
                        rel="noopener noreferrer"
                        title={isPdf ? t('history.download') : t('history.view')}
                        aria-label={isPdf ? t('history.download') : t('history.view')}
                        className="rounded p-1.5 text-stone-400 transition-colors hover:bg-stone-100 hover:text-stone-700 dark:hover:bg-stone-800 dark:hover:text-stone-200"
                      >
                        {isPdf ? <Download className="h-4 w-4" /> : <ExternalLink className="h-4 w-4" />}
                      </a>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        ) : (
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
        )}
      </Card>
    </div>
  );
}
