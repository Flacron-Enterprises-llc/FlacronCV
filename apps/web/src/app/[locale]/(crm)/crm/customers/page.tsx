'use client';
import React from 'react';

import { useState, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useRouter } from '@/i18n/routing';
import { api } from '@/lib/api';
import {
  CRMCustomer,
  CRMCustomerStatus,
  CRMCustomerSource,
} from '@flacroncv/shared-types';
import CRMStatusBadge from '@/components/crm/CRMStatusBadge';
import Card from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import {
  Plus,
  Search,
  Download,
  ChevronLeft,
  ChevronRight,
  ArrowUpDown,
  UserPlus,
  X,
} from 'lucide-react';
import { format } from 'date-fns';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

interface ListResponse {
  items: CRMCustomer[];
  total: number;
  page: number;
  limit: number;
  pages: number;
}

const STATUS_OPTIONS = [
  { value: '', label: 'All Statuses' },
  { value: CRMCustomerStatus.ACTIVE, label: 'Active' },
  { value: CRMCustomerStatus.INACTIVE, label: 'Inactive' },
  { value: CRMCustomerStatus.LEAD, label: 'Lead' },
];

const SORT_OPTIONS = [
  { value: 'createdAt', label: 'Signup Date' },
  { value: 'name', label: 'Name' },
  { value: 'totalRevenue', label: 'Revenue' },
  { value: 'lastActivity', label: 'Last Activity' },
];

export default function CRMCustomersPage(): React.JSX.Element | null {
  const router = useRouter();
  const queryClient = useQueryClient();

  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<CRMCustomerStatus | ''>('');
  const [sortBy, setSortBy] = useState<'createdAt' | 'name' | 'totalRevenue' | 'lastActivity'>('createdAt');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
  const [page, setPage] = useState(1);
  const [showAddModal, setShowAddModal] = useState(false);
  const [newCustomer, setNewCustomer] = useState({
    name: '',
    email: '',
    phone: '',
    company: '',
    source: CRMCustomerSource.MANUAL,
    status: CRMCustomerStatus.ACTIVE,
  });

  const queryKey = ['crm', 'customers', { search, status, sortBy, sortOrder, page }];

  const { data, isLoading } = useQuery<ListResponse>({
    queryKey,
    queryFn: () =>
      api.get(
        `/crm/customers?page=${page}&search=${search}&status=${status}&sortBy=${sortBy}&sortOrder=${sortOrder}`,
      ),
    staleTime: 30_000,
  });

  const createMutation = useMutation({
    mutationFn: (dto: typeof newCustomer) => api.post('/crm/customers', dto),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['crm', 'customers'] });
      queryClient.invalidateQueries({ queryKey: ['crm', 'analytics'] });
      setShowAddModal(false);
      setNewCustomer({ name: '', email: '', phone: '', company: '', source: CRMCustomerSource.MANUAL, status: CRMCustomerStatus.ACTIVE });
      toast.success('Customer added successfully');
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const handleSort = (field: typeof sortBy) => {
    if (field === sortBy) {
      setSortOrder((prev) => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortBy(field);
      setSortOrder('desc');
    }
    setPage(1);
  };

  const handleExport = useCallback(() => {
    window.open(
      `${process.env.NEXT_PUBLIC_API_URL}/api/v1/crm/customers/export/csv`,
      '_blank',
    );
  }, []);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-stone-900 dark:text-white">Customers</h1>
          <p className="mt-1 text-sm text-stone-500 dark:text-stone-400">
            {data?.total ?? 0} total customers
          </p>
        </div>
        <div className="flex gap-3">
          <Button
            variant="secondary"
            icon={<Download className="h-4 w-4" />}
            onClick={handleExport}
          >
            Export CSV
          </Button>
          <Button
            icon={<Plus className="h-4 w-4" />}
            onClick={() => setShowAddModal(true)}
          >
            Add Customer
          </Button>
        </div>
      </div>

      {/* Filters */}
      <Card padding="sm">
        <div className="flex flex-wrap gap-3">
          {/* Search */}
          <div className="relative flex-1 min-w-48">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-stone-400" />
            <input
              type="text"
              placeholder="Search by name, email, or company..."
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(1); }}
              className="w-full rounded-lg border border-stone-200 bg-white py-2 pl-9 pr-4 text-sm text-stone-900 placeholder-stone-400 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500 dark:border-stone-700 dark:bg-stone-800 dark:text-white dark:placeholder-stone-500"
            />
          </div>

          {/* Status filter */}
          <select
            value={status}
            onChange={(e) => { setStatus(e.target.value as CRMCustomerStatus | ''); setPage(1); }}
            className="rounded-lg border border-stone-200 bg-white px-3 py-2 text-sm text-stone-900 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500 dark:border-stone-700 dark:bg-stone-800 dark:text-white"
          >
            {STATUS_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>

          {/* Sort */}
          <select
            value={sortBy}
            onChange={(e) => handleSort(e.target.value as typeof sortBy)}
            className="rounded-lg border border-stone-200 bg-white px-3 py-2 text-sm text-stone-900 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500 dark:border-stone-700 dark:bg-stone-800 dark:text-white"
          >
            {SORT_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>Sort: {o.label}</option>
            ))}
          </select>
        </div>
      </Card>

      {/* Table */}
      <Card padding="none">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-stone-200 dark:border-stone-700">
                {[
                  { label: 'Customer', field: 'name' },
                  { label: 'Company', field: null },
                  { label: 'Status', field: null },
                  { label: 'Source', field: null },
                  { label: 'Revenue', field: 'totalRevenue' },
                  { label: 'Last Activity', field: 'lastActivity' },
                  { label: 'Signup Date', field: 'createdAt' },
                ].map(({ label, field }) => (
                  <th
                    key={label}
                    onClick={() => field && handleSort(field as typeof sortBy)}
                    className={cn(
                      'px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-stone-500 dark:text-stone-400',
                      field && 'cursor-pointer hover:text-stone-900 dark:hover:text-white',
                    )}
                  >
                    <span className="flex items-center gap-1">
                      {label}
                      {field && sortBy === field && (
                        <ArrowUpDown className="h-3 w-3" />
                      )}
                    </span>
                  </th>
                ))}
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
                : data?.items.map((customer) => (
                    <tr
                      key={customer.id}
                      onClick={() => router.push(`/crm/customers/${customer.id}`)}
                      className="cursor-pointer border-b border-stone-100 transition-colors hover:bg-stone-50 dark:border-stone-800 dark:hover:bg-stone-800/50"
                    >
                      <td className="px-4 py-3">
                        <div>
                          <p className="font-medium text-stone-900 dark:text-white">{customer.name}</p>
                          <p className="text-xs text-stone-500 dark:text-stone-400">{customer.email}</p>
                          {customer.phone && (
                            <p className="text-xs text-stone-400">{customer.phone}</p>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-stone-600 dark:text-stone-300">
                        {customer.company ?? '—'}
                      </td>
                      <td className="px-4 py-3">
                        <CRMStatusBadge value={customer.status} type="customer" />
                      </td>
                      <td className="px-4 py-3 capitalize text-stone-600 dark:text-stone-300">
                        {customer.source}
                      </td>
                      <td className="px-4 py-3 font-medium text-stone-900 dark:text-white">
                        ${customer.totalRevenue.toLocaleString()}
                      </td>
                      <td className="px-4 py-3 text-stone-500 dark:text-stone-400">
                        {customer.lastActivity
                          ? format(new Date(customer.lastActivity), 'MMM d, yyyy')
                          : '—'}
                      </td>
                      <td className="px-4 py-3 text-stone-500 dark:text-stone-400">
                        {format(new Date(customer.createdAt), 'MMM d, yyyy')}
                      </td>
                    </tr>
                  ))}
            </tbody>
          </table>

          {!isLoading && !data?.items.length && (
            <div className="flex flex-col items-center justify-center py-16 text-stone-500 dark:text-stone-400">
              <UserPlus className="mb-3 h-10 w-10 opacity-30" />
              <p className="font-medium">No customers found</p>
              <p className="text-sm">Try adjusting your filters or add a new customer.</p>
            </div>
          )}
        </div>

        {/* Pagination */}
        {(data?.pages ?? 0) > 1 && (
          <div className="flex items-center justify-between border-t border-stone-200 px-4 py-3 dark:border-stone-700">
            <p className="text-sm text-stone-500 dark:text-stone-400">
              Page {data?.page} of {data?.pages} &middot; {data?.total} total
            </p>
            <div className="flex gap-2">
              <Button
                variant="secondary"
                size="sm"
                icon={<ChevronLeft className="h-4 w-4" />}
                disabled={page === 1}
                onClick={() => setPage((p) => p - 1)}
              >
                Prev
              </Button>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => setPage((p) => p + 1)}
                disabled={page >= (data?.pages ?? 1)}
              >
                Next
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        )}
      </Card>

      {/* Add Customer Modal */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <Card className="w-full max-w-md">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-semibold text-stone-900 dark:text-white">
                Add Customer
              </h2>
              <button
                onClick={() => setShowAddModal(false)}
                className="rounded-lg p-1 text-stone-400 hover:bg-stone-100 dark:hover:bg-stone-800"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <form
              onSubmit={(e) => { e.preventDefault(); createMutation.mutate(newCustomer); }}
              className="space-y-4"
            >
              {[
                { field: 'name', label: 'Full Name *', type: 'text', required: true },
                { field: 'email', label: 'Email *', type: 'email', required: true },
                { field: 'phone', label: 'Phone', type: 'tel', required: false },
                { field: 'company', label: 'Company', type: 'text', required: false },
              ].map(({ field, label, type, required }) => (
                <div key={field}>
                  <label className="mb-1 block text-sm font-medium text-stone-700 dark:text-stone-300">
                    {label}
                  </label>
                  <input
                    type={type}
                    required={required}
                    value={(newCustomer as any)[field]}
                    onChange={(e) => setNewCustomer((p) => ({ ...p, [field]: e.target.value }))}
                    className="w-full rounded-lg border border-stone-200 bg-white px-3 py-2 text-sm text-stone-900 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500 dark:border-stone-700 dark:bg-stone-800 dark:text-white"
                  />
                </div>
              ))}

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block text-sm font-medium text-stone-700 dark:text-stone-300">
                    Status
                  </label>
                  <select
                    value={newCustomer.status}
                    onChange={(e) => setNewCustomer((p) => ({ ...p, status: e.target.value as CRMCustomerStatus }))}
                    className="w-full rounded-lg border border-stone-200 bg-white px-3 py-2 text-sm focus:border-brand-500 focus:outline-none dark:border-stone-700 dark:bg-stone-800 dark:text-white"
                  >
                    {Object.values(CRMCustomerStatus).map((v) => (
                      <option key={v} value={v} className="capitalize">{v}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium text-stone-700 dark:text-stone-300">
                    Source
                  </label>
                  <select
                    value={newCustomer.source}
                    onChange={(e) => setNewCustomer((p) => ({ ...p, source: e.target.value as CRMCustomerSource }))}
                    className="w-full rounded-lg border border-stone-200 bg-white px-3 py-2 text-sm focus:border-brand-500 focus:outline-none dark:border-stone-700 dark:bg-stone-800 dark:text-white"
                  >
                    {Object.values(CRMCustomerSource).map((v) => (
                      <option key={v} value={v} className="capitalize">{v}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="flex justify-end gap-3 pt-2">
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => setShowAddModal(false)}
                >
                  Cancel
                </Button>
                <Button type="submit" loading={createMutation.isPending}>
                  Add Customer
                </Button>
              </div>
            </form>
          </Card>
        </div>
      )}
    </div>
  );
}
