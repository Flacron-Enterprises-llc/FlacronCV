'use client';
import React from 'react';

import { useState, useCallback, useId } from 'react';
import { useTranslations } from 'next-intl';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useRouter } from '@/i18n/routing';
import { api } from '@/lib/api';
import { useModalA11y } from '@/hooks/useModalA11y';
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
import { safeFormat } from '@/lib/format-date';
import { toast } from 'sonner';
import { downloadCsv } from '@/lib/download-csv';
import { cn } from '@/lib/utils';

interface ListResponse {
  items: CRMCustomer[];
  total: number;
  page: number;
  limit: number;
  pages: number;
}

const STATUS_OPTIONS = [
  { value: '', labelKey: 'all_statuses' },
  { value: CRMCustomerStatus.ACTIVE, labelKey: 'status_active' },
  { value: CRMCustomerStatus.INACTIVE, labelKey: 'status_inactive' },
  { value: CRMCustomerStatus.LEAD, labelKey: 'status_lead' },
];

const SORT_OPTIONS = [
  { value: 'createdAt', labelKey: 'signup_date' },
  { value: 'name', labelKey: 'name' },
  { value: 'totalRevenue', labelKey: 'revenue' },
  { value: 'lastActivity', labelKey: 'last_activity' },
];

/**
 * Seven columns overflowed on anything narrower than a desktop. Customer and
 * Status stay visible at every width — they are what the list is scanned on —
 * and the rest reappear as the viewport allows. Every hidden value is repeated
 * as a sub-line inside the Customer cell, so nothing is lost when narrow.
 */
const TABLE_COLUMNS: {
  labelKey: string;
  field: string | null;
  cellClass: string;
}[] = [
  { labelKey: 'customer', field: 'name', cellClass: '' },
  { labelKey: 'company', field: null, cellClass: 'hidden md:table-cell' },
  { labelKey: 'status', field: null, cellClass: '' },
  { labelKey: 'source', field: null, cellClass: 'hidden lg:table-cell' },
  { labelKey: 'revenue', field: 'totalRevenue', cellClass: 'hidden md:table-cell' },
  { labelKey: 'last_activity', field: 'lastActivity', cellClass: 'hidden lg:table-cell' },
  { labelKey: 'signup_date', field: 'createdAt', cellClass: 'hidden lg:table-cell' },
];

export default function CRMCustomersPage(): React.JSX.Element | null {
  const t = useTranslations('crm');
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

  const titleId = useId();
  const fieldId = useId();
  const closeAddModal = useCallback(() => setShowAddModal(false), []);
  const dialogRef = useModalA11y<HTMLDivElement>(showAddModal, closeAddModal);

  const queryKey = ['crm', 'customers', { search, status, sortBy, sortOrder, page }];

  const { data, isLoading } = useQuery<ListResponse>({
    queryKey,
    queryFn: () =>
      api.get(
        `/crm/customers?page=${page}&search=${encodeURIComponent(search)}&status=${status}&sortBy=${sortBy}&sortOrder=${sortOrder}`,
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
      toast.success(t('customers_add_success'));
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
    downloadCsv('/crm/customers/export/csv', 'customers.csv').catch((e) =>
      toast.error(e instanceof Error ? e.message : 'Export failed'),
    );
  }, []);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-stone-900 dark:text-white">{t('customers_title')}</h1>
          <p className="mt-1 text-sm text-stone-500 dark:text-stone-400">
            {t('customers_total_count', { count: data?.total ?? 0 })}
          </p>
        </div>
        <div className="flex gap-3">
          <Button
            variant="secondary"
            icon={<Download className="h-4 w-4" />}
            onClick={handleExport}
          >
            {t('export_csv')}
          </Button>
          <Button
            icon={<Plus className="h-4 w-4" />}
            onClick={() => setShowAddModal(true)}
          >
            {t('customers_add_customer')}
          </Button>
        </div>
      </div>

      {/* Filters */}
      <Card padding="sm">
        <div className="flex flex-wrap gap-3">
          {/* Search */}
          <div className="relative flex-1 min-w-48">
            <Search className="absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-stone-400" />
            <input
              type="text"
              placeholder={t('customers_search_placeholder')}
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(1); }}
              className="w-full rounded-lg border border-stone-200 bg-white py-2 ps-9 pe-4 text-sm text-stone-900 placeholder-stone-400 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500 dark:border-stone-700 dark:bg-stone-800 dark:text-white dark:placeholder-stone-500"
            />
          </div>

          {/* Status filter */}
          <select
            value={status}
            aria-label={t('filter_by_status')}
            onChange={(e) => { setStatus(e.target.value as CRMCustomerStatus | ''); setPage(1); }}
            className="rounded-lg border border-stone-200 bg-white px-3 py-2 text-sm text-stone-900 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500 dark:border-stone-700 dark:bg-stone-800 dark:text-white"
          >
            {STATUS_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{t(o.labelKey)}</option>
            ))}
          </select>

          {/* Sort */}
          <select
            value={sortBy}
            aria-label={t('sort_by')}
            onChange={(e) => handleSort(e.target.value as typeof sortBy)}
            className="rounded-lg border border-stone-200 bg-white px-3 py-2 text-sm text-stone-900 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500 dark:border-stone-700 dark:bg-stone-800 dark:text-white"
          >
            {SORT_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{t('customers_sort_prefix', { label: t(o.labelKey) })}</option>
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
                {TABLE_COLUMNS.map(({ labelKey, field, cellClass }) => (
                  <th
                    key={labelKey}
                    onClick={() => field && handleSort(field as typeof sortBy)}
                    onKeyDown={(e) => {
                      if (field && (e.key === 'Enter' || e.key === ' ')) {
                        e.preventDefault();
                        handleSort(field as typeof sortBy);
                      }
                    }}
                    tabIndex={field ? 0 : undefined}
                    aria-sort={
                      field
                        ? sortBy === field
                          ? sortOrder === 'asc'
                            ? 'ascending'
                            : 'descending'
                          : 'none'
                        : undefined
                    }
                    className={cn(
                      'px-4 py-3 text-start text-xs font-semibold uppercase tracking-wide text-stone-500 sm:px-6 dark:text-stone-400',
                      cellClass,
                      field &&
                        'cursor-pointer hover:text-stone-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand-500 dark:hover:text-white',
                    )}
                  >
                    <span className="flex items-center gap-1">
                      {t(labelKey)}
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
                      {TABLE_COLUMNS.map(({ labelKey, cellClass }) => (
                        <td key={labelKey} className={cn('px-4 py-3 sm:px-6', cellClass)}>
                          <div className="h-4 animate-pulse rounded bg-stone-200 dark:bg-stone-700" />
                        </td>
                      ))}
                    </tr>
                  ))
                : data?.items.map((customer) => (
                    <tr
                      key={customer.id}
                      tabIndex={0}
                      onClick={() => router.push(`/crm/customers/${customer.id}`)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          router.push(`/crm/customers/${customer.id}`);
                        }
                      }}
                      className="cursor-pointer border-b border-stone-100 transition-colors hover:bg-stone-50 focus:outline-none focus-visible:bg-stone-50 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand-500 dark:border-stone-800 dark:hover:bg-stone-800/50 dark:focus-visible:bg-stone-800/50"
                    >
                      <td className="px-4 py-3 sm:px-6">
                        <div>
                          <p className="font-medium text-stone-900 dark:text-white">{customer.name}</p>
                          <p className="text-xs text-stone-500 dark:text-stone-400">{customer.email}</p>
                          {customer.phone && (
                            <p className="text-xs text-stone-400">{customer.phone}</p>
                          )}
                          {/* Fallbacks for the columns hidden at this width. */}
                          <p className="text-xs text-stone-500 md:hidden dark:text-stone-400">
                            {customer.company ?? '—'} · ${customer.totalRevenue.toLocaleString()}
                          </p>
                          <p className="text-xs text-stone-500 lg:hidden dark:text-stone-400">
                            <span className="capitalize">{customer.source}</span> ·{' '}
                            {safeFormat(customer.lastActivity, 'MMM d, yyyy')} ·{' '}
                            {safeFormat(customer.createdAt, 'MMM d, yyyy')}
                          </p>
                        </div>
                      </td>
                      <td className="hidden px-4 py-3 text-stone-600 md:table-cell sm:px-6 dark:text-stone-300">
                        {customer.company ?? '—'}
                      </td>
                      <td className="px-4 py-3 sm:px-6">
                        <CRMStatusBadge value={customer.status} type="customer" />
                      </td>
                      <td className="hidden px-4 py-3 capitalize text-stone-600 lg:table-cell sm:px-6 dark:text-stone-300">
                        {customer.source}
                      </td>
                      <td className="hidden px-4 py-3 font-medium text-stone-900 md:table-cell sm:px-6 dark:text-white">
                        ${customer.totalRevenue.toLocaleString()}
                      </td>
                      <td className="hidden px-4 py-3 text-stone-500 lg:table-cell sm:px-6 dark:text-stone-400">
                        {safeFormat(customer.lastActivity, 'MMM d, yyyy')}
                      </td>
                      <td className="hidden px-4 py-3 text-stone-500 lg:table-cell sm:px-6 dark:text-stone-400">
                        {safeFormat(customer.createdAt, 'MMM d, yyyy')}
                      </td>
                    </tr>
                  ))}
            </tbody>
          </table>

          {!isLoading && !data?.items.length && (
            <div className="flex flex-col items-center justify-center py-16 text-stone-500 dark:text-stone-400">
              <UserPlus className="mb-3 h-10 w-10 opacity-30" />
              <p className="font-medium">{t('customers_empty_title')}</p>
              <p className="text-sm">{t('customers_empty_subtitle')}</p>
            </div>
          )}
        </div>

        {/* Pagination */}
        {(data?.pages ?? 0) > 1 && (
          <div className="flex items-center justify-between border-t border-stone-200 px-4 py-3 dark:border-stone-700">
            <p className="text-sm text-stone-500 dark:text-stone-400">
              {t('customers_pagination_info', {
                page: data?.page ?? 0,
                pages: data?.pages ?? 0,
                total: data?.total ?? 0,
              })}
            </p>
            <div className="flex gap-2">
              <Button
                variant="secondary"
                size="sm"
                icon={<ChevronLeft className="h-4 w-4" />}
                disabled={page === 1}
                onClick={() => setPage((p) => p - 1)}
              >
                {t('pagination_prev')}
              </Button>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => setPage((p) => p + 1)}
                disabled={page >= (data?.pages ?? 1)}
              >
                {t('pagination_next')}
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        )}
      </Card>

      {/* Add Customer Modal. Card renders a plain div and takes no ref, so the
          overlay itself is the dialog element — same markup, now with a focus
          trap, Escape to close, and focus restore from the shared hook. */}
      {showAddModal && (
        <div
          ref={dialogRef}
          role="dialog"
          aria-modal="true"
          aria-labelledby={titleId}
          tabIndex={-1}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 outline-none"
        >
          <Card className="max-h-[90vh] w-full max-w-md overflow-y-auto">
            <div className="mb-4 flex items-center justify-between">
              <h2 id={titleId} className="text-lg font-semibold text-stone-900 dark:text-white">
                {t('customers_add_customer')}
              </h2>
              <button
                type="button"
                onClick={closeAddModal}
                aria-label={t('close')}
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
                { field: 'name', labelKey: 'customers_field_name', type: 'text', required: true },
                { field: 'email', labelKey: 'customers_field_email', type: 'email', required: true },
                { field: 'phone', labelKey: 'phone', type: 'tel', required: false },
                { field: 'company', labelKey: 'company', type: 'text', required: false },
              ].map(({ field, labelKey, type, required }) => (
                <div key={field}>
                  <label
                    htmlFor={`${fieldId}-${field}`}
                    className="mb-1 block text-sm font-medium text-stone-700 dark:text-stone-300"
                  >
                    {t(labelKey)}
                  </label>
                  <input
                    id={`${fieldId}-${field}`}
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
                  <label
                    htmlFor={`${fieldId}-status`}
                    className="mb-1 block text-sm font-medium text-stone-700 dark:text-stone-300"
                  >
                    {t('status')}
                  </label>
                  <select
                    id={`${fieldId}-status`}
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
                  <label
                    htmlFor={`${fieldId}-source`}
                    className="mb-1 block text-sm font-medium text-stone-700 dark:text-stone-300"
                  >
                    {t('source')}
                  </label>
                  <select
                    id={`${fieldId}-source`}
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
                  {t('cancel')}
                </Button>
                <Button type="submit" loading={createMutation.isPending}>
                  {t('customers_add_customer')}
                </Button>
              </div>
            </form>
          </Card>
        </div>
      )}
    </div>
  );
}
