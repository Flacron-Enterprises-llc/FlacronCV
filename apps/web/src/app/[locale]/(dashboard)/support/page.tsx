'use client';
import React from 'react';

import { useTranslations } from 'next-intl';
import { Link, useRouter } from '@/i18n/routing';
import { useAuth } from '@/providers/AuthProvider';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { formatDate } from '@/lib/utils';
import Button from '@/components/ui/Button';
import Card from '@/components/ui/Card';
import Badge from '@/components/ui/Badge';
import { HelpCircle, Plus, Clock } from 'lucide-react';
import {
  SupportTicket,
  TicketPriority,
  TicketStatus,
  TicketCategory,
} from '@flacroncv/shared-types';

const priorityVariantMap: Record<TicketPriority, 'success' | 'warning' | 'danger' | 'danger'> = {
  [TicketPriority.LOW]: 'success',
  [TicketPriority.MEDIUM]: 'warning',
  [TicketPriority.HIGH]: 'danger',
  [TicketPriority.URGENT]: 'danger',
};

const priorityLabelMap: Record<TicketPriority, string> = {
  [TicketPriority.LOW]: 'Low',
  [TicketPriority.MEDIUM]: 'Medium',
  [TicketPriority.HIGH]: 'High',
  [TicketPriority.URGENT]: 'Urgent',
};

const statusVariantMap: Record<
  TicketStatus,
  'info' | 'warning' | 'success' | 'default' | 'brand'
> = {
  [TicketStatus.OPEN]: 'info',
  [TicketStatus.IN_PROGRESS]: 'warning',
  [TicketStatus.WAITING_ON_CUSTOMER]: 'brand',
  [TicketStatus.RESOLVED]: 'success',
  [TicketStatus.CLOSED]: 'default',
};

const statusLabelMap: Record<TicketStatus, string> = {
  [TicketStatus.OPEN]: 'Open',
  [TicketStatus.IN_PROGRESS]: 'In Progress',
  [TicketStatus.WAITING_ON_CUSTOMER]: 'Waiting',
  [TicketStatus.RESOLVED]: 'Resolved',
  [TicketStatus.CLOSED]: 'Closed',
};

const categoryLabelMap: Record<TicketCategory, string> = {
  [TicketCategory.GENERAL]: 'General',
  [TicketCategory.BUG]: 'Bug',
  [TicketCategory.FEATURE_REQUEST]: 'Feature Request',
  [TicketCategory.BILLING]: 'Billing',
  [TicketCategory.ACCOUNT]: 'Account',
};

export default function SupportPage(): React.JSX.Element | null {
  const t = useTranslations('support');
  const router = useRouter();
  const { user } = useAuth();

  const { data: tickets, isLoading } = useQuery({
    queryKey: ['support-tickets'],
    queryFn: () => api.get<SupportTicket[]>('/support/tickets'),
    enabled: !!user,
  });

  return (
    <div className="mx-auto max-w-4xl space-y-6 p-4 sm:p-6 lg:p-8">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-stone-900 dark:text-white">
            {t('title')}
          </h1>
          <p className="mt-1 text-sm text-stone-500 dark:text-stone-400">
            {t('description')}
          </p>
        </div>
        <Link href="/support/new">
          <Button icon={<Plus className="h-4 w-4" />}>{t('newTicket')}</Button>
        </Link>
      </div>

      {isLoading ? (
        <div className="space-y-4">
          {[1, 2, 3].map((i) => (
            <Card key={i} className="animate-pulse">
              <div className="h-5 w-2/3 rounded bg-stone-200 dark:bg-stone-700" />
              <div className="mt-3 flex gap-2">
                <div className="h-5 w-16 rounded-full bg-stone-200 dark:bg-stone-700" />
                <div className="h-5 w-16 rounded-full bg-stone-200 dark:bg-stone-700" />
                <div className="h-5 w-16 rounded-full bg-stone-200 dark:bg-stone-700" />
              </div>
              <div className="mt-3 h-4 w-1/4 rounded bg-stone-200 dark:bg-stone-700" />
            </Card>
          ))}
        </div>
      ) : tickets && tickets.length > 0 ? (
        <div className="space-y-4">
          {tickets.map((ticket) => (
            <Card
              key={ticket.id}
              hover
              className="block"
              onClick={() => router.push(`/support/${ticket.id}`)}
            >
              <div className="flex flex-col gap-3">
                <h3 className="text-base font-semibold text-stone-900 dark:text-white">
                  {ticket.subject}
                </h3>
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant="default">{categoryLabelMap[ticket.category]}</Badge>
                  <Badge
                    variant={
                      ticket.priority === TicketPriority.URGENT
                        ? 'danger'
                        : priorityVariantMap[ticket.priority]
                    }
                  >
                    {priorityLabelMap[ticket.priority]}
                  </Badge>
                  <Badge variant={statusVariantMap[ticket.status]}>
                    {statusLabelMap[ticket.status]}
                  </Badge>
                </div>
                <div className="flex items-center gap-1.5 text-xs text-stone-500 dark:text-stone-400">
                  <Clock className="h-3.5 w-3.5" />
                  <span>{formatDate(ticket.createdAt)}</span>
                </div>
              </div>
            </Card>
          ))}
        </div>
      ) : (
        <Card className="flex flex-col items-center justify-center py-16 text-center">
          <HelpCircle className="mb-4 h-12 w-12 text-stone-300 dark:text-stone-600" />
          <h3 className="text-lg font-semibold text-stone-900 dark:text-white">
            {t('emptyTitle')}
          </h3>
          <p className="mt-1 max-w-sm text-sm text-stone-500 dark:text-stone-400">
            {t('emptyDescription')}
          </p>
          <Link href="/support/new" className="mt-6">
            <Button icon={<Plus className="h-4 w-4" />}>{t('newTicket')}</Button>
          </Link>
        </Card>
      )}
    </div>
  );
}
