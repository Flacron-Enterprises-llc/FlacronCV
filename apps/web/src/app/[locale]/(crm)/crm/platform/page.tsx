'use client';

import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import {
  PlatformAnalyticsOverview,
  PlatformUserGrowthDataPoint,
  PlatformUsageDataPoint,
  PlatformTopTemplate,
} from '@flacroncv/shared-types';
import CRMStatCard from '@/components/crm/CRMStatCard';
import {
  Users,
  FileText,
  Briefcase,
  TrendingUp,
  UserPlus,
  Bot,
  Crown,
  Shield,
  BarChart3,
} from 'lucide-react';
import Card from '@/components/ui/Card';
import {
  AreaChart,
  Area,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';

const BRAND = '#f97316';
const BRAND_DARK = '#c2410c';
const VIOLET = '#8b5cf6';

export default function CRMPlatformPage(): React.JSX.Element {
  const { data: overview, isLoading: loadingOverview } = useQuery<PlatformAnalyticsOverview>({
    queryKey: ['crm', 'platform', 'overview'],
    queryFn: () => api.get('/crm/platform/overview'),
    staleTime: 60_000,
  });

  const { data: userGrowth, isLoading: loadingGrowth } = useQuery<PlatformUserGrowthDataPoint[]>({
    queryKey: ['crm', 'platform', 'user-growth'],
    queryFn: () => api.get('/crm/platform/user-growth'),
    staleTime: 60_000,
  });

  const { data: usageChart, isLoading: loadingUsage } = useQuery<PlatformUsageDataPoint[]>({
    queryKey: ['crm', 'platform', 'usage-chart'],
    queryFn: () => api.get('/crm/platform/usage-chart'),
    staleTime: 60_000,
  });

  const { data: topTemplates, isLoading: loadingTemplates } = useQuery<PlatformTopTemplate[]>({
    queryKey: ['crm', 'platform', 'top-templates'],
    queryFn: () => api.get('/crm/platform/top-templates'),
    staleTime: 60_000,
  });

  const topStats = [
    {
      label: 'Total Users',
      value: overview?.totalUsers ?? 0,
      icon: Users,
      color: 'text-brand-600 bg-brand-50 dark:bg-brand-950 dark:text-brand-400',
      change: overview?.thisMonthVsLastMonth.users,
    },
    {
      label: 'Active Users',
      value: overview?.activeUsers ?? 0,
      icon: TrendingUp,
      color: 'text-emerald-600 bg-emerald-50 dark:bg-emerald-950 dark:text-emerald-400',
    },
    {
      label: 'New This Month',
      value: overview?.newUsersThisMonth ?? 0,
      icon: UserPlus,
      color: 'text-violet-600 bg-violet-50 dark:bg-violet-950 dark:text-violet-400',
    },
    {
      label: 'Total CVs',
      value: overview?.totalCVs ?? 0,
      icon: FileText,
      color: 'text-blue-600 bg-blue-50 dark:bg-blue-950 dark:text-blue-400',
      change: overview?.thisMonthVsLastMonth.cvs,
    },
    {
      label: 'CVs This Month',
      value: overview?.cvsThisMonth ?? 0,
      icon: FileText,
      color: 'text-brand-600 bg-brand-50 dark:bg-brand-950 dark:text-brand-400',
    },
    {
      label: 'Total Cover Letters',
      value: overview?.totalCoverLetters ?? 0,
      icon: Briefcase,
      color: 'text-amber-600 bg-amber-50 dark:bg-amber-950 dark:text-amber-400',
      change: overview?.thisMonthVsLastMonth.coverLetters,
    },
    {
      label: 'Avg CVs / User',
      value: overview?.avgCVsPerUser ?? 0,
      icon: Bot,
      color: 'text-stone-600 bg-stone-100 dark:bg-stone-800 dark:text-stone-400',
    },
    {
      label: 'Avg Cover Letters / User',
      value: overview?.avgCoverLettersPerUser ?? 0,
      icon: BarChart3,
      color: 'text-stone-600 bg-stone-100 dark:bg-stone-800 dark:text-stone-400',
    },
  ];

  const planBreakdown = [
    { label: 'Free', count: overview?.usersByPlan.free ?? 0, color: 'bg-stone-400 dark:bg-stone-500', textColor: 'text-stone-600 dark:text-stone-400', icon: Users },
    { label: 'Pro', count: overview?.usersByPlan.pro ?? 0, color: 'bg-brand-500', textColor: 'text-brand-600 dark:text-brand-400', icon: Shield },
    { label: 'Enterprise', count: overview?.usersByPlan.enterprise ?? 0, color: 'bg-violet-500', textColor: 'text-violet-600 dark:text-violet-400', icon: Crown },
  ];

  const totalPlanUsers = planBreakdown.reduce((s, p) => s + p.count, 0);

  return (
    <div className="space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-stone-900 dark:text-white">Platform Analytics</h1>
        <p className="mt-1 text-sm text-stone-500 dark:text-stone-400">
          Real-time metrics across all registered users, CVs, and feature usage.
        </p>
      </div>

      {/* KPI grid */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {topStats.map((s) => (
          <CRMStatCard
            key={s.label}
            label={s.label}
            value={s.value}
            icon={s.icon}
            color={s.color}
            change={'change' in s ? s.change : undefined}
            loading={loadingOverview}
          />
        ))}
      </div>

      {/* Plan breakdown */}
      <Card>
        <h2 className="mb-4 text-sm font-semibold uppercase tracking-wider text-stone-500 dark:text-stone-400">Users by Plan</h2>
        {loadingOverview ? (
          <div className="h-6 w-full animate-pulse rounded bg-stone-200 dark:bg-stone-700" />
        ) : (
          <div className="space-y-3">
            <div className="flex h-4 w-full overflow-hidden rounded-full">
              {planBreakdown.map((p) => (
                <div
                  key={p.label}
                  className={p.color}
                  style={{ width: totalPlanUsers ? `${(p.count / totalPlanUsers) * 100}%` : '0%' }}
                />
              ))}
            </div>
            <div className="flex flex-wrap gap-6">
              {planBreakdown.map((p) => (
                <div key={p.label} className="flex items-center gap-2">
                  <div className={`h-3 w-3 flex-shrink-0 rounded-full ${p.color}`} />
                  <span className="text-sm text-stone-600 dark:text-stone-400">{p.label}</span>
                  <span className={`text-sm font-bold ${p.textColor}`}>{p.count.toLocaleString()}</span>
                  <span className="text-xs text-stone-400">
                    ({totalPlanUsers ? Math.round((p.count / totalPlanUsers) * 100) : 0}%)
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </Card>

      {/* Charts */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* User Growth */}
        <Card>
          <h2 className="mb-5 text-sm font-semibold text-stone-700 dark:text-stone-300">User Growth (12 months)</h2>
          {loadingGrowth ? (
            <div className="h-52 animate-pulse rounded bg-stone-100 dark:bg-stone-800" />
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <AreaChart data={userGrowth ?? []} margin={{ top: 4, right: 4, bottom: 0, left: -20 }}>
                <defs>
                  <linearGradient id="ugFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor={BRAND} stopOpacity={0.2} />
                    <stop offset="95%" stopColor={BRAND} stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(120,113,108,0.15)" />
                <XAxis dataKey="month" tick={{ fontSize: 11, fill: '#a8a29e' }} />
                <YAxis tick={{ fontSize: 11, fill: '#a8a29e' }} />
                <Tooltip
                  contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid #e7e5e4', background: '#fff' }}
                  formatter={(v: number) => [v, 'New Users']}
                />
                <Area type="monotone" dataKey="users" stroke={BRAND} strokeWidth={2} fill="url(#ugFill)" name="New Users" />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </Card>

        {/* CV / Cover Letter Usage */}
        <Card>
          <h2 className="mb-5 text-sm font-semibold text-stone-700 dark:text-stone-300">Content Created (12 months)</h2>
          {loadingUsage ? (
            <div className="h-52 animate-pulse rounded bg-stone-100 dark:bg-stone-800" />
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={usageChart ?? []} margin={{ top: 4, right: 4, bottom: 0, left: -20 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(120,113,108,0.15)" />
                <XAxis dataKey="month" tick={{ fontSize: 11, fill: '#a8a29e' }} />
                <YAxis tick={{ fontSize: 11, fill: '#a8a29e' }} />
                <Tooltip
                  contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid #e7e5e4', background: '#fff' }}
                />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Bar dataKey="cvs" fill={BRAND} name="CVs" radius={[3, 3, 0, 0]} />
                <Bar dataKey="coverLetters" fill={VIOLET} name="Cover Letters" radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </Card>
      </div>

      {/* Top Templates */}
      <Card>
        <h2 className="mb-4 text-sm font-semibold uppercase tracking-wider text-stone-500 dark:text-stone-400">
          Top Templates by Usage
        </h2>
        {loadingTemplates ? (
          <div className="space-y-2">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="h-8 animate-pulse rounded bg-stone-100 dark:bg-stone-800" />
            ))}
          </div>
        ) : (topTemplates ?? []).length === 0 ? (
          <p className="text-sm text-stone-400">No template usage data yet.</p>
        ) : (
          <div className="divide-y divide-stone-100 dark:divide-stone-800">
            {(topTemplates ?? []).map((t, idx) => {
              const maxCount = topTemplates?.[0]?.usageCount ?? 1;
              const pct = Math.round((t.usageCount / maxCount) * 100);
              return (
                <div key={t.templateId} className="flex items-center gap-4 py-2.5">
                  <span className="w-5 flex-shrink-0 text-right text-sm font-bold text-stone-400">#{idx + 1}</span>
                  <div className="flex-1">
                    <div className="mb-1 flex items-center justify-between">
                      <span className="text-sm font-medium capitalize text-stone-800 dark:text-stone-200">{t.name}</span>
                      <span className="text-xs font-semibold text-stone-600 dark:text-stone-400">{t.usageCount.toLocaleString()} uses</span>
                    </div>
                    <div className="h-1.5 w-full overflow-hidden rounded-full bg-stone-100 dark:bg-stone-800">
                      <div className="h-full rounded-full bg-brand-500" style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Card>
    </div>
  );
}
