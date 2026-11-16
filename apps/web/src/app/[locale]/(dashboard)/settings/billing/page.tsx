'use client';
import React from 'react';

import { useEffect, useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import { useSearchParams, usePathname } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { AlertCircle, Check, Crown, Download, ExternalLink, Info, Receipt } from 'lucide-react';
import { toast } from 'sonner';
import type { BillingInterval, PlanId } from '@flacroncv/career-shared';
import { SubscriptionPlan, type BillingInvoice, TRIAL_PERIOD_DAYS } from '@flacroncv/shared-types';
import { Link } from '@/i18n/routing';
import { useAuth } from '@/providers/AuthProvider';
import { api, ApiError } from '@/lib/api';
import Button from '@/components/ui/Button';
import Card from '@/components/ui/Card';
import Badge from '@/components/ui/Badge';
import { track } from '@/lib/analytics';
import { fcgeTrack, fcgeUpgradeClicked } from '@/lib/fcge';
import { toDate } from '@/lib/format-date';
import { shouldClaimCheckoutSuccess } from '@/lib/checkout-verify';
import { useApiErrorMessage } from '@/hooks/useApiErrorMessage';
import { isCareerEnabled, useCareerApi } from '@/components/career/CareerServices';
import {
  careerBillingStatusKey,
  careerRenewal,
  formatCareerDate,
  hasStripeCareerSubscription,
  type CareerBillingStatusView,
} from '@/components/career/career-subscription';
import { isLegacyPlan, isPricingPlan, equivalentPlan } from '@/components/pricing/plan-catalog';
import { addonById } from '@flacroncv/career-shared';
import {
  PLAN_AVAILABILITY_QUERY_KEY,
  anyAddonOnSale,
  usePlanAvailability,
} from '@/components/pricing/plan-availability';
import { AddonCatalog, useAddonAllowance } from '@/components/pricing/AddonCatalog';
import { usePlanFormat } from '@/components/pricing/plan-format';
import { PlanComparison } from '@/components/pricing/PlanComparison';
import { ChangePlanPanel } from '@/components/pricing/billing/ChangePlanPanel';
import { AllowanceTable, PackBalances, UsageWarningsBanner } from '@/components/pricing/billing/AllowancePanel';
import { SpendingCapCard } from '@/components/pricing/billing/SpendingCapCard';
import { AddonReturnBanner, useAddonCheckout, useAddonReturnRefresh } from '@/components/pricing/billing/addon-checkout';
import {
  activePacks,
  careerAllowanceRows,
  usageWarnings,
  v1AllowanceRows,
  type V1Usage,
} from '@/components/pricing/billing/billing-model';

/**
 * Settings → Billing: the single plan page (spec §16 "Billing and usage").
 * Current plan and renewal, allowance by unit (V1 counters and career units),
 * 80/95/100% warnings, packs and their expiry, purchase history, plan changes
 * between the five plans, cancellation through the Stripe portal and — only
 * while packs are on sale — the add-on catalog and a spending cap. The former
 * career plans page redirects here.
 */
export default function BillingPage(): React.JSX.Element | null {
  const t = useTranslations('billing');
  const tPricing = useTranslations('pricing');
  const tCatalog = useTranslations('plan_catalog');
  const tPlan = useTranslations('career.plans.plan');
  const tCareerPlans = useTranslations('career.plans');
  const formatApiError = useApiErrorMessage();
  const queryClient = useQueryClient();
  const { user, refreshUser } = useAuth();
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const locale = pathname.split('/')[1] || 'en';
  const careerOn = isCareerEnabled();
  const careerApi = useCareerApi();
  const { availability } = usePlanAvailability({ includeAddons: Boolean(user) });
  const fmt = usePlanFormat();
  const addonAllowance = useAddonAllowance();
  const [syncSuccess, setSyncSuccess] = useState(false);
  const [syncFailed, setSyncFailed] = useState(false);
  const [verifying, setVerifying] = useState(searchParams.get('success') === 'true');
  // Stripe sends the user back with ?canceled=true when they leave checkout.
  const checkoutCanceled = searchParams.get('canceled') === 'true';
  // Add-on checkouts return with ?pack= or ?addon= (server-chosen URLs). The
  // pack itself is granted by the webhook, so "success" only says payment went through.
  const addonReturn = searchParams.get('pack') ?? searchParams.get('addon');
  // The webhook grants the pack shortly after the return: refetch the balances for ~10 s.
  useAddonReturnRefresh(addonReturn);

  // Stripe puts ?success=true on the return URL even when payment did not
  // complete. Only a successful verify-session with a paid plan may show the
  // activated banner.
  useEffect(() => {
    if (searchParams.get('success') !== 'true') return;
    const sessionId = searchParams.get('session_id');
    if (!sessionId) {
      setVerifying(false);
      setSyncFailed(true);
      return;
    }

    let cancelled = false;
    api
      .post<{ plan: SubscriptionPlan; status: string }>('/payments/verify-session', { sessionId })
      .then(async (res) => {
        await refreshUser();
        if (cancelled) return;
        if (shouldClaimCheckoutSuccess(true, res?.plan)) {
          setSyncSuccess(true);
          setSyncFailed(false);
          track('plan_upgraded');
          if (res?.status === 'trialing') {
            fcgeTrack('trial_started', { plan: res.plan, trialDays: TRIAL_PERIOD_DAYS, days: TRIAL_PERIOD_DAYS });
          }
        } else {
          setSyncSuccess(false);
          setSyncFailed(true);
        }
        setVerifying(false);
      })
      .catch(() => {
        void refreshUser().finally(() => {
          if (cancelled) return;
          setSyncSuccess(false);
          setSyncFailed(true);
          setVerifying(false);
        });
      });

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const currentPlan: string = user?.subscription?.plan || SubscriptionPlan.FREE;
  const isFreePlan = currentPlan === SubscriptionPlan.FREE;
  const legacy = isLegacyPlan(currentPlan);
  // The Stripe portal only exists for accounts with a Stripe customer. A paid
  // plan without one (granted by support, or billed by a mobile store) has
  // nothing to open, so those accounts get a pointer to support instead.
  const hasStripeCustomer = !!user?.subscription?.stripeCustomerId;

  // Server is the source of truth for the trial label. Fail closed.
  const { data: trialEligibility } = useQuery({
    queryKey: ['trial-eligibility'],
    queryFn: () => api.get<{ eligible: boolean }>('/payments/trial-eligibility'),
    enabled: !!user && isFreePlan,
  });

  const { data: usage } = useQuery({
    queryKey: ['usage'],
    queryFn: () => api.get<V1Usage>('/users/me/usage'),
    enabled: !!user,
  });

  const careerUsage = useQuery({
    queryKey: ['career-usage', user?.uid ?? 'anon'],
    queryFn: () => careerApi.usage(),
    enabled: Boolean(user) && careerOn,
    retry: false,
  });

  // Customers who bought the former career add-on keep that separate Stripe
  // subscription until it ends; it is listed here and managed in the portal.
  const careerStatus = useQuery<CareerBillingStatusView>({
    queryKey: careerBillingStatusKey(user?.uid),
    queryFn: () => api.get<CareerBillingStatusView>('/career-billing/status'),
    enabled: Boolean(user) && careerOn,
    retry: false,
  });
  const addonSub = careerStatus.data?.careerSubscription ?? null;
  const addonRenewal = careerRenewal(addonSub);

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
      return new Intl.NumberFormat(`${locale}-u-nu-latn`, { style: 'currency', currency: currency.toUpperCase() }).format(
        amountMinor / 100,
      );
    } catch {
      return `${(amountMinor / 100).toFixed(2)} ${currency.toUpperCase()}`;
    }
  };

  /** Accepts every shape a Firestore timestamp arrives in; '-' for anything unparseable. */
  const formatDate = (date: unknown) => {
    const d = toDate(date);
    if (!d) return '-';
    return d.toLocaleDateString(`${locale}-u-nu-latn`, { year: 'numeric', month: 'long', day: 'numeric' });
  };

  const invoiceStatusVariant: Record<string, 'success' | 'warning' | 'danger' | 'default'> = {
    paid: 'success',
    open: 'warning',
    void: 'danger',
    uncollectible: 'danger',
    draft: 'default',
  };
  const invoiceStatusKeys = ['paid', 'open', 'void', 'uncollectible', 'draft'];

  const checkoutMutation = useMutation({
    mutationFn: ({ plan, interval, expectTrial }: { plan: PlanId; interval: BillingInterval; expectTrial: boolean }) =>
      // Send the PLAN, never a price id: the server resolves the Stripe price
      // from its own configuration and refuses plans it cannot sell.
      api.post<{ url: string }>('/payments/create-checkout-session', {
        plan,
        interval: interval === 'annual' ? 'yearly' : 'monthly',
        successUrl: `${window.location.origin}/${locale}/settings/billing?success=true&session_id={CHECKOUT_SESSION_ID}`,
        cancelUrl: `${window.location.origin}/${locale}/settings/billing?canceled=true`,
        ...(expectTrial ? { expectTrial: true } : {}),
      }),
    onSuccess: (data, variables) => {
      track('checkout_started', { plan: variables.plan, interval: variables.interval });
      window.location.href = data.url;
    },
    onError: (error: Error) => {
      if (error instanceof ApiError && error.code === 'TRIAL_NOT_ELIGIBLE') {
        toast.error(t('trial_not_eligible'));
        queryClient.setQueryData(['trial-eligibility'], { eligible: false });
        void refreshUser();
        return;
      }
      if (error instanceof ApiError && error.code === 'PLAN_NOT_CONFIGURED') {
        // The server's answer wins over a stale "on sale": refresh what the cards show.
        toast.error(tCatalog('not_configured_error'));
        void queryClient.invalidateQueries({ queryKey: PLAN_AVAILABILITY_QUERY_KEY });
        return;
      }
      toast.error(formatApiError(error, t('checkoutError')));
    },
  });

  const portalMutation = useMutation({
    mutationFn: () =>
      api.post<{ url: string }>('/payments/create-portal-session', {
        returnUrl: `${window.location.origin}/${locale}/settings/billing`,
      }),
    onSuccess: (data) => {
      window.location.href = data.url;
    },
    onError: (error: Error) => {
      toast.error(formatApiError(error, t('portalError')));
    },
  });

  // An add-on is bought only after its own review (price, billing, expiry): spec §11 explicit consent.
  // One Idempotency-Key per review; repeated clicks while the request runs send nothing.
  const { reviewAddon, buyingAddon, openReview, cancelReview, confirm: buyAddon } = useAddonCheckout({
    locale,
    onError: (addon, error) => {
      // The API names the minimum plan when it can; the catalog knows it either way.
      const upgrade = error instanceof ApiError && error.code === 'UPGRADE_REQUIRED' && typeof error.details?.minimumPlan !== 'string';
      toast.error(
        upgrade
          ? t('errors.upgradeRequiredPlan', { plan: tPlan(addon.minPlan === 'free' ? 'starter' : addon.minPlan) })
          : formatApiError(error, tCatalog('addon_checkout_error')),
      );
      void queryClient.invalidateQueries({ queryKey: PLAN_AVAILABILITY_QUERY_KEY });
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
      incomplete_expired: 'danger',
      unpaid: 'danger',
      paused: 'warning',
    };
    return (
      <Badge variant={variantMap[status] || 'default'} size="md">
        {t(`status.${status}`)}
      </Badge>
    );
  };

  const planLabel = isPricingPlan(currentPlan)
    ? tPlan(currentPlan)
    : legacy
      ? tCatalog('legacy_label', { plan: tPricing(currentPlan) })
      : currentPlan;

  const careerRows = useMemo(() => careerAllowanceRows(careerUsage.data), [careerUsage.data]);
  const v1Rows = useMemo(
    () => v1AllowanceRows(currentPlan, usage ?? user?.usage, new Set(careerRows.map((row) => row.key))),
    [careerRows, currentPlan, usage, user?.usage],
  );
  const warnings = useMemo(() => usageWarnings([...v1Rows, ...careerRows]), [careerRows, v1Rows]);
  const packs = useMemo(() => activePacks(careerUsage.data), [careerUsage.data]);
  const packsOnSale = anyAddonOnSale(availability);
  const isTrialing = user?.subscription?.status === 'trialing';
  const renewalDate =
    !isFreePlan && user?.subscription?.currentPeriodEnd ? formatDate(user.subscription.currentPeriodEnd) : null;
  const allowanceRenewal = careerUsage.data?.renewalDate ? formatDate(careerUsage.data.renewalDate) : renewalDate;
  // After a downgrade or cancellation, files above the new storage limit are kept until `graceUntil`.
  const storage = careerUsage.data?.storage;
  const storageGrace = storage?.graceUntil && storage.excessBytes > 0 ? { graceUntil: storage.graceUntil, excessBytes: storage.excessBytes } : null;

  return (
    <div className="space-y-6">
      {syncSuccess && (
        <div className="flex items-center gap-3 rounded-xl border border-emerald-200 bg-emerald-50 px-5 py-4 dark:border-emerald-800 dark:bg-emerald-900/20">
          <Check className="h-5 w-5 shrink-0 text-emerald-600 dark:text-emerald-400" />
          <div>
            <p className="font-semibold text-emerald-800 dark:text-emerald-300">{t('activated_title')}</p>
            <p className="text-sm text-emerald-600 dark:text-emerald-400">{t('activated_desc')}</p>
          </div>
        </div>
      )}

      {syncFailed && !syncSuccess && (
        <div className="flex items-center gap-3 rounded-xl border border-red-200 bg-red-50 px-5 py-4 dark:border-red-800 dark:bg-red-900/20">
          <AlertCircle className="h-5 w-5 shrink-0 text-red-600 dark:text-red-400" />
          <div>
            <p className="font-semibold text-red-800 dark:text-red-300">{t('verify_failed_title')}</p>
            <p className="text-sm text-red-600 dark:text-red-400">{t('verify_failed_desc')}</p>
          </div>
        </div>
      )}

      {checkoutCanceled && !verifying && !syncSuccess && (
        <div
          role="status"
          className="flex items-center gap-3 rounded-xl border border-stone-200 bg-white px-5 py-4 dark:border-stone-700 dark:bg-stone-900"
        >
          <Info className="h-5 w-5 shrink-0 text-stone-500 dark:text-stone-400" aria-hidden />
          <p className="text-sm text-stone-700 dark:text-stone-300">{t('checkout_canceled')}</p>
        </div>
      )}

      {verifying && !syncSuccess && !syncFailed && (
        <div className="flex items-center gap-3 rounded-xl border border-brand-200 bg-brand-50 px-5 py-4 dark:border-brand-800 dark:bg-brand-900/20">
          <div className="h-4 w-4 animate-spin rounded-full border-2 border-brand-500 border-t-transparent" />
          <p className="font-medium text-brand-800 dark:text-brand-300">{t('verifying_payment')}</p>
        </div>
      )}

      <AddonReturnBanner addonReturn={addonReturn} />

      <UsageWarningsBanner warnings={warnings} renewal={allowanceRenewal} canBuyPacks={packsOnSale} />

      {storageGrace ? (
        <div
          role="status"
          data-testid="storage-grace"
          className="flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 px-5 py-4 dark:border-amber-800 dark:bg-amber-900/20"
        >
          <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-amber-600 dark:text-amber-400" aria-hidden />
          <p className="text-sm text-amber-900 dark:text-amber-200">
            {t('storage_grace', { excess: fmt.storage(storageGrace.excessBytes), date: formatDate(storageGrace.graceUntil) })}
          </p>
        </div>
      ) : null}

      {/* Current plan */}
      <Card>
        <div className="flex flex-col gap-6 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex min-w-0 items-start gap-3">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-brand-50 dark:bg-brand-900/30">
              <Crown className="h-6 w-6 text-brand-600 dark:text-brand-400" aria-hidden />
            </div>
            <div className="min-w-0 space-y-1">
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="text-lg font-semibold text-stone-900 dark:text-white" data-testid="current-plan-name">
                  {planLabel}
                </h3>
                {getStatusBadge()}
              </div>
              {renewalDate ? (
                <p className="text-sm text-stone-500 dark:text-stone-400">
                  {isTrialing
                    ? t('trialEnds', { date: renewalDate })
                    : user?.subscription?.cancelAtPeriodEnd
                      ? t('canceledAt', { date: renewalDate })
                      : t('renewsAt', { date: renewalDate })}
                </p>
              ) : null}
              {isFreePlan ? <p className="text-sm text-stone-500 dark:text-stone-400">{tCatalog('free_renewal_note')}</p> : null}
              {legacy ? (
                <p className="text-sm text-stone-600 dark:text-stone-300" data-testid="legacy-note">
                  {tCatalog('legacy_note', { tier: tPlan(equivalentPlan(currentPlan)) })}
                </p>
              ) : null}
              {hasStripeCareerSubscription(addonSub) ? (
                <p className="text-sm text-stone-600 dark:text-stone-300">
                  {tCatalog('career_addon_note', {
                    plan: addonSub?.plan && isPricingPlan(addonSub.plan) ? tPlan(addonSub.plan) : tCatalog('career_addon'),
                  })}
                  {addonRenewal ? ` ${tCareerPlans(addonRenewal.key, { date: formatCareerDate(addonRenewal.date, locale) })}` : ''}
                </p>
              ) : null}
            </div>
          </div>

          {!isFreePlan && hasStripeCustomer ? (
            <div className="flex shrink-0 flex-col items-stretch gap-1 sm:items-end">
              <Button
                variant="secondary"
                onClick={() => portalMutation.mutate()}
                loading={portalMutation.isPending}
                icon={<ExternalLink className="h-4 w-4" />}
              >
                {t('manageSubscription')}
              </Button>
              <p className="max-w-xs text-xs text-stone-500 dark:text-stone-400">{tCatalog('portal_cancel_note')}</p>
            </div>
          ) : null}
          {!isFreePlan && !hasStripeCustomer ? (
            <p className="max-w-xs text-sm text-stone-500 dark:text-stone-400">
              {t.rich('managed_by_support', {
                link: (chunks) => (
                  <Link
                    href="/contact-us"
                    className="font-medium text-brand-600 underline underline-offset-2 hover:text-brand-700 dark:text-brand-400"
                  >
                    {chunks}
                  </Link>
                ),
              })}
            </p>
          ) : null}
        </div>
      </Card>

      <AllowanceTable
        rows={[...v1Rows, ...careerRows]}
        title={isFreePlan ? t('usage.title_free') : t('usage.title')}
      />
      {careerOn && careerUsage.isError ? (
        <p className="text-sm text-stone-500 dark:text-stone-400">{tCatalog('career_usage_unavailable')}</p>
      ) : null}

      <PackBalances packs={packs} formatDate={(iso) => formatDate(iso)} />

      <ChangePlanPanel
        currentPlan={currentPlan}
        hasPaidStripeSubscription={!isFreePlan && hasStripeCustomer}
        managedElsewhere={!isFreePlan && !hasStripeCustomer}
        initialPlan={searchParams.get('plan')}
        initialInterval={searchParams.get('interval')}
        trialEligible={trialEligibility?.eligible === true}
        checkoutPending={checkoutMutation.isPending}
        portalPending={portalMutation.isPending}
        onCheckout={(plan, interval, expectTrial) => {
          fcgeUpgradeClicked(plan);
          checkoutMutation.mutate({ plan, interval, expectTrial });
        }}
        onPortal={() => portalMutation.mutate()}
        onPlanChanged={() => {
          void refreshUser();
          void queryClient.invalidateQueries({ queryKey: ['usage'] });
          void queryClient.invalidateQueries({ queryKey: ['invoices'] });
          void queryClient.invalidateQueries({ queryKey: ['career-usage'] });
        }}
      />

      {packsOnSale ? (
        <>
          <Card>
            <AddonCatalog includeAddons onBuy={isFreePlan ? undefined : openReview} buying={buyingAddon} />
            {reviewAddon && addonById(reviewAddon) ? (
              <AddonReview
                name={tCatalog(`addons.${reviewAddon}`)}
                allowance={addonAllowance(addonById(reviewAddon)!)}
                price={fmt.usd(addonById(reviewAddon)!.priceCents)}
                monthly={addonById(reviewAddon)!.billing === 'monthly'}
                expiryMonths={addonById(reviewAddon)!.expiresAfterMonths ?? null}
                busy={buyingAddon === reviewAddon}
                onConfirm={() => void buyAddon(reviewAddon)}
                onCancel={cancelReview}
              />
            ) : null}
            {isFreePlan ? <p className="mt-3 text-sm text-stone-600 dark:text-stone-400">{tCatalog('addons_free_note')}</p> : null}
          </Card>
          {careerOn && user && !isFreePlan ? <SpendingCapCard api={careerApi} userId={user.uid} /> : null}
        </>
      ) : null}

      <Card>
        <PlanComparison
          interval="monthly"
          currentPlan={isPricingPlan(currentPlan) ? currentPlan : null}
          showDefinitions={false}
          headingId="billing-compare-title"
        />
      </Card>

      {/* Billing History */}
      <Card>
        <div className="flex items-center gap-3">
          <Receipt className="h-5 w-5 text-stone-400" aria-hidden />
          <h3 className="text-lg font-semibold text-stone-900 dark:text-white">{t('history.title')}</h3>
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
              const label = invoiceStatusKeys.includes(inv.status) ? t(`history.st_${inv.status}`) : inv.status;
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
            <p className="text-sm text-stone-500 dark:text-stone-400">{t('history.empty')}</p>
            {!isFreePlan && hasStripeCustomer && (
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

function AddonReview({
  name,
  allowance,
  price,
  monthly,
  expiryMonths,
  busy,
  onConfirm,
  onCancel,
}: {
  name: string;
  allowance: string;
  price: string;
  monthly: boolean;
  expiryMonths: number | null;
  busy: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const t = useTranslations('plan_catalog.addon_review');
  return (
    <section
      aria-labelledby="addon-review-title"
      data-testid="addon-review"
      className="mt-5 rounded-xl border border-stone-200 bg-stone-50 p-4 dark:border-stone-700 dark:bg-stone-900"
    >
      <h4 id="addon-review-title" className="font-semibold text-stone-900 dark:text-white">
        {t('title', { name })}
      </h4>
      <ul className="mt-2 list-disc space-y-1 ps-5 text-sm text-stone-700 dark:text-stone-300">
        <li>{allowance}</li>
        <li>{monthly ? t('monthly', { price }) : t('one_time', { price })}</li>
        {expiryMonths ? <li>{t('expiry', { months: expiryMonths })}</li> : null}
        <li>{t('taxes')}</li>
      </ul>
      <div className="mt-4 flex flex-col gap-2 sm:flex-row">
        <Button onClick={onConfirm} loading={busy}>
          {t('continue')}
        </Button>
        <Button variant="secondary" onClick={onCancel}>
          {t('cancel')}
        </Button>
      </div>
    </section>
  );
}
