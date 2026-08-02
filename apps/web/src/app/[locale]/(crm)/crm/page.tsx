'use client';
import React, { useState } from 'react';

import { useTranslations } from 'next-intl';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import {
  CRMAnalyticsOverview,
  CRMRevenueDataPoint,
  CRMCustomerGrowthDataPoint,
} from '@flacroncv/shared-types';
import CRMStatCard from '@/components/crm/CRMStatCard';
import RevenueChart from '@/components/crm/RevenueChart';
import CustomerGrowthChart from '@/components/crm/CustomerGrowthChart';
import DateRangeFilter, {
  ALL_TIME_RANGE,
  DateRangeValue,
  dateRangeFilenameSlug,
  resolveDateRange,
  useDateRangeLabel,
} from '@/components/crm/DateRangeFilter';
import { Link } from '@/i18n/routing';
import {
  Users,
  DollarSign,
  TrendingUp,
  UserPlus,
  Target,
  ArrowUpRight,
  Activity,
  BarChart3,
  AlertCircle,
  Download,
} from 'lucide-react';
import Card from '@/components/ui/Card';
import Button from '@/components/ui/Button';

/**
 * Below this many recorded leads a conversion percentage is not meaningful —
 * with 2 leads a single conversion reads as "50%", which the client rightly
 * flagged as misleading. The card explains itself instead.
 */
const MIN_LEADS_FOR_CONVERSION_RATE = 20;

/** RFC 4180 cell: quote everything, double any embedded quote. */
function csvCell(value: string | number): string {
  return `"${String(value).replace(/"/g, '""')}"`;
}

export default function CRMDashboardPage(): React.JSX.Element | null {
  const t = useTranslations('crm');

  const [range, setRange] = useState<DateRangeValue>(ALL_TIME_RANGE);
  const { from, to } = resolveDateRange(range);
  const activeRangeLabel = useDateRangeLabel(range);

  // Sent to every analytics query, and part of each query key so changing the
  // range refetches rather than serving the previous window from cache.
  const rangeParams = new URLSearchParams();
  if (from) rangeParams.set('from', from);
  if (to) rangeParams.set('to', to);
  const rangeQuery = rangeParams.toString() ? `?${rangeParams}` : '';

  const { data: overview, isLoading: loadingOverview, isError: overviewError } = useQuery<CRMAnalyticsOverview>({
    queryKey: ['crm', 'analytics', 'overview', { from, to }],
    queryFn: () => api.get(`/crm/analytics/overview${rangeQuery}`),
    staleTime: 60_000,
  });

  const { data: revenueChart, isLoading: loadingRevenue } = useQuery<CRMRevenueDataPoint[]>({
    queryKey: ['crm', 'analytics', 'revenue-chart', { from, to }],
    queryFn: () => api.get(`/crm/analytics/revenue-chart${rangeQuery}`),
    staleTime: 60_000,
  });

  const { data: growthChart, isLoading: loadingGrowth } = useQuery<CRMCustomerGrowthDataPoint[]>({
    queryKey: ['crm', 'analytics', 'customer-growth', { from, to }],
    queryFn: () => api.get(`/crm/analytics/customer-growth${rangeQuery}`),
    staleTime: 60_000,
  });

  const stats = [
    {
      label: t('dash_stat_total_customers'),
      value: overview?.totalCustomers ?? 0,
      icon: Users,
      color: 'text-brand-600 bg-brand-50 dark:bg-brand-950 dark:text-brand-400',
      change: overview?.thisMonthVsLastMonth.customers,
    },
    {
      label: t('dash_stat_total_revenue'),
      value: overview?.totalRevenue ?? 0,
      icon: DollarSign,
      color: 'text-stone-600 bg-stone-100 dark:bg-stone-800 dark:text-stone-300',
      prefix: '$',
      change: overview?.thisMonthVsLastMonth.revenue,
    },
    {
      label: t('dash_stat_monthly_revenue'),
      value: overview?.monthlyRevenue ?? 0,
      icon: TrendingUp,
      color: 'text-stone-600 bg-stone-100 dark:bg-stone-800 dark:text-stone-300',
      prefix: '$',
    },
    {
      label: t('dash_stat_active_customers'),
      value: overview?.activeCustomers ?? 0,
      icon: Activity,
      color: 'text-stone-600 bg-stone-100 dark:bg-stone-800 dark:text-stone-300',
    },
    {
      label: t('dash_stat_new_this_month'),
      value: overview?.newCustomersThisMonth ?? 0,
      icon: UserPlus,
      color: 'text-stone-600 bg-stone-100 dark:bg-stone-800 dark:text-stone-300',
    },
    {
      label: t('dash_stat_total_leads'),
      value: overview?.totalLeads ?? 0,
      icon: BarChart3,
      color: 'text-stone-600 bg-stone-100 dark:bg-stone-800 dark:text-stone-400',
      change: overview?.thisMonthVsLastMonth.leads,
    },
    {
      label: t('dash_stat_conversion_rate'),
      // A rate computed from a handful of leads is noise dressed up as a
      // metric — 1 conversion out of 2 leads renders as a confident "50%".
      // Below the threshold, say so instead of showing a misleading number.
      value:
        (overview?.totalLeads ?? 0) >= MIN_LEADS_FOR_CONVERSION_RATE
          ? `${overview?.conversionRate ?? 0}%`
          : t('conversion_insufficient'),
      hint:
        (overview?.totalLeads ?? 0) >= MIN_LEADS_FOR_CONVERSION_RATE
          ? undefined
          : t('conversion_insufficient_hint', { min: MIN_LEADS_FOR_CONVERSION_RATE }),
      icon: Target,
      color: 'text-brand-600 bg-brand-50 dark:bg-brand-950 dark:text-brand-400',
    },
    {
      label: t('dash_stat_avg_revenue_per_customer'),
      value: overview?.avgRevenuePerCustomer ?? 0,
      icon: DollarSign,
      color: 'text-stone-600 bg-stone-100 dark:bg-stone-800 dark:text-stone-300',
      prefix: '$',
    },
  ];

  /**
   * Export the figures ON SCREEN, built in the browser.
   *
   * `lib/download-csv.ts` is deliberately not used here: it streams an
   * authenticated CSV from an API endpoint, and `crm/analytics` exposes no such
   * endpoint (only the three JSON reads above). Pointing it at one would give
   * the user a 404 toast. These numbers already live on the client, so the file
   * is assembled from the same `stats` the cards render — the export can never
   * disagree with the screen, and the active range is carried in both the first
   * row and the filename.
   */
  const handleExport = () => {
    const rows: (string | number)[][] = [
      [t('csv_col_metric'), t('csv_col_value')],
      [t('date_range_label'), activeRangeLabel],
      ...stats.map((stat) => [
        stat.label,
        `${'prefix' in stat && stat.prefix ? stat.prefix : ''}${stat.value}`,
      ]),
    ];

    const csv = rows.map((row) => row.map(csvCell).join(',')).join('\r\n');
    // BOM so Excel reads it as UTF-8 — without it the Arabic and Urdu labels
    // arrive as mojibake.
    const blob = new Blob(['\uFEFF', csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `crm-dashboard-${dateRangeFilenameSlug(range)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-stone-900 dark:text-white">{t('dash_title')}</h1>
          <p className="mt-1 text-sm text-stone-500 dark:text-stone-400">
            {t('dash_subtitle')}
          </p>
        </div>

        <div className="flex flex-wrap gap-3">
          <Button
            variant="secondary"
            icon={<Download className="h-4 w-4" />}
            onClick={handleExport}
            disabled={!overview}
          >
            {t('export_csv')}
          </Button>
          <Link href="/crm/leads">
            <Button variant="secondary" icon={<BarChart3 className="h-4 w-4" />}>
              {t('dash_manage_leads')}
            </Button>
          </Link>
          <Link href="/crm/customers">
            <Button icon={<Users className="h-4 w-4" />}>
              {t('dash_view_customers')}
            </Button>
          </Link>
        </div>
      </div>

      <DateRangeFilter value={range} onChange={setRange} />

      {overviewError && (
        <Card className="flex items-center gap-3 border border-red-200 bg-red-50 text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300">
          <AlertCircle className="h-5 w-5 flex-shrink-0" />
          <p className="text-sm font-medium">{t('data_load_error')}</p>
        </Card>
      )}

      {/* KPI Grid */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {stats.map((stat) => (
          <CRMStatCard
            key={stat.label}
            label={stat.label}
            value={typeof stat.value === 'number' ? stat.value : stat.value}
            icon={stat.icon}
            color={stat.color}
            change={'change' in stat ? stat.change : undefined}
            prefix={'prefix' in stat ? stat.prefix : undefined}
            hint={'hint' in stat ? stat.hint : undefined}
            loading={loadingOverview}
          />
        ))}
      </div>

      {/* Charts */}
      <div className="grid gap-6 lg:grid-cols-2">
        <RevenueChart data={revenueChart ?? []} loading={loadingRevenue} />
        <CustomerGrowthChart data={growthChart ?? []} loading={loadingGrowth} />
      </div>

      {/* Quick Links */}
      <div className="grid gap-4 sm:grid-cols-3">
        {[
          {
            href: '/crm/customers',
            label: t('dash_quicklink_customer_management_label'),
            description: t('dash_quicklink_customer_management_desc'),
            icon: Users,
            color: 'text-brand-600 bg-brand-50 dark:bg-brand-950 dark:text-brand-400',
          },
          {
            href: '/crm/leads',
            label: t('dash_quicklink_lead_pipeline_label'),
            description: t('dash_quicklink_lead_pipeline_desc'),
            icon: Target,
            color: 'text-stone-600 bg-stone-100 dark:bg-stone-800 dark:text-stone-300',
          },
          {
            href: '/crm/revenue',
            label: t('dash_quicklink_revenue_label'),
            description: t('dash_quicklink_revenue_desc'),
            icon: DollarSign,
            color: 'text-stone-600 bg-stone-100 dark:bg-stone-800 dark:text-stone-300',
          },
        ].map((item) => (
          <Link key={item.href} href={item.href} className="h-full">
            {/* h-full on both so a card whose label wraps doesn't render taller
                than its siblings (the Link is the stretched grid item). */}
            <Card hover className="flex h-full items-center gap-4">
              <div
                className={`flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-xl ${item.color}`}
              >
                <item.icon className="h-6 w-6" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-stone-900 dark:text-white">{item.label}</p>
                <p className="text-xs text-stone-500 dark:text-stone-400 mt-0.5">
                  {item.description}
                </p>
              </div>
              <ArrowUpRight className="h-4 w-4 flex-shrink-0 text-stone-400" />
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}
