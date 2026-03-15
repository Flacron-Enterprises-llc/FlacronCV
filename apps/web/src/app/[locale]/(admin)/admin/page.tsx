'use client';

import React from 'react';

import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/routing';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import Card from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import Badge from '@/components/ui/Badge';
import { formatDate } from '@/lib/utils';
import {
  Users,
  CreditCard,
  DollarSign,
  MessageSquare,
  ArrowRight,
  Loader2,
  AlertCircle,
} from 'lucide-react';

interface AdminStats {
  totalUsers: number;
  activeSubscriptions: number;
  revenue: number;
  openTickets: number;
  recentUsers: Array<{
    id: string;
    displayName: string;
    email: string;
    role: string;
    createdAt: string;
  }>;
}

export default function AdminDashboardPage(): React.JSX.Element | null {
  const t = useTranslations('admin');

  const {
    data: stats,
    isLoading,
    error,
  } = useQuery<AdminStats>({
    queryKey: ['admin', 'stats'],
    queryFn: () => api.get('/admin/stats'),
  });

  if (isLoading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-brand-600" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex h-64 flex-col items-center justify-center gap-2 text-stone-500">
        <AlertCircle className="h-8 w-8" />
        <p>{t('error_loading')}</p>
      </div>
    );
  }

  const statCards = [
    {
      label: t('total_users'),
      value: stats?.totalUsers ?? 0,
      icon: Users,
      color: 'text-brand-600 bg-brand-50 dark:bg-brand-950 dark:text-brand-400',
    },
    {
      label: t('active_subscriptions'),
      value: stats?.activeSubscriptions ?? 0,
      icon: CreditCard,
      color: 'text-emerald-600 bg-emerald-50 dark:bg-emerald-950 dark:text-emerald-400',
    },
    {
      label: t('revenue'),
      value: `$${(stats?.revenue ?? 0).toLocaleString()}`,
      icon: DollarSign,
      color: 'text-violet-600 bg-violet-50 dark:bg-violet-950 dark:text-violet-400',
    },
    {
      label: t('open_tickets'),
      value: stats?.openTickets ?? 0,
      icon: MessageSquare,
      color: 'text-amber-600 bg-amber-50 dark:bg-amber-950 dark:text-amber-400',
    },
  ];

  return (
    <div className="space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-stone-900 dark:text-white">
          {t('admin_dashboard')}
        </h1>
        <p className="mt-1 text-sm text-stone-600 dark:text-stone-400">
          {t('admin_dashboard_description')}
        </p>
      </div>

      {/* Stats Cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {statCards.map((stat) => (
          <Card key={stat.label}>
            <div className="flex items-center gap-4">
              <div
                className={`flex h-12 w-12 items-center justify-center rounded-xl ${stat.color}`}
              >
                <stat.icon className="h-6 w-6" />
              </div>
              <div>
                <p className="text-sm text-stone-600 dark:text-stone-400">{stat.label}</p>
                <p className="text-2xl font-bold text-stone-900 dark:text-white">{stat.value}</p>
              </div>
            </div>
          </Card>
        ))}
      </div>

      {/* Revenue Chart Placeholder */}
      <Card>
        <h2 className="mb-4 text-lg font-semibold text-stone-900 dark:text-white">
          {t('revenue_overview')}
        </h2>
        <div className="flex h-64 items-center justify-center rounded-lg border-2 border-dashed border-stone-200 bg-stone-50 dark:border-stone-700 dark:bg-stone-800/50">
          <div className="text-center">
            <DollarSign className="mx-auto h-10 w-10 text-stone-400" />
            <p className="mt-2 text-sm text-stone-500 dark:text-stone-400">
              {t('revenue_chart_placeholder')}
            </p>
          </div>
        </div>
      </Card>

      {/* Recent Users & Quick Actions */}
      <div className="grid gap-6 lg:grid-cols-3">
        {/* Recent Users */}
        <div className="lg:col-span-2">
          <Card padding="none">
            <div className="flex items-center justify-between border-b border-stone-200 px-6 py-4 dark:border-stone-700">
              <h2 className="text-lg font-semibold text-stone-900 dark:text-white">
                {t('recent_users')}
              </h2>
              <Link href="/admin/users">
                <Button variant="ghost" size="sm">
                  {t('view_all')}
                  <ArrowRight className="ms-1 h-4 w-4" />
                </Button>
              </Link>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-stone-100 dark:border-stone-700">
                    <th className="px-6 py-3 text-start text-xs font-medium uppercase tracking-wider text-stone-500 dark:text-stone-400">
                      {t('name')}
                    </th>
                    <th className="px-6 py-3 text-start text-xs font-medium uppercase tracking-wider text-stone-500 dark:text-stone-400">
                      {t('email')}
                    </th>
                    <th className="px-6 py-3 text-start text-xs font-medium uppercase tracking-wider text-stone-500 dark:text-stone-400">
                      {t('role')}
                    </th>
                    <th className="px-6 py-3 text-start text-xs font-medium uppercase tracking-wider text-stone-500 dark:text-stone-400">
                      {t('joined')}
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-stone-100 dark:divide-stone-700">
                  {stats?.recentUsers?.map((u) => (
                    <tr
                      key={u.id}
                      className="hover:bg-stone-50 dark:hover:bg-stone-800/50"
                    >
                      <td className="whitespace-nowrap px-6 py-4 text-sm font-medium text-stone-900 dark:text-white">
                        {u.displayName}
                      </td>
                      <td className="whitespace-nowrap px-6 py-4 text-sm text-stone-600 dark:text-stone-400">
                        {u.email}
                      </td>
                      <td className="whitespace-nowrap px-6 py-4">
                        <Badge variant={u.role === 'admin' ? 'brand' : 'default'}>
                          {u.role}
                        </Badge>
                      </td>
                      <td className="whitespace-nowrap px-6 py-4 text-sm text-stone-600 dark:text-stone-400">
                        {formatDate(u.createdAt)}
                      </td>
                    </tr>
                  ))}
                  {(!stats?.recentUsers || stats.recentUsers.length === 0) && (
                    <tr>
                      <td
                        colSpan={4}
                        className="px-6 py-8 text-center text-sm text-stone-500 dark:text-stone-400"
                      >
                        {t('no_users_found')}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </Card>
        </div>

        {/* Quick Actions */}
        <div>
          <Card>
            <h2 className="mb-4 text-lg font-semibold text-stone-900 dark:text-white">
              {t('quick_actions')}
            </h2>
            <div className="space-y-3">
              <Link href="/admin/users" className="block">
                <div className="flex items-center gap-3 rounded-lg border border-stone-200 p-3 transition-colors hover:bg-stone-50 dark:border-stone-700 dark:hover:bg-stone-800/50">
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-brand-50 text-brand-600 dark:bg-brand-950 dark:text-brand-400">
                    <Users className="h-5 w-5" />
                  </div>
                  <div className="flex-1">
                    <p className="text-sm font-medium text-stone-900 dark:text-white">
                      {t('manage_users')}
                    </p>
                    <p className="text-xs text-stone-500 dark:text-stone-400">
                      {t('manage_users_description')}
                    </p>
                  </div>
                  <ArrowRight className="h-4 w-4 text-stone-400" />
                </div>
              </Link>

              <Link href="/admin/tickets" className="block">
                <div className="flex items-center gap-3 rounded-lg border border-stone-200 p-3 transition-colors hover:bg-stone-50 dark:border-stone-700 dark:hover:bg-stone-800/50">
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-amber-50 text-amber-600 dark:bg-amber-950 dark:text-amber-400">
                    <MessageSquare className="h-5 w-5" />
                  </div>
                  <div className="flex-1">
                    <p className="text-sm font-medium text-stone-900 dark:text-white">
                      {t('view_tickets')}
                    </p>
                    <p className="text-xs text-stone-500 dark:text-stone-400">
                      {t('view_tickets_description')}
                    </p>
                  </div>
                  <ArrowRight className="h-4 w-4 text-stone-400" />
                </div>
              </Link>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
