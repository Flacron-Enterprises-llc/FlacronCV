'use client';

import React from 'react';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { useQuery } from '@tanstack/react-query';
import { useRouter } from '@/i18n/routing';
import { api } from '@/lib/api';
import Card from '@/components/ui/Card';
import Badge from '@/components/ui/Badge';
import Button from '@/components/ui/Button';
import { formatDate, cn } from '@/lib/utils';
import {
  MessageSquare,
  Loader2,
  AlertCircle,
  ChevronLeft,
  ChevronRight,
  Filter,
} from 'lucide-react';

interface Ticket {
  id: string;
  userId: string;
  userDisplayName: string;
  userEmail: string;
  subject: string;
  category: string;
  priority: string;
  status: string;
  createdAt: string;
  updatedAt: string;
}

interface TicketsResponse {
  items: Ticket[];
  total: number;
  page: number;
  limit: number;
}

const statusFilters = ['all', 'open', 'in_progress', 'resolved', 'closed'];

const priorityVariant: Record<string, 'success' | 'warning' | 'danger' | 'default'> = {
  low: 'success',
  medium: 'warning',
  high: 'danger',
  urgent: 'danger',
};

const statusVariant: Record<string, 'info' | 'warning' | 'success' | 'default'> = {
  open: 'info',
  in_progress: 'warning',
  resolved: 'success',
  closed: 'default',
};

export default function AdminTicketsPage(): React.JSX.Element | null {
  const t = useTranslations('admin');
  const ts = useTranslations('support');
  const router = useRouter();
  const [statusFilter, setStatusFilter] = useState('all');
  const [page, setPage] = useState(1);

  const { data, isLoading, error } = useQuery<TicketsResponse>({
    queryKey: ['admin', 'tickets', statusFilter, page],
    queryFn: () =>
      api.get(
        `/admin/tickets?page=${page}&limit=20${statusFilter !== 'all' ? `&status=${statusFilter}` : ''}`,
      ),
  });

  const totalPages = data && data.limit ? Math.ceil(data.total / data.limit) : 1;

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

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-stone-900 dark:text-white">
          {t('tickets')}
        </h1>
        <p className="mt-1 text-sm text-stone-600 dark:text-stone-400">
          {t('tickets_subtitle')}
        </p>
      </div>

      {/* Status filter */}
      <div className="flex items-center gap-2">
        <Filter className="h-4 w-4 text-stone-400" />
        <div className="flex rounded-lg border border-stone-200 bg-stone-50 p-1 dark:border-stone-700 dark:bg-stone-800/50">
          {statusFilters.map((status) => (
            <button
              key={status}
              onClick={() => {
                setStatusFilter(status);
                setPage(1);
              }}
              aria-pressed={statusFilter === status}
              className={cn(
                'rounded-md px-3 py-1.5 text-xs font-medium capitalize transition-colors',
                statusFilter === status
                  ? 'bg-white text-stone-900 shadow-sm dark:bg-stone-700 dark:text-white'
                  : 'text-stone-600 hover:text-stone-900 dark:text-stone-400 dark:hover:text-white',
              )}
            >
              {status === 'all' ? t('filter_all') : ts(`statusLabels.${status}`)}
            </button>
          ))}
        </div>
      </div>

      {/* Tickets table */}
      <Card padding="none">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              {/* Responsive columns. The table previously rendered all six at
                  px-6 and simply overflowed, so on a laptop the right-hand
                  columns were cut off. Subject and Status are always visible —
                  they are what an agent triages on — and the rest reappear as
                  the viewport allows. Anything hidden is repeated inside the
                  Subject cell (below), so no information is ever lost. */}
              <tr className="border-b border-stone-200 dark:border-stone-700">
                <th className="px-4 py-3 text-start text-xs font-medium uppercase tracking-wider text-stone-500 sm:px-6 dark:text-stone-400">
                  {t('th_subject')}
                </th>
                <th className="hidden px-4 py-3 text-start text-xs font-medium uppercase tracking-wider text-stone-500 md:table-cell sm:px-6 dark:text-stone-400">
                  {t('th_user')}
                </th>
                <th className="hidden px-4 py-3 text-start text-xs font-medium uppercase tracking-wider text-stone-500 xl:table-cell sm:px-6 dark:text-stone-400">
                  {t('th_category')}
                </th>
                <th className="hidden px-4 py-3 text-start text-xs font-medium uppercase tracking-wider text-stone-500 lg:table-cell sm:px-6 dark:text-stone-400">
                  {t('th_priority')}
                </th>
                <th className="px-4 py-3 text-start text-xs font-medium uppercase tracking-wider text-stone-500 sm:px-6 dark:text-stone-400">
                  {t('status')}
                </th>
                <th className="hidden px-4 py-3 text-start text-xs font-medium uppercase tracking-wider text-stone-500 sm:table-cell sm:px-6 dark:text-stone-400">
                  {t('created')}
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-100 dark:divide-stone-700">
              {data?.items?.map((ticket) => (
                <tr
                  key={ticket.id}
                  role="button"
                  tabIndex={0}
                  aria-label={`${t('open_ticket')}: ${ticket.subject}`}
                  onClick={() => router.push(`/admin/tickets/${ticket.id}` as any)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      router.push(`/admin/tickets/${ticket.id}` as any);
                    }
                  }}
                  className="cursor-pointer hover:bg-stone-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand-500 dark:hover:bg-stone-800/50"
                >
                  <td className="px-4 py-4 sm:px-6">
                    <div className="flex items-start gap-2">
                      <MessageSquare className="mt-0.5 h-4 w-4 shrink-0 text-stone-400" />
                      <div className="min-w-0">
                        <span className="text-sm font-medium text-stone-900 dark:text-white">
                          {ticket.subject}
                        </span>
                        {/* Fallback for the columns hidden at this width, so a
                            narrow screen still shows who raised it and when. */}
                        <p className="text-xs text-stone-500 md:hidden">
                          {ticket.userDisplayName} · {formatDate(ticket.createdAt)}
                        </p>
                        <p className="text-xs text-stone-500 lg:hidden">
                          {ts(`priorityLabels.${ticket.priority}`)} ·{' '}
                          {ts(`categoryLabels.${ticket.category}`)}
                        </p>
                      </div>
                    </div>
                  </td>
                  <td className="hidden whitespace-nowrap px-4 py-4 md:table-cell sm:px-6">
                    <div>
                      <p className="text-sm text-stone-900 dark:text-white">
                        {ticket.userDisplayName}
                      </p>
                      <p className="text-xs text-stone-500">{ticket.userEmail}</p>
                    </div>
                  </td>
                  <td className="hidden whitespace-nowrap px-4 py-4 xl:table-cell sm:px-6">
                    <Badge variant="default">{ts(`categoryLabels.${ticket.category}`)}</Badge>
                  </td>
                  <td className="hidden whitespace-nowrap px-4 py-4 lg:table-cell sm:px-6">
                    <Badge variant={priorityVariant[ticket.priority] || 'default'}>
                      {ts(`priorityLabels.${ticket.priority}`)}
                    </Badge>
                  </td>
                  <td className="px-4 py-4 sm:px-6">
                    <Badge variant={statusVariant[ticket.status] || 'default'}>
                      {ts(`statusLabels.${ticket.status}`)}
                    </Badge>
                  </td>
                  <td className="hidden whitespace-nowrap px-4 py-4 text-sm text-stone-500 sm:table-cell sm:px-6">
                    {formatDate(ticket.createdAt)}
                  </td>
                </tr>
              ))}
              {(!data?.items || data.items.length === 0) && (
                <tr>
                  <td
                    colSpan={6}
                    className="px-6 py-8 text-center text-sm text-stone-500 dark:text-stone-400"
                  >
                    {t('no_tickets')}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {data && totalPages > 1 && (
          <div className="flex items-center justify-between border-t border-stone-200 px-6 py-3 dark:border-stone-700">
            <p className="text-sm text-stone-600 dark:text-stone-400">
              {t('page_of', { page: data.page, total: totalPages })}
            </p>
            <div className="flex gap-2">
              <Button
                variant="secondary"
                size="sm"
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page <= 1}
                icon={<ChevronLeft className="h-4 w-4" />}
              >
                {t('previous')}
              </Button>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => setPage((p) => p + 1)}
                disabled={page >= totalPages}
              >
                {t('next')}
                <ChevronRight className="ms-1 h-4 w-4" />
              </Button>
            </div>
          </div>
        )}
      </Card>
    </div>
  );
}
