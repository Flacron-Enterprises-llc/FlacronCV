'use client';
import React from 'react';

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
} from 'lucide-react';
import Card from '@/components/ui/Card';
import Button from '@/components/ui/Button';

export default function CRMDashboardPage(): React.JSX.Element | null {
  const { data: overview, isLoading: loadingOverview } = useQuery<CRMAnalyticsOverview>({
    queryKey: ['crm', 'analytics', 'overview'],
    queryFn: () => api.get('/crm/analytics/overview'),
    staleTime: 60_000,
  });

  const { data: revenueChart, isLoading: loadingRevenue } = useQuery<CRMRevenueDataPoint[]>({
    queryKey: ['crm', 'analytics', 'revenue-chart'],
    queryFn: () => api.get('/crm/analytics/revenue-chart'),
    staleTime: 60_000,
  });

  const { data: growthChart, isLoading: loadingGrowth } = useQuery<CRMCustomerGrowthDataPoint[]>({
    queryKey: ['crm', 'analytics', 'customer-growth'],
    queryFn: () => api.get('/crm/analytics/customer-growth'),
    staleTime: 60_000,
  });

  const stats = [
    {
      label: 'Total Customers',
      value: overview?.totalCustomers ?? 0,
      icon: Users,
      color: 'text-brand-600 bg-brand-50 dark:bg-brand-950 dark:text-brand-400',
      change: overview?.thisMonthVsLastMonth.customers,
    },
    {
      label: 'Total Revenue',
      value: overview?.totalRevenue ?? 0,
      icon: DollarSign,
      color: 'text-emerald-600 bg-emerald-50 dark:bg-emerald-950 dark:text-emerald-400',
      prefix: '$',
      change: overview?.thisMonthVsLastMonth.revenue,
    },
    {
      label: 'Monthly Revenue',
      value: overview?.monthlyRevenue ?? 0,
      icon: TrendingUp,
      color: 'text-violet-600 bg-violet-50 dark:bg-violet-950 dark:text-violet-400',
      prefix: '$',
    },
    {
      label: 'Active Customers',
      value: overview?.activeCustomers ?? 0,
      icon: Activity,
      color: 'text-blue-600 bg-blue-50 dark:bg-blue-950 dark:text-blue-400',
    },
    {
      label: 'New This Month',
      value: overview?.newCustomersThisMonth ?? 0,
      icon: UserPlus,
      color: 'text-amber-600 bg-amber-50 dark:bg-amber-950 dark:text-amber-400',
    },
    {
      label: 'Total Leads',
      value: overview?.totalLeads ?? 0,
      icon: BarChart3,
      color: 'text-stone-600 bg-stone-100 dark:bg-stone-800 dark:text-stone-400',
      change: overview?.thisMonthVsLastMonth.leads,
    },
    {
      label: 'Conversion Rate',
      value: `${overview?.conversionRate ?? 0}%`,
      icon: Target,
      color: 'text-brand-600 bg-brand-50 dark:bg-brand-950 dark:text-brand-400',
    },
    {
      label: 'Avg. Revenue / Customer',
      value: overview?.avgRevenuePerCustomer ?? 0,
      icon: DollarSign,
      color: 'text-emerald-600 bg-emerald-50 dark:bg-emerald-950 dark:text-emerald-400',
      prefix: '$',
    },
  ];

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-stone-900 dark:text-white">CRM Dashboard</h1>
          <p className="mt-1 text-sm text-stone-500 dark:text-stone-400">
            Customer relationships, revenue, and growth at a glance.
          </p>
        </div>

        <div className="flex gap-3">
          <Link href="/crm/leads">
            <Button variant="secondary" icon={<BarChart3 className="h-4 w-4" />}>
              Manage Leads
            </Button>
          </Link>
          <Link href="/crm/customers">
            <Button icon={<Users className="h-4 w-4" />}>
              View Customers
            </Button>
          </Link>
        </div>
      </div>

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
            label: 'Customer Management',
            description: 'Search, filter, and manage all customers',
            icon: Users,
            color: 'text-brand-600 bg-brand-50 dark:bg-brand-950 dark:text-brand-400',
          },
          {
            href: '/crm/leads',
            label: 'Lead Pipeline',
            description: 'Track and convert leads through stages',
            icon: Target,
            color: 'text-amber-600 bg-amber-50 dark:bg-amber-950 dark:text-amber-400',
          },
          {
            href: '/crm/revenue',
            label: 'Revenue & Transactions',
            description: 'Revenue tracking, CSV export, date filtering',
            icon: DollarSign,
            color: 'text-emerald-600 bg-emerald-50 dark:bg-emerald-950 dark:text-emerald-400',
          },
        ].map((item) => (
          <Link key={item.href} href={item.href}>
            <Card hover className="flex items-center gap-4">
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
