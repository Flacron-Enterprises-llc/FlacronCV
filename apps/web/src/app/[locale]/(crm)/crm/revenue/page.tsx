'use client';
import React from 'react';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import {
  CRMTransaction,
  CRMTransactionStatus,
  CreateCRMTransactionDto,
} from '@flacroncv/shared-types';
import RevenueChart from '@/components/crm/RevenueChart';
import CRMStatCard from '@/components/crm/CRMStatCard';
import CRMStatusBadge from '@/components/crm/CRMStatusBadge';
import Card from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import {
  DollarSign,
  TrendingUp,
  BarChart3,
  Plus,
  Download,
  Search,
  ChevronLeft,
  ChevronRight,
  X,
  Receipt,
} from 'lucide-react';
import { format } from 'date-fns';
import { toast } from 'sonner';
import { CRMRevenueDataPoint } from '@flacroncv/shared-types';

interface ListResponse {
  items: CRMTransaction[];
  total: number;
  page: number;
  limit: number;
  pages: number;
}

export default function CRMRevenuePage(): React.JSX.Element | null {
  const queryClient = useQueryClient();

  const [page, setPage] = useState(1);
  const [status, setStatus] = useState<CRMTransactionStatus | ''>('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [showAddModal, setShowAddModal] = useState(false);
  const [newTx, setNewTx] = useState<Partial<CreateCRMTransactionDto>>({
    currency: 'USD',
    status: CRMTransactionStatus.COMPLETED,
  });

  const queryKey = ['crm', 'transactions', { page, status, startDate, endDate }];

  const { data, isLoading } = useQuery<ListResponse>({
    queryKey,
    queryFn: () =>
      api.get(
        `/crm/transactions?page=${page}&status=${status}&startDate=${startDate}&endDate=${endDate}`,
      ),
    staleTime: 30_000,
  });

  const { data: revenueChart, isLoading: loadingChart } = useQuery<CRMRevenueDataPoint[]>({
    queryKey: ['crm', 'analytics', 'revenue-chart'],
    queryFn: () => api.get('/crm/analytics/revenue-chart'),
    staleTime: 60_000,
  });

  // Compute totals from current list
  const completedItems = data?.items.filter((t) => t.status === CRMTransactionStatus.COMPLETED) ?? [];
  const totalShown = completedItems.reduce((s, t) => s + t.amount, 0);

  const createMutation = useMutation({
    mutationFn: (dto: CreateCRMTransactionDto) => api.post('/crm/transactions', dto),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['crm', 'transactions'] });
      queryClient.invalidateQueries({ queryKey: ['crm', 'analytics'] });
      setShowAddModal(false);
      setNewTx({ currency: 'USD', status: CRMTransactionStatus.COMPLETED });
      toast.success('Transaction added');
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/crm/transactions/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['crm', 'transactions'] });
      queryClient.invalidateQueries({ queryKey: ['crm', 'analytics'] });
      toast.success('Transaction deleted');
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const handleExport = () => {
    const params = new URLSearchParams();
    if (startDate) params.set('startDate', startDate);
    if (endDate) params.set('endDate', endDate);
    window.open(
      `${process.env.NEXT_PUBLIC_API_URL}/api/v1/crm/transactions/export/csv?${params}`,
      '_blank',
    );
  };

  const stats = [
    {
      label: 'Revenue (filtered)',
      value: totalShown,
      icon: DollarSign,
      color: 'text-emerald-600 bg-emerald-50 dark:bg-emerald-950 dark:text-emerald-400',
      prefix: '$',
    },
    {
      label: 'Transactions (page)',
      value: data?.total ?? 0,
      icon: BarChart3,
      color: 'text-brand-600 bg-brand-50 dark:bg-brand-950 dark:text-brand-400',
    },
    {
      label: 'Avg. Transaction',
      value: completedItems.length > 0 ? Math.round(totalShown / completedItems.length) : 0,
      icon: TrendingUp,
      color: 'text-violet-600 bg-violet-50 dark:bg-violet-950 dark:text-violet-400',
      prefix: '$',
    },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-stone-900 dark:text-white">Revenue</h1>
          <p className="mt-1 text-sm text-stone-500 dark:text-stone-400">
            Transaction history and revenue analysis
          </p>
        </div>
        <div className="flex gap-3">
          <Button variant="secondary" icon={<Download className="h-4 w-4" />} onClick={handleExport}>
            Export CSV
          </Button>
          <Button icon={<Plus className="h-4 w-4" />} onClick={() => setShowAddModal(true)}>
            Add Transaction
          </Button>
        </div>
      </div>

      {/* KPI Strip */}
      <div className="grid gap-4 sm:grid-cols-3">
        {stats.map((s) => (
          <CRMStatCard
            key={s.label}
            label={s.label}
            value={s.value}
            icon={s.icon}
            color={s.color}
            prefix={s.prefix}
          />
        ))}
      </div>

      {/* Revenue Chart */}
      <RevenueChart data={revenueChart ?? []} loading={loadingChart} />

      {/* Filters */}
      <Card padding="sm">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2 text-sm text-stone-600 dark:text-stone-400">
            <span>From</span>
            <input
              type="date"
              value={startDate}
              onChange={(e) => { setStartDate(e.target.value); setPage(1); }}
              className="rounded-lg border border-stone-200 px-3 py-1.5 text-sm focus:border-brand-500 focus:outline-none dark:border-stone-700 dark:bg-stone-800 dark:text-white"
            />
            <span>To</span>
            <input
              type="date"
              value={endDate}
              onChange={(e) => { setEndDate(e.target.value); setPage(1); }}
              className="rounded-lg border border-stone-200 px-3 py-1.5 text-sm focus:border-brand-500 focus:outline-none dark:border-stone-700 dark:bg-stone-800 dark:text-white"
            />
          </div>

          <select
            value={status}
            onChange={(e) => { setStatus(e.target.value as CRMTransactionStatus | ''); setPage(1); }}
            className="rounded-lg border border-stone-200 bg-white px-3 py-2 text-sm focus:border-brand-500 focus:outline-none dark:border-stone-700 dark:bg-stone-800 dark:text-white"
          >
            <option value="">All Statuses</option>
            {Object.values(CRMTransactionStatus).map((v) => (
              <option key={v} value={v} className="capitalize">{v}</option>
            ))}
          </select>

          {(startDate || endDate || status) && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => { setStartDate(''); setEndDate(''); setStatus(''); setPage(1); }}
            >
              <X className="h-4 w-4 mr-1" /> Clear
            </Button>
          )}
        </div>
      </Card>

      {/* Transactions Table */}
      <Card padding="none">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-stone-200 dark:border-stone-700 text-left text-xs font-semibold uppercase tracking-wide text-stone-500 dark:text-stone-400">
                <th className="px-4 py-3">Date</th>
                <th className="px-4 py-3">Customer</th>
                <th className="px-4 py-3">Description</th>
                <th className="px-4 py-3">Payment</th>
                <th className="px-4 py-3">Amount</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {isLoading
                ? [...Array(8)].map((_, i) => (
                    <tr key={i} className="border-b border-stone-100 dark:border-stone-800">
                      {[...Array(7)].map((_, j) => (
                        <td key={j} className="px-4 py-3">
                          <div className="h-4 animate-pulse rounded bg-stone-200 dark:bg-stone-700" />
                        </td>
                      ))}
                    </tr>
                  ))
                : data?.items.map((tx) => (
                    <tr
                      key={tx.id}
                      className="border-b border-stone-100 dark:border-stone-800 hover:bg-stone-50 dark:hover:bg-stone-800/50"
                    >
                      <td className="px-4 py-3 text-stone-600 dark:text-stone-400">
                        {format(new Date(tx.date), 'MMM d, yyyy')}
                      </td>
                      <td className="px-4 py-3 font-medium text-stone-900 dark:text-white">
                        {tx.customerName}
                      </td>
                      <td className="px-4 py-3 text-stone-600 dark:text-stone-300 max-w-xs truncate">
                        {tx.description ?? '—'}
                      </td>
                      <td className="px-4 py-3 capitalize text-stone-500 dark:text-stone-400">
                        {tx.paymentMethod ?? '—'}
                      </td>
                      <td className="px-4 py-3">
                        <span className="font-semibold text-stone-900 dark:text-white">
                          ${tx.amount.toLocaleString()}
                        </span>
                        <span className="ml-1 text-xs text-stone-400">{tx.currency}</span>
                      </td>
                      <td className="px-4 py-3">
                        <CRMStatusBadge value={tx.status} type="transaction" />
                      </td>
                      <td className="px-4 py-3 text-right">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => {
                            if (confirm('Delete this transaction?')) deleteMutation.mutate(tx.id);
                          }}
                        >
                          <X className="h-3.5 w-3.5 text-red-500" />
                        </Button>
                      </td>
                    </tr>
                  ))}
            </tbody>
          </table>

          {!isLoading && !data?.items.length && (
            <div className="flex flex-col items-center justify-center py-16 text-stone-500 dark:text-stone-400">
              <Receipt className="mb-3 h-10 w-10 opacity-30" />
              <p className="font-medium">No transactions found</p>
              <p className="text-sm">Adjust filters or add a new transaction.</p>
            </div>
          )}
        </div>

        {(data?.pages ?? 0) > 1 && (
          <div className="flex items-center justify-between border-t border-stone-200 px-4 py-3 dark:border-stone-700">
            <p className="text-sm text-stone-500 dark:text-stone-400">
              Page {data?.page} of {data?.pages} &middot; {data?.total} total
            </p>
            <div className="flex gap-2">
              <Button variant="secondary" size="sm" icon={<ChevronLeft className="h-4 w-4" />} disabled={page === 1} onClick={() => setPage((p) => p - 1)}>Prev</Button>
              <Button variant="secondary" size="sm" disabled={page >= (data?.pages ?? 1)} onClick={() => setPage((p) => p + 1)}>Next <ChevronRight className="h-4 w-4" /></Button>
            </div>
          </div>
        )}
      </Card>

      {/* Add Transaction Modal */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <Card className="w-full max-w-md">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-semibold text-stone-900 dark:text-white">Add Transaction</h2>
              <button onClick={() => setShowAddModal(false)} className="rounded-lg p-1 text-stone-400 hover:bg-stone-100 dark:hover:bg-stone-800">
                <X className="h-5 w-5" />
              </button>
            </div>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (!newTx.customerId || !newTx.customerName || !newTx.amount) {
                  toast.error('Customer ID, name, and amount are required');
                  return;
                }
                createMutation.mutate(newTx as CreateCRMTransactionDto);
              }}
              className="space-y-4"
            >
              {[
                { field: 'customerId', label: 'Customer ID *', type: 'text' },
                { field: 'customerName', label: 'Customer Name *', type: 'text' },
                { field: 'description', label: 'Description', type: 'text' },
                { field: 'paymentMethod', label: 'Payment Method', type: 'text' },
              ].map(({ field, label, type }) => (
                <div key={field}>
                  <label className="mb-1 block text-sm font-medium text-stone-700 dark:text-stone-300">{label}</label>
                  <input
                    type={type}
                    value={(newTx as any)[field] ?? ''}
                    onChange={(e) => setNewTx((p) => ({ ...p, [field]: e.target.value }))}
                    className="w-full rounded-lg border border-stone-200 bg-white px-3 py-2 text-sm focus:border-brand-500 focus:outline-none dark:border-stone-700 dark:bg-stone-800 dark:text-white"
                  />
                </div>
              ))}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block text-sm font-medium text-stone-700 dark:text-stone-300">Amount *</label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={newTx.amount ?? ''}
                    onChange={(e) => setNewTx((p) => ({ ...p, amount: parseFloat(e.target.value) }))}
                    className="w-full rounded-lg border border-stone-200 bg-white px-3 py-2 text-sm focus:border-brand-500 focus:outline-none dark:border-stone-700 dark:bg-stone-800 dark:text-white"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium text-stone-700 dark:text-stone-300">Currency</label>
                  <input
                    type="text"
                    value={newTx.currency ?? 'USD'}
                    onChange={(e) => setNewTx((p) => ({ ...p, currency: e.target.value }))}
                    className="w-full rounded-lg border border-stone-200 bg-white px-3 py-2 text-sm focus:border-brand-500 focus:outline-none dark:border-stone-700 dark:bg-stone-800 dark:text-white"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block text-sm font-medium text-stone-700 dark:text-stone-300">Status</label>
                  <select
                    value={newTx.status}
                    onChange={(e) => setNewTx((p) => ({ ...p, status: e.target.value as CRMTransactionStatus }))}
                    className="w-full rounded-lg border border-stone-200 bg-white px-3 py-2 text-sm focus:border-brand-500 focus:outline-none dark:border-stone-700 dark:bg-stone-800 dark:text-white"
                  >
                    {Object.values(CRMTransactionStatus).map((v) => (
                      <option key={v} value={v}>{v}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium text-stone-700 dark:text-stone-300">Date</label>
                  <input
                    type="date"
                    value={newTx.date ?? ''}
                    onChange={(e) => setNewTx((p) => ({ ...p, date: e.target.value }))}
                    className="w-full rounded-lg border border-stone-200 bg-white px-3 py-2 text-sm focus:border-brand-500 focus:outline-none dark:border-stone-700 dark:bg-stone-800 dark:text-white"
                  />
                </div>
              </div>
              <div className="flex justify-end gap-3 pt-2">
                <Button type="button" variant="secondary" onClick={() => setShowAddModal(false)}>Cancel</Button>
                <Button type="submit" loading={createMutation.isPending}>Add Transaction</Button>
              </div>
            </form>
          </Card>
        </div>
      )}
    </div>
  );
}
