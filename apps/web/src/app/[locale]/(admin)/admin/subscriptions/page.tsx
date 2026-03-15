'use client';

import React from 'react';

import { useTranslations } from 'next-intl';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import Card from '@/components/ui/Card';
import Badge from '@/components/ui/Badge';
import { formatDate } from '@/lib/utils';
import {
  CreditCard,
  Loader2,
  AlertCircle,
  Users,
  Crown,
  Building,
} from 'lucide-react';

interface Subscription {
  id: string;
  userId: string;
  userName: string;
  userEmail: string;
  plan: string;
  status: string;
  amount: number;
  currency: string;
  interval: string;
  currentPeriodStart: string;
  currentPeriodEnd: string;
  createdAt: string;
}

interface SubscriptionsResponse {
  subscriptions: Subscription[];
  stats: {
    free: number;
    pro: number;
    enterprise: number;
    totalActive: number;
  };
}

export default function AdminSubscriptionsPage(): React.JSX.Element {
  const t = useTranslations('admin');

  const { data, isLoading, error } = useQuery<SubscriptionsResponse>({
    queryKey: ['admin', 'subscriptions'],
    queryFn: () => api.get('/admin/subscriptions'),
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

  const planStats = [
    {
      label: t('free_plan'),
      value: data?.stats?.free ?? 0,
      icon: Users,
      color: 'text-stone-600 bg-stone-100 dark:bg-stone-800 dark:text-stone-400',
    },
    {
      label: t('pro_plan'),
      value: data?.stats?.pro ?? 0,
      icon: Crown,
      color: 'text-brand-600 bg-brand-50 dark:bg-brand-950 dark:text-brand-400',
    },
    {
      label: t('enterprise_plan'),
      value: data?.stats?.enterprise ?? 0,
      icon: Building,
      color: 'text-violet-600 bg-violet-50 dark:bg-violet-950 dark:text-violet-400',
    },
    {
      label: t('total_active'),
      value: data?.stats?.totalActive ?? 0,
      icon: CreditCard,
      color: 'text-emerald-600 bg-emerald-50 dark:bg-emerald-950 dark:text-emerald-400',
    },
  ];

  const statusVariant = (status: string) => {
    switch (status) {
      case 'active':
        return 'success' as const;
      case 'canceled':
        return 'danger' as const;
      case 'past_due':
        return 'warning' as const;
      case 'trialing':
        return 'info' as const;
      default:
        return 'default' as const;
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-stone-900 dark:text-white">
          {t('subscriptions')}
        </h1>
        <p className="mt-1 text-sm text-stone-600 dark:text-stone-400">
          {t('subscriptions_description')}
        </p>
      </div>

      {/* Plan Stats */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {planStats.map((stat) => (
          <Card key={stat.label}>
            <div className="flex items-center gap-4">
              <div
                className={`flex h-12 w-12 items-center justify-center rounded-xl ${stat.color}`}
              >
                <stat.icon className="h-6 w-6" />
              </div>
              <div>
                <p className="text-sm text-stone-600 dark:text-stone-400">{stat.label}</p>
                <p className="text-2xl font-bold text-stone-900 dark:text-white">
                  {stat.value}
                </p>
              </div>
            </div>
          </Card>
        ))}
      </div>

      {/* Subscriptions Table */}
      <Card padding="none">
        <div className="border-b border-stone-200 px-6 py-4 dark:border-stone-700">
          <h2 className="text-lg font-semibold text-stone-900 dark:text-white">
            {t('all_subscriptions')}
          </h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-stone-200 dark:border-stone-700">
                <th className="px-6 py-3 text-start text-xs font-medium uppercase tracking-wider text-stone-500 dark:text-stone-400">
                  {t('user')}
                </th>
                <th className="px-6 py-3 text-start text-xs font-medium uppercase tracking-wider text-stone-500 dark:text-stone-400">
                  {t('plan')}
                </th>
                <th className="px-6 py-3 text-start text-xs font-medium uppercase tracking-wider text-stone-500 dark:text-stone-400">
                  {t('status')}
                </th>
                <th className="px-6 py-3 text-start text-xs font-medium uppercase tracking-wider text-stone-500 dark:text-stone-400">
                  {t('amount')}
                </th>
                <th className="px-6 py-3 text-start text-xs font-medium uppercase tracking-wider text-stone-500 dark:text-stone-400">
                  {t('period')}
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-100 dark:divide-stone-700">
              {data?.subscriptions?.map((sub) => (
                <tr
                  key={sub.id}
                  className="hover:bg-stone-50 dark:hover:bg-stone-800/50"
                >
                  <td className="whitespace-nowrap px-6 py-4">
                    <div>
                      <p className="text-sm font-medium text-stone-900 dark:text-white">
                        {sub.userName}
                      </p>
                      <p className="text-xs text-stone-500 dark:text-stone-400">
                        {sub.userEmail}
                      </p>
                    </div>
                  </td>
                  <td className="whitespace-nowrap px-6 py-4">
                    <Badge
                      variant={
                        sub.plan === 'enterprise'
                          ? 'info'
                          : sub.plan === 'pro'
                            ? 'brand'
                            : 'default'
                      }
                    >
                      {sub.plan.toUpperCase()}
                    </Badge>
                  </td>
                  <td className="whitespace-nowrap px-6 py-4">
                    <Badge variant={statusVariant(sub.status)}>{sub.status}</Badge>
                  </td>
                  <td className="whitespace-nowrap px-6 py-4 text-sm text-stone-900 dark:text-white">
                    {sub.amount > 0
                      ? `$${sub.amount.toFixed(2)}/${sub.interval}`
                      : t('free')}
                  </td>
                  <td className="whitespace-nowrap px-6 py-4 text-sm text-stone-600 dark:text-stone-400">
                    {sub.currentPeriodStart && sub.currentPeriodEnd
                      ? `${formatDate(sub.currentPeriodStart)} - ${formatDate(sub.currentPeriodEnd)}`
                      : '-'}
                  </td>
                </tr>
              ))}
              {(!data?.subscriptions || data.subscriptions.length === 0) && (
                <tr>
                  <td
                    colSpan={5}
                    className="px-6 py-8 text-center text-sm text-stone-500 dark:text-stone-400"
                  >
                    {t('no_subscriptions_found')}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
