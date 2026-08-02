'use client';

import React, { useCallback, useId, useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { useModalA11y } from '@/hooks/useModalA11y';
import {
  BillingInterval,
  CRMSubscriptionRecord,
  SubscriptionStatus,
} from '@flacroncv/shared-types';
import { formatDate, toDate } from '@/lib/format-date';
import Card from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import CRMStatCard from '@/components/crm/CRMStatCard';
import {
  CreditCard,
  Search,
  Download,
  ChevronLeft,
  ChevronRight,
  XCircle,
  ExternalLink,
  Filter,
  DollarSign,
  Hourglass,
  TrendingDown,
  Copy,
  Check,
} from 'lucide-react';
import { toast } from 'sonner';
import { downloadCsv } from '@/lib/download-csv';
import { cn } from '@/lib/utils';

interface ListResponse {
  items: CRMSubscriptionRecord[];
  total: number;
  page: number;
  limit: number;
  pages: number;
}

const PLAN_COLORS: Record<string, string> = {
  free: 'bg-stone-100 text-stone-700 dark:bg-stone-800 dark:text-stone-300',
  pro: 'bg-brand-50 text-brand-700 dark:bg-brand-950 dark:text-brand-300',
  career_accelerator: 'bg-fuchsia-50 text-fuchsia-700 dark:bg-fuchsia-950 dark:text-fuchsia-300',
  enterprise: 'bg-violet-50 text-violet-700 dark:bg-violet-950 dark:text-violet-300',
};

const STATUS_COLORS: Record<string, string> = {
  active: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300',
  trialing: 'bg-blue-50 text-blue-700 dark:bg-blue-950 dark:text-blue-300',
  past_due: 'bg-amber-50 text-amber-700 dark:bg-amber-950 dark:text-amber-300',
  incomplete: 'bg-amber-50 text-amber-700 dark:bg-amber-950 dark:text-amber-300',
  canceled: 'bg-red-50 text-red-700 dark:bg-red-950 dark:text-red-300',
  unpaid: 'bg-red-50 text-red-700 dark:bg-red-950 dark:text-red-300',
};

/** Every real subscription status, straight from the shared enum. */
const ALL_STATUSES: SubscriptionStatus[] = Object.values(SubscriptionStatus);
const KNOWN_STATUSES = new Set<string>(ALL_STATUSES);

const STATUS_OPTIONS: string[] = ['', ...ALL_STATUSES];
const PLAN_OPTIONS = ['', 'free', 'pro', 'career_accelerator', 'enterprise'];

/**
 * Per-column visibility for the responsive table. Nine columns at a fixed
 * px-6 simply overflowed on a laptop, so the non-essential ones fold away by
 * breakpoint. User (the identifier), Status and Actions stay visible at every
 * width; every value that folds away is repeated as a sub-line inside the User
 * cell, so nothing is lost. Order must match the header/body cell order.
 */
const COL_VISIBILITY = [
  '', // user
  'hidden md:table-cell', // plan
  '', // status
  'hidden md:table-cell', // amount
  'hidden lg:table-cell', // interval
  'hidden lg:table-cell', // period end
  'hidden xl:table-cell', // cancel at end
  'hidden lg:table-cell', // stripe customer id
  '', // actions
];

/** Rows pulled for the derived metrics; the API caps a page at 100. */
const METRICS_SAMPLE_SIZE = 100;

/** Trailing window the churn figure is measured over. */
const CHURN_WINDOW_DAYS = 30;

function formatAmount(amount: number, currency: string) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: currency.toUpperCase(),
    minimumFractionDigits: 2,
  }).format(amount / 100);
}

/** ISO-4217 codes are three letters; anything else would throw in Intl. */
function safeCurrency(currency: string | undefined): string {
  return currency && /^[A-Za-z]{3}$/.test(currency) ? currency : 'usd';
}

/**
 * One subscription's contribution to MRR, in the smallest currency unit.
 * Yearly plans are divided by 12 so a month-over-month figure is comparable.
 */
function monthlyCents(sub: CRMSubscriptionRecord): number {
  const amount = Number(sub.amount);
  if (!Number.isFinite(amount) || amount <= 0) return 0;
  return sub.interval === BillingInterval.YEAR ? amount / 12 : amount;
}

/**
 * Why churn is a discriminated union rather than a number: a churn rate is only
 * meaningful when the whole population is in hand and something was actually
 * running at the start of the window. The API returns one page of rows, so in
 * most cases it genuinely cannot be computed — and a plausible-looking
 * percentage would be worse than an empty state. Each non-`ok` case therefore
 * carries the reason, which the card renders instead of a number.
 */
type ChurnResult =
  | { state: 'ok'; rate: number; churned: number; base: number }
  | { state: 'truncated' }
  | { state: 'missing_dates' }
  | { state: 'no_base' };

interface SubscriptionMetrics {
  /** Counts for the statuses actually present, in enum order. */
  statusCounts: { status: SubscriptionStatus; count: number }[];
  /** Rows whose status is not a member of the enum (never silently dropped). */
  otherStatusCount: number;
  counted: number;
  currency: string;
  /** How many further currencies were left out of the MRR sums. */
  excludedCurrencies: number;
  mrrActiveCents: number;
  mrrTrialingCents: number;
  churn: ChurnResult;
}

/**
 * Everything on this page is derived from the rows the list endpoint already
 * returns — no new API surface, no invented figures.
 *
 * `complete` says whether `records` is the entire (filtered) population. It
 * gates churn only: the status counts and MRR are honest sums of what is
 * loaded, and the UI states that scope explicitly next to them.
 */
function computeSubscriptionMetrics(
  records: CRMSubscriptionRecord[],
  complete: boolean,
): SubscriptionMetrics {
  const counts = new Map<string, number>();
  for (const r of records) counts.set(r.status, (counts.get(r.status) ?? 0) + 1);

  const statusCounts = ALL_STATUSES.filter((s) => (counts.get(s) ?? 0) > 0).map((s) => ({
    status: s,
    count: counts.get(s) ?? 0,
  }));
  const otherStatusCount = records.filter((r) => !KNOWN_STATUSES.has(r.status)).length;

  // MRR is only summable within a single currency. Pick the most common one
  // among the revenue-bearing rows and report how many were left out, rather
  // than adding dollars to euros.
  const revenueRows = records.filter(
    (r) => r.status === SubscriptionStatus.ACTIVE || r.status === SubscriptionStatus.TRIALING,
  );
  const perCurrency = new Map<string, number>();
  for (const r of revenueRows) {
    const c = safeCurrency(r.currency);
    perCurrency.set(c, (perCurrency.get(c) ?? 0) + 1);
  }
  let currency = safeCurrency(records[0]?.currency);
  let best = 0;
  for (const [c, n] of perCurrency) {
    if (n > best) {
      best = n;
      currency = c;
    }
  }
  const excludedCurrencies = Math.max(perCurrency.size - 1, 0);

  const sumFor = (status: SubscriptionStatus) =>
    revenueRows
      .filter((r) => r.status === status && safeCurrency(r.currency) === currency)
      .reduce((total, r) => total + monthlyCents(r), 0);

  // Cohort churn over the trailing window: of the subscriptions that were
  // running when the window opened, how many have since been canceled.
  const windowStart = new Date(Date.now() - CHURN_WINDOW_DAYS * 24 * 60 * 60 * 1000);
  let base = 0;
  let churned = 0;
  let missingDates = false;
  for (const r of records) {
    const created = toDate(r.createdAt);
    // Created inside the window: it was not part of the opening cohort.
    if (!created || created >= windowStart) continue;
    const canceled = toDate(r.canceledAt);
    if (r.status === SubscriptionStatus.CANCELED && !canceled) {
      // Canceled but undatable — it cannot be placed inside or outside the
      // window, so the whole figure is unsafe.
      missingDates = true;
      continue;
    }
    if (canceled && canceled < windowStart) continue; // already gone before the window
    base += 1;
    if (canceled) churned += 1;
  }

  const churn: ChurnResult = !complete
    ? { state: 'truncated' }
    : missingDates
      ? { state: 'missing_dates' }
      : base === 0
        ? { state: 'no_base' }
        : { state: 'ok', rate: (churned / base) * 100, churned, base };

  return {
    statusCounts,
    otherStatusCount,
    counted: records.length,
    currency,
    excludedCurrencies,
    mrrActiveCents: sumFor(SubscriptionStatus.ACTIVE),
    mrrTrialingCents: sumFor(SubscriptionStatus.TRIALING),
    churn,
  };
}

/** Truncated Stripe customer id with a copy control. */
function StripeCustomerId({
  customerId,
  copied,
  onCopy,
  copyLabel,
}: {
  customerId: string;
  copied: boolean;
  onCopy: (id: string) => void;
  copyLabel: string;
}): React.JSX.Element {
  if (!customerId) return <span className="text-stone-400">—</span>;
  const shown = customerId.length > 14 ? `${customerId.slice(0, 14)}…` : customerId;
  return (
    <span className="inline-flex items-center gap-1.5">
      <span
        className="font-mono text-xs text-stone-600 dark:text-stone-400"
        title={customerId}
      >
        {shown}
      </span>
      <button
        type="button"
        onClick={() => onCopy(customerId)}
        aria-label={copyLabel}
        title={copyLabel}
        className="rounded p-0.5 text-stone-400 transition-colors hover:text-stone-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 dark:hover:text-stone-200"
      >
        {copied ? (
          <Check className="h-3.5 w-3.5 text-emerald-500" />
        ) : (
          <Copy className="h-3.5 w-3.5" />
        )}
      </button>
    </span>
  );
}

export default function CRMSubscriptionsPage(): React.JSX.Element {
  const t = useTranslations('crm');
  // Status labels already exist, translated, under the billing namespace —
  // reused here rather than duplicated as new crm.* keys.
  const tBilling = useTranslations('billing');
  const qc = useQueryClient();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [planFilter, setPlanFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [cancelId, setCancelId] = useState<string | null>(null);
  const [copiedCustomerId, setCopiedCustomerId] = useState<string | null>(null);

  const statusLabel = useCallback(
    (status: string) => (KNOWN_STATUSES.has(status) ? tBilling(`status.${status}`) : status),
    [tBilling],
  );

  const cancelDialogTitleId = useId();
  const cancelDialogRef = useModalA11y<HTMLDivElement>(cancelId !== null, () => setCancelId(null));

  const { data, isLoading } = useQuery<ListResponse>({
    queryKey: ['crm', 'subscriptions', page, planFilter, statusFilter],
    queryFn: () => {
      const params = new URLSearchParams({ page: String(page), limit: '25' });
      if (planFilter) params.set('plan', planFilter);
      if (statusFilter) params.set('status', statusFilter);
      return api.get(`/crm/subscriptions?${params}`);
    },
    staleTime: 30_000,
  });

  /**
   * Separate, deliberately status-unfiltered read for the reporting strip: the
   * table is paginated at 25 rows, which is far too narrow a slice to report
   * MRR or a status breakdown from. It follows the plan filter (so the numbers
   * match the scope on screen) but never the status filter, or the breakdown
   * would only ever show the one status being filtered to.
   */
  const { data: metricsData, isLoading: metricsLoading } = useQuery<ListResponse>({
    queryKey: ['crm', 'subscriptions', 'metrics', planFilter],
    queryFn: () => {
      const params = new URLSearchParams({ page: '1', limit: String(METRICS_SAMPLE_SIZE) });
      if (planFilter) params.set('plan', planFilter);
      return api.get(`/crm/subscriptions?${params}`);
    },
    staleTime: 30_000,
  });

  const metricsRows = metricsData?.items ?? [];
  const metricsTotal = metricsData?.total ?? 0;
  /** True when the population is larger than the slice the metrics ran on. */
  const metricsTruncated = metricsTotal > metricsRows.length;

  const metrics = useMemo(
    () => computeSubscriptionMetrics(metricsData?.items ?? [], !metricsTruncated),
    [metricsData?.items, metricsTruncated],
  );

  const mrrHint = [
    t('subs_stat_mrr_hint'),
    metrics.excludedCurrencies > 0
      ? t('subs_mrr_multi_currency_note', {
          currency: metrics.currency.toUpperCase(),
          count: metrics.excludedCurrencies,
        })
      : null,
  ]
    .filter(Boolean)
    .join(' ');

  const churnHint =
    metrics.churn.state === 'ok'
      ? t('subs_churn_hint_computed', { churned: metrics.churn.churned, base: metrics.churn.base })
      : metrics.churn.state === 'truncated'
        ? t('subs_churn_hint_truncated', { loaded: metricsRows.length, total: metricsTotal })
        : metrics.churn.state === 'missing_dates'
          ? t('subs_churn_hint_missing_dates')
          : t('subs_churn_hint_no_base');

  const copyCustomerId = useCallback(
    async (customerId: string) => {
      if (!navigator.clipboard?.writeText) {
        toast.error(t('subs_copy_error'));
        return;
      }
      try {
        await navigator.clipboard.writeText(customerId);
        setCopiedCustomerId(customerId);
        toast.success(t('subs_copy_success'));
        window.setTimeout(
          () => setCopiedCustomerId((c) => (c === customerId ? null : c)),
          2000,
        );
      } catch {
        toast.error(t('subs_copy_error'));
      }
    },
    [t],
  );

  const cancelMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/crm/subscriptions/${id}/cancel`),
    onSuccess: () => {
      toast.success(t('subs_toast_cancel_success'));
      setCancelId(null);
      qc.invalidateQueries({ queryKey: ['crm', 'subscriptions'] });
    },
    onError: () => toast.error(t('subs_toast_cancel_error')),
  });

  const items = data?.items ?? [];
  const filtered = search
    ? items.filter(
        (s) =>
          s.userEmail.toLowerCase().includes(search.toLowerCase()) ||
          s.userDisplayName.toLowerCase().includes(search.toLowerCase()) ||
          s.id.includes(search),
      )
    : items;

  const totalPages = data?.pages ?? 1;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-stone-900 dark:text-white">{t('subs_title')}</h1>
          <p className="mt-1 text-sm text-stone-500 dark:text-stone-400">
            {t('subs_total_count', { total: data?.total ?? 0 })}
          </p>
        </div>
        <Button
          variant="ghost"
          size="sm"
          icon={<Download className="h-4 w-4" />}
          onClick={() =>
            downloadCsv('/crm/subscriptions/export/csv', 'subscriptions.csv').catch((e) =>
              toast.error(e instanceof Error ? e.message : 'Export failed'),
            )
          }
        >
          {t('export_csv')}
        </Button>
      </div>

      {/* Derived reporting — MRR, churn and the status breakdown, all computed
          client-side from the rows the list endpoint returns. */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <CRMStatCard
          label={t('subs_stat_mrr_active')}
          value={formatAmount(metrics.mrrActiveCents, metrics.currency)}
          icon={DollarSign}
          color="text-emerald-600 bg-emerald-50 dark:bg-emerald-950 dark:text-emerald-400"
          loading={metricsLoading}
          hint={mrrHint}
        />
        <CRMStatCard
          label={t('subs_stat_mrr_trialing')}
          value={formatAmount(metrics.mrrTrialingCents, metrics.currency)}
          icon={Hourglass}
          color="text-blue-600 bg-blue-50 dark:bg-blue-950 dark:text-blue-400"
          loading={metricsLoading}
          hint={t('subs_stat_mrr_trialing_hint')}
        />
        <CRMStatCard
          label={t('subs_stat_churn')}
          value={
            metrics.churn.state === 'ok'
              ? metrics.churn.rate.toFixed(1)
              : t('subs_churn_unavailable')
          }
          suffix={metrics.churn.state === 'ok' ? '%' : ''}
          icon={TrendingDown}
          color="text-amber-600 bg-amber-50 dark:bg-amber-950 dark:text-amber-400"
          loading={metricsLoading}
          hint={churnHint}
        />
      </div>

      {/* Status breakdown */}
      <Card padding="sm">
        <div className="flex flex-wrap items-center gap-2">
          <span className="me-1 text-xs font-semibold uppercase tracking-wider text-stone-500 dark:text-stone-400">
            {t('subs_metrics_status_breakdown')}
          </span>
          {metricsLoading ? (
            Array.from({ length: 4 }).map((_, i) => (
              <span
                key={i}
                className="h-6 w-24 animate-pulse rounded-full bg-stone-200 dark:bg-stone-700"
              />
            ))
          ) : metrics.counted === 0 ? (
            <span className="text-sm text-stone-500 dark:text-stone-400">{t('subs_empty')}</span>
          ) : (
            <>
              {metrics.statusCounts.map(({ status, count }) => (
                <span
                  key={status}
                  className={cn(
                    'inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold',
                    STATUS_COLORS[status] ??
                      'bg-stone-100 text-stone-600 dark:bg-stone-800 dark:text-stone-400',
                  )}
                >
                  {statusLabel(status)}
                  <span className="font-mono">{count}</span>
                  <span className="font-normal opacity-70">
                    {Math.round((count / metrics.counted) * 100)}%
                  </span>
                </span>
              ))}
              {metrics.otherStatusCount > 0 && (
                <span className="inline-flex items-center gap-1.5 rounded-full bg-stone-100 px-2.5 py-0.5 text-xs font-semibold text-stone-600 dark:bg-stone-800 dark:text-stone-400">
                  {t('subs_status_other')}
                  <span className="font-mono">{metrics.otherStatusCount}</span>
                </span>
              )}
            </>
          )}
        </div>
        {!metricsLoading && (
          <p className="mt-3 text-xs text-stone-500 dark:text-stone-400">
            {metricsTruncated
              ? t('subs_metrics_coverage_sample', {
                  loaded: metricsRows.length,
                  total: metricsTotal,
                })
              : t('subs_metrics_coverage_all', { total: metricsTotal })}
          </p>
        )}
      </Card>

      {/* Filters */}
      <Card className="p-4">
        <div className="flex flex-wrap gap-3">
          <div className="relative flex-1 min-w-48">
            <Search className="absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-stone-400" />
            <input
              type="text"
              placeholder={t('subs_search_placeholder')}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full rounded-lg border border-stone-200 bg-stone-50 py-2 ps-9 pe-3 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500 dark:border-stone-700 dark:bg-stone-900 dark:text-white"
            />
          </div>
          <div className="flex items-center gap-2">
            <Filter className="h-4 w-4 text-stone-400" />
            <select
              value={planFilter}
              aria-label={t('filter_by_plan')}
              onChange={(e) => { setPlanFilter(e.target.value); setPage(1); }}
              className="rounded-lg border border-stone-200 bg-stone-50 py-2 px-3 text-sm focus:border-brand-500 focus:outline-none dark:border-stone-700 dark:bg-stone-900 dark:text-white"
            >
              {PLAN_OPTIONS.map((p) => (
                <option key={p} value={p}>{p ? t('subs_filter_plan_option', { plan: ['free', 'pro', 'career_accelerator', 'enterprise'].includes(p) ? t(`plan_${p}`) : p }) : t('subs_filter_all_plans')}</option>
              ))}
            </select>
            <select
              value={statusFilter}
              aria-label={t('filter_by_status')}
              onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}
              className="rounded-lg border border-stone-200 bg-stone-50 py-2 px-3 text-sm focus:border-brand-500 focus:outline-none dark:border-stone-700 dark:bg-stone-900 dark:text-white"
            >
              {STATUS_OPTIONS.map((s) => (
                <option key={s} value={s}>{s ? t('subs_filter_status_option', { status: statusLabel(s) }) : t('subs_filter_all_statuses')}</option>
              ))}
            </select>
          </div>
        </div>
      </Card>

      {/* Table */}
      <Card className="overflow-hidden p-0">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-b border-stone-200 dark:border-stone-700">
              <tr>
                {[t('th_user'), t('th_plan'), t('th_status'), t('th_amount'), t('subs_th_interval'), t('subs_th_period_end'), t('subs_th_cancel_at_end'), t('subs_th_stripe_customer'), t('th_actions')].map((h, i) => (
                  <th
                    key={h}
                    className={cn(
                      'px-4 py-3 text-start text-xs font-semibold uppercase tracking-wider text-stone-500 sm:px-6 dark:text-stone-400',
                      COL_VISIBILITY[i],
                    )}
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-100 dark:divide-stone-800">
              {isLoading
                ? Array.from({ length: 8 }).map((_, i) => (
                    <tr key={i}>
                      {COL_VISIBILITY.map((visibility, j) => (
                        <td key={j} className={cn('px-4 py-3 sm:px-6', visibility)}>
                          <div className="h-4 animate-pulse rounded bg-stone-200 dark:bg-stone-700" />
                        </td>
                      ))}
                    </tr>
                  ))
                : filtered.map((sub) => {
                    const planLabel = ['free', 'pro', 'career_accelerator', 'enterprise'].includes(sub.plan)
                      ? t(`plan_${sub.plan}`)
                      : sub.plan;
                    const intervalLabel =
                      sub.interval === BillingInterval.YEAR
                        ? t('subs_interval_yearly')
                        : sub.interval === BillingInterval.MONTH
                        ? t('subs_interval_monthly')
                        : sub.interval;
                    return (
                      <tr
                        key={sub.id}
                        className="transition-colors hover:bg-stone-50 dark:hover:bg-stone-800/50"
                      >
                        <td className="px-4 py-3 sm:px-6">
                          <div>
                            <p className="font-medium text-stone-900 dark:text-white">
                              {sub.userDisplayName || '—'}
                            </p>
                            <p className="text-xs text-stone-400">{sub.userEmail}</p>
                            <p className="font-mono text-[10px] text-stone-300 dark:text-stone-600">
                              {sub.id.slice(0, 20)}…
                            </p>
                            {/* Values of the columns hidden at this width, so a
                                narrow screen still shows the whole subscription. */}
                            <p className="text-xs text-stone-500 md:hidden">
                              {planLabel} · {formatAmount(sub.amount, sub.currency)}
                            </p>
                            <p className="text-xs text-stone-500 lg:hidden">
                              {intervalLabel} · {formatDate(sub.currentPeriodEnd)}
                            </p>
                            <p className="text-xs text-stone-500 xl:hidden">
                              {t('subs_th_cancel_at_end')}: {sub.cancelAtPeriodEnd ? t('yes') : t('no')}
                            </p>
                            <span className="lg:hidden">
                              <StripeCustomerId
                                customerId={sub.stripeCustomerId}
                                copied={copiedCustomerId === sub.stripeCustomerId}
                                onCopy={copyCustomerId}
                                copyLabel={t('subs_copy_customer_id')}
                              />
                            </span>
                          </div>
                        </td>
                        <td className="hidden px-4 py-3 md:table-cell sm:px-6">
                          <span
                            className={cn(
                              'rounded-full px-2.5 py-0.5 text-xs font-semibold capitalize',
                              PLAN_COLORS[sub.plan] ?? PLAN_COLORS.free,
                            )}
                          >
                            {planLabel}
                          </span>
                        </td>
                        <td className="px-4 py-3 sm:px-6">
                          <span
                            className={cn(
                              'rounded-full px-2.5 py-0.5 text-xs font-semibold capitalize',
                              STATUS_COLORS[sub.status] ??
                                'bg-stone-100 text-stone-600 dark:bg-stone-800 dark:text-stone-400',
                            )}
                          >
                            {statusLabel(sub.status)}
                          </span>
                        </td>
                        <td className="hidden px-4 py-3 font-medium text-stone-900 md:table-cell sm:px-6 dark:text-white">
                          {formatAmount(sub.amount, sub.currency)}
                        </td>
                        <td className="hidden px-4 py-3 capitalize text-stone-600 lg:table-cell sm:px-6 dark:text-stone-400">
                          {intervalLabel}
                        </td>
                        <td className="hidden px-4 py-3 text-stone-600 lg:table-cell sm:px-6 dark:text-stone-400">
                          {formatDate(sub.currentPeriodEnd)}
                        </td>
                        <td className="hidden px-4 py-3 xl:table-cell sm:px-6">
                          <span
                            className={cn(
                              'rounded-full px-2 py-0.5 text-xs font-semibold',
                              sub.cancelAtPeriodEnd
                                ? 'bg-amber-50 text-amber-700 dark:bg-amber-950 dark:text-amber-300'
                                : 'bg-stone-100 text-stone-500 dark:bg-stone-800 dark:text-stone-400',
                            )}
                          >
                            {sub.cancelAtPeriodEnd ? t('yes') : t('no')}
                          </span>
                        </td>
                        <td className="hidden px-4 py-3 lg:table-cell sm:px-6">
                          <StripeCustomerId
                            customerId={sub.stripeCustomerId}
                            copied={copiedCustomerId === sub.stripeCustomerId}
                            onCopy={copyCustomerId}
                            copyLabel={t('subs_copy_customer_id')}
                          />
                        </td>
                        <td className="px-4 py-3 sm:px-6">
                          <div className="flex items-center gap-2">
                            {sub.stripeCustomerId && (
                              <a
                                href={`https://dashboard.stripe.com/customers/${sub.stripeCustomerId}`}
                                target="_blank"
                                rel="noreferrer"
                                className="text-stone-400 transition-colors hover:text-stone-700 dark:hover:text-stone-200"
                                aria-label={t('subs_view_in_stripe')}
                                title={t('subs_view_in_stripe')}
                              >
                                <ExternalLink className="h-4 w-4" />
                              </a>
                            )}
                            {sub.status !== SubscriptionStatus.CANCELED && (
                              <button
                                onClick={() => setCancelId(sub.id)}
                                className="text-red-400 transition-colors hover:text-red-600"
                                aria-label={t('subs_cancel_tooltip')}
                                title={t('subs_cancel_tooltip')}
                              >
                                <XCircle className="h-4 w-4" />
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
            </tbody>
          </table>

          {!isLoading && filtered.length === 0 && (
            <div className="flex flex-col items-center justify-center py-16 text-stone-400">
              <CreditCard className="mb-3 h-10 w-10" />
              <p className="font-medium">{search ? t('subs_search_empty') : t('subs_empty')}</p>
            </div>
          )}
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between border-t border-stone-100 px-4 py-3 dark:border-stone-800">
            <p className="text-xs text-stone-500 dark:text-stone-400">
              {t('pagination_summary', { page, pages: totalPages, total: data?.total ?? 0 })}
            </p>
            <div className="flex gap-1">
              <Button
                variant="ghost"
                size="sm"
                icon={<ChevronLeft className="h-4 w-4" />}
                aria-label={t('pagination_prev')}
                title={t('pagination_prev')}
                disabled={page <= 1}
                onClick={() => setPage((p) => p - 1)}
              />
              <Button
                variant="ghost"
                size="sm"
                icon={<ChevronRight className="h-4 w-4" />}
                aria-label={t('pagination_next')}
                title={t('pagination_next')}
                disabled={page >= totalPages}
                onClick={() => setPage((p) => p + 1)}
              />
            </div>
          </div>
        )}
      </Card>

      {/* Cancel confirmation dialog */}
      {cancelId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
          <div
            ref={cancelDialogRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby={cancelDialogTitleId}
            tabIndex={-1}
            className="w-full max-w-sm outline-none"
          >
            <Card className="w-full space-y-4">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-red-100 dark:bg-red-950">
                  <XCircle className="h-5 w-5 text-red-600 dark:text-red-400" />
                </div>
                <div>
                  <h3 id={cancelDialogTitleId} className="font-semibold text-stone-900 dark:text-white">
                    {t('subs_cancel_dialog_title')}
                  </h3>
                  <p className="text-xs text-stone-500 dark:text-stone-400">
                    {t('subs_cancel_dialog_body')}
                  </p>
                </div>
              </div>
              <div className="flex justify-end gap-2">
                <Button variant="ghost" size="sm" onClick={() => setCancelId(null)}>
                  {t('subs_cancel_keep')}
                </Button>
                <Button
                  variant="danger"
                  size="sm"
                  loading={cancelMutation.isPending}
                  onClick={() => cancelMutation.mutate(cancelId)}
                >
                  {t('subs_cancel_confirm')}
                </Button>
              </div>
            </Card>
          </div>
        </div>
      )}
    </div>
  );
}
