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
  userName: string;
  userEmail: string;
  subject: string;
  category: string;
  priority: string;
  status: string;
  createdAt: string;
  updatedAt: string;
}

interface TicketsResponse {
  tickets: Ticket[];
  total: number;
  page: number;
  totalPages: number;
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
          Support Tickets
        </h1>
        <p className="mt-1 text-sm text-stone-600 dark:text-stone-400">
          Manage customer support tickets
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
              className={cn(
                'rounded-md px-3 py-1.5 text-xs font-medium capitalize transition-colors',
                statusFilter === status
                  ? 'bg-white text-stone-900 shadow-sm dark:bg-stone-700 dark:text-white'
                  : 'text-stone-600 hover:text-stone-900 dark:text-stone-400 dark:hover:text-white',
              )}
            >
              {status === 'all' ? 'All' : status.replace('_', ' ')}
            </button>
          ))}
        </div>
      </div>

      {/* Tickets table */}
      <Card padding="none">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-stone-200 dark:border-stone-700">
                <th className="px-6 py-3 text-start text-xs font-medium uppercase tracking-wider text-stone-500 dark:text-stone-400">
                  Subject
                </th>
                <th className="px-6 py-3 text-start text-xs font-medium uppercase tracking-wider text-stone-500 dark:text-stone-400">
                  User
                </th>
                <th className="px-6 py-3 text-start text-xs font-medium uppercase tracking-wider text-stone-500 dark:text-stone-400">
                  Category
                </th>
                <th className="px-6 py-3 text-start text-xs font-medium uppercase tracking-wider text-stone-500 dark:text-stone-400">
                  Priority
                </th>
                <th className="px-6 py-3 text-start text-xs font-medium uppercase tracking-wider text-stone-500 dark:text-stone-400">
                  Status
                </th>
                <th className="px-6 py-3 text-start text-xs font-medium uppercase tracking-wider text-stone-500 dark:text-stone-400">
                  Created
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-100 dark:divide-stone-700">
              {data?.tickets?.map((ticket) => (
                <tr
                  key={ticket.id}
                  onClick={() => router.push(`/support/${ticket.id}` as any)}
                  className="cursor-pointer hover:bg-stone-50 dark:hover:bg-stone-800/50"
                >
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-2">
                      <MessageSquare className="h-4 w-4 shrink-0 text-stone-400" />
                      <span className="text-sm font-medium text-stone-900 dark:text-white">
                        {ticket.subject}
                      </span>
                    </div>
                  </td>
                  <td className="whitespace-nowrap px-6 py-4">
                    <div>
                      <p className="text-sm text-stone-900 dark:text-white">
                        {ticket.userName}
                      </p>
                      <p className="text-xs text-stone-500">{ticket.userEmail}</p>
                    </div>
                  </td>
                  <td className="whitespace-nowrap px-6 py-4">
                    <Badge variant="default">{ticket.category}</Badge>
                  </td>
                  <td className="whitespace-nowrap px-6 py-4">
                    <Badge variant={priorityVariant[ticket.priority] || 'default'}>
                      {ticket.priority}
                    </Badge>
                  </td>
                  <td className="whitespace-nowrap px-6 py-4">
                    <Badge variant={statusVariant[ticket.status] || 'default'}>
                      {ticket.status.replace('_', ' ')}
                    </Badge>
                  </td>
                  <td className="whitespace-nowrap px-6 py-4 text-sm text-stone-500">
                    {formatDate(ticket.createdAt)}
                  </td>
                </tr>
              ))}
              {(!data?.tickets || data.tickets.length === 0) && (
                <tr>
                  <td
                    colSpan={6}
                    className="px-6 py-8 text-center text-sm text-stone-500 dark:text-stone-400"
                  >
                    No tickets found
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {data && data.totalPages > 1 && (
          <div className="flex items-center justify-between border-t border-stone-200 px-6 py-3 dark:border-stone-700">
            <p className="text-sm text-stone-600 dark:text-stone-400">
              Page {data.page} of {data.totalPages}
            </p>
            <div className="flex gap-2">
              <Button
                variant="secondary"
                size="sm"
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page <= 1}
                icon={<ChevronLeft className="h-4 w-4" />}
              >
                Previous
              </Button>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => setPage((p) => p + 1)}
                disabled={page >= data.totalPages}
              >
                Next
                <ChevronRight className="ms-1 h-4 w-4" />
              </Button>
            </div>
          </div>
        )}
      </Card>
    </div>
  );
}
