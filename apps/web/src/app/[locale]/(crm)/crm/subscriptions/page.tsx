'use client';

import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { CRMSubscriptionRecord } from '@flacroncv/shared-types';
import Card from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import {
  CreditCard,
  Search,
  Download,
  ChevronLeft,
  ChevronRight,
  XCircle,
  ExternalLink,
  Filter,
} from 'lucide-react';
import { toast } from 'sonner';
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

const STATUS_OPTIONS = ['', 'active', 'canceled', 'past_due', 'trialing', 'incomplete', 'unpaid'];
const PLAN_OPTIONS = ['', 'free', 'pro', 'enterprise'];

function formatAmount(amount: number, currency: string) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: currency.toUpperCase(),
    minimumFractionDigits: 2,
  }).format(amount / 100);
}

export default function CRMSubscriptionsPage(): React.JSX.Element {
  const qc = useQueryClient();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [planFilter, setPlanFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [cancelId, setCancelId] = useState<string | null>(null);

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

  const cancelMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/crm/subscriptions/${id}/cancel`),
    onSuccess: () => {
      toast.success('Subscription canceled via Stripe');
      setCancelId(null);
      qc.invalidateQueries({ queryKey: ['crm', 'subscriptions'] });
    },
    onError: () => toast.error('Failed to cancel subscription'),
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
          <h1 className="text-2xl font-bold text-stone-900 dark:text-white">Subscriptions</h1>
          <p className="mt-1 text-sm text-stone-500 dark:text-stone-400">
            {data?.total ?? 0} total subscription{data?.total !== 1 ? 's' : ''}
          </p>
        </div>
        <Button
          variant="ghost"
          size="sm"
          icon={<Download className="h-4 w-4" />}
          onClick={() => window.open('/api/v1/crm/subscriptions/export/csv')}
        >
          Export CSV
        </Button>
      </div>

      {/* Filters */}
      <Card className="p-4">
        <div className="flex flex-wrap gap-3">
          <div className="relative flex-1 min-w-48">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-stone-400" />
            <input
              type="text"
              placeholder="Search by email or name..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full rounded-lg border border-stone-200 bg-stone-50 py-2 pl-9 pr-3 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500 dark:border-stone-700 dark:bg-stone-900 dark:text-white"
            />
          </div>
          <div className="flex items-center gap-2">
            <Filter className="h-4 w-4 text-stone-400" />
            <select
              value={planFilter}
              onChange={(e) => { setPlanFilter(e.target.value); setPage(1); }}
              className="rounded-lg border border-stone-200 bg-stone-50 py-2 px-3 text-sm focus:border-brand-500 focus:outline-none dark:border-stone-700 dark:bg-stone-900 dark:text-white"
            >
              {PLAN_OPTIONS.map((p) => (
                <option key={p} value={p}>{p ? `Plan: ${p}` : 'All Plans'}</option>
              ))}
            </select>
            <select
              value={statusFilter}
              onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}
              className="rounded-lg border border-stone-200 bg-stone-50 py-2 px-3 text-sm focus:border-brand-500 focus:outline-none dark:border-stone-700 dark:bg-stone-900 dark:text-white"
            >
              {STATUS_OPTIONS.map((s) => (
                <option key={s} value={s}>{s ? `Status: ${s}` : 'All Statuses'}</option>
              ))}
            </select>
          </div>
        </div>
      </Card>

      {/* Table */}
      <Card className="overflow-hidden p-0">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-b border-stone-100 bg-stone-50 dark:border-stone-800 dark:bg-stone-900/50">
              <tr>
                {['User', 'Plan', 'Status', 'Amount', 'Interval', 'Period End', 'Cancel At End', 'Actions'].map((h) => (
                  <th
                    key={h}
                    className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-stone-500 dark:text-stone-400"
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
                      {Array.from({ length: 8 }).map((__, j) => (
                        <td key={j} className="px-4 py-3">
                          <div className="h-4 animate-pulse rounded bg-stone-200 dark:bg-stone-700" />
                        </td>
                      ))}
                    </tr>
                  ))
                : filtered.map((sub) => (
                    <tr
                      key={sub.id}
                      className="transition-colors hover:bg-stone-50 dark:hover:bg-stone-800/50"
                    >
                      <td className="px-4 py-3">
                        <div>
                          <p className="font-medium text-stone-900 dark:text-white">
                            {sub.userDisplayName || '—'}
                          </p>
                          <p className="text-xs text-stone-400">{sub.userEmail}</p>
                          <p className="font-mono text-[10px] text-stone-300 dark:text-stone-600">
                            {sub.id.slice(0, 20)}…
                          </p>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={cn(
                            'rounded-full px-2.5 py-0.5 text-xs font-semibold capitalize',
                            PLAN_COLORS[sub.plan] ?? PLAN_COLORS.free,
                          )}
                        >
                          {sub.plan}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={cn(
                            'rounded-full px-2.5 py-0.5 text-xs font-semibold capitalize',
                            STATUS_COLORS[sub.status] ??
                              'bg-stone-100 text-stone-600 dark:bg-stone-800 dark:text-stone-400',
                          )}
                        >
                          {sub.status.replace(/_/g, ' ')}
                        </span>
                      </td>
                      <td className="px-4 py-3 font-medium text-stone-900 dark:text-white">
                        {formatAmount(sub.amount, sub.currency)}
                      </td>
                      <td className="px-4 py-3 capitalize text-stone-600 dark:text-stone-400">
                        {sub.interval}ly
                      </td>
                      <td className="px-4 py-3 text-stone-600 dark:text-stone-400">
                        {new Date(sub.currentPeriodEnd).toLocaleDateString('en-GB', {
                          day: 'numeric',
                          month: 'short',
                          year: 'numeric',
                        })}
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={cn(
                            'rounded-full px-2 py-0.5 text-xs font-semibold',
                            sub.cancelAtPeriodEnd
                              ? 'bg-amber-50 text-amber-700 dark:bg-amber-950 dark:text-amber-300'
                              : 'bg-stone-100 text-stone-500 dark:bg-stone-800 dark:text-stone-400',
                          )}
                        >
                          {sub.cancelAtPeriodEnd ? 'Yes' : 'No'}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          {sub.stripeCustomerId && (
                            <a
                              href={`https://dashboard.stripe.com/customers/${sub.stripeCustomerId}`}
                              target="_blank"
                              rel="noreferrer"
                              className="text-stone-400 transition-colors hover:text-stone-700 dark:hover:text-stone-200"
                              title="View in Stripe"
                            >
                              <ExternalLink className="h-4 w-4" />
                            </a>
                          )}
                          {sub.status !== 'canceled' && (
                            <button
                              onClick={() => setCancelId(sub.id)}
                              className="text-red-400 transition-colors hover:text-red-600"
                              title="Cancel subscription"
                            >
                              <XCircle className="h-4 w-4" />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
            </tbody>
          </table>

          {!isLoading && filtered.length === 0 && (
            <div className="flex flex-col items-center justify-center py-16 text-stone-400">
              <CreditCard className="mb-3 h-10 w-10" />
              <p className="font-medium">No subscriptions found</p>
            </div>
          )}
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between border-t border-stone-100 px-4 py-3 dark:border-stone-800">
            <p className="text-xs text-stone-500 dark:text-stone-400">
              Page {page} of {totalPages} · {data?.total ?? 0} total
            </p>
            <div className="flex gap-1">
              <Button
                variant="ghost"
                size="sm"
                icon={<ChevronLeft className="h-4 w-4" />}
                disabled={page <= 1}
                onClick={() => setPage((p) => p - 1)}
              />
              <Button
                variant="ghost"
                size="sm"
                icon={<ChevronRight className="h-4 w-4" />}
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
          <Card className="w-full max-w-sm space-y-4">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-red-100 dark:bg-red-950">
                <XCircle className="h-5 w-5 text-red-600 dark:text-red-400" />
              </div>
              <div>
                <h3 className="font-semibold text-stone-900 dark:text-white">Cancel Subscription</h3>
                <p className="text-xs text-stone-500 dark:text-stone-400">
                  This will cancel the subscription in Stripe immediately. The user will be
                  downgraded to Free at the next webhook cycle.
                </p>
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="ghost" size="sm" onClick={() => setCancelId(null)}>
                Keep
              </Button>
              <Button
                variant="danger"
                size="sm"
                loading={cancelMutation.isPending}
                onClick={() => cancelMutation.mutate(cancelId)}
              >
                Cancel Subscription
              </Button>
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}
