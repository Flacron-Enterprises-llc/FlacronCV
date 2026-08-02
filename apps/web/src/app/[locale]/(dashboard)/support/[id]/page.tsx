'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Link, useRouter } from '@/i18n/routing';
import { useAuth } from '@/providers/AuthProvider';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { formatDate } from '@/lib/utils';
import { toast } from 'sonner';
import Button from '@/components/ui/Button';
import Card from '@/components/ui/Card';
import Badge from '@/components/ui/Badge';
import {
  ArrowLeft,
  Send,
  XCircle,
  User as UserIcon,
  ShieldCheck,
} from 'lucide-react';
import {
  SupportTicket,
  TicketMessage,
  TicketPriority,
  TicketStatus,
} from '@flacroncv/shared-types';

const priorityVariantMap: Record<TicketPriority, 'success' | 'warning' | 'danger'> = {
  [TicketPriority.LOW]: 'success',
  [TicketPriority.MEDIUM]: 'warning',
  [TicketPriority.HIGH]: 'danger',
  [TicketPriority.URGENT]: 'danger',
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

interface TicketDetailPageProps {
  params: { id: string };
}

export default function TicketDetailPage({ params }: TicketDetailPageProps) {
  const t = useTranslations('support');
  const router = useRouter();
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const [replyContent, setReplyContent] = useState('');

  // GET /support/tickets/:id returns the ticket AND its messages in one payload;
  // there is no separate /messages GET route. Consume the combined shape.
  const { data, isLoading: ticketLoading } = useQuery({
    queryKey: ['support-ticket', params.id],
    queryFn: () =>
      api.get<{ ticket: SupportTicket; messages: TicketMessage[] }>(
        `/support/tickets/${params.id}`,
      ),
    enabled: !!user,
  });
  const ticket = data?.ticket;
  const messages = data?.messages;

  const replyMutation = useMutation({
    mutationFn: (content: string) =>
      api.post<TicketMessage>(`/support/tickets/${params.id}/messages`, { content }),
    onSuccess: () => {
      setReplyContent('');
      toast.success(t('replySent'));
      queryClient.invalidateQueries({
        queryKey: ['support-ticket', params.id],
      });
    },
    onError: (error: Error) => {
      toast.error(error.message || t('replyError'));
    },
  });

  const closeMutation = useMutation({
    mutationFn: () =>
      api.patch<SupportTicket>(`/support/tickets/${params.id}/close`),
    onSuccess: () => {
      toast.success(t('ticketClosed'));
      queryClient.invalidateQueries({
        queryKey: ['support-ticket', params.id],
      });
    },
    onError: (error: Error) => {
      toast.error(error.message || t('closeError'));
    },
  });

  const handleReply = (e: React.FormEvent) => {
    e.preventDefault();
    if (!replyContent.trim()) return;
    replyMutation.mutate(replyContent.trim());
  };

  const getInitials = (name: string): string => {
    return name
      .split(' ')
      .map((n) => n[0])
      .join('')
      .toUpperCase()
      .slice(0, 2);
  };

  if (ticketLoading) {
    return (
      <div className="mx-auto max-w-3xl space-y-6">
        <div className="h-8 w-32 animate-pulse rounded bg-stone-200 dark:bg-stone-700" />
        <Card className="animate-pulse">
          <div className="h-6 w-3/4 rounded bg-stone-200 dark:bg-stone-700" />
          <div className="mt-4 flex gap-2">
            <div className="h-5 w-16 rounded-full bg-stone-200 dark:bg-stone-700" />
            <div className="h-5 w-16 rounded-full bg-stone-200 dark:bg-stone-700" />
            <div className="h-5 w-16 rounded-full bg-stone-200 dark:bg-stone-700" />
          </div>
        </Card>
        <div className="space-y-4">
          {[1, 2].map((i) => (
            <div key={i} className="flex gap-3">
              <div className="h-10 w-10 animate-pulse rounded-full bg-stone-200 dark:bg-stone-700" />
              <div className="flex-1 animate-pulse">
                <div className="h-4 w-24 rounded bg-stone-200 dark:bg-stone-700" />
                <div className="mt-2 h-16 rounded bg-stone-200 dark:bg-stone-700" />
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (!ticket) {
    return (
      <div className="mx-auto max-w-3xl">
        <Card className="flex flex-col items-center justify-center py-16 text-center">
          <h3 className="text-lg font-semibold text-stone-900 dark:text-white">
            {t('ticketNotFound')}
          </h3>
          <Link href="/support" className="mt-4">
            <Button variant="secondary">{t('backToTickets')}</Button>
          </Link>
        </Card>
      </div>
    );
  }

  const isClosed = ticket.status === TicketStatus.CLOSED;

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      {/* Back button */}
      <Link href="/support">
        <Button variant="ghost" size="sm" icon={<ArrowLeft className="h-4 w-4" />}>
          {t('backToTickets')}
        </Button>
      </Link>

      {/* Ticket header */}
      <Card>
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="space-y-3">
            <h1 className="text-2xl font-bold text-stone-900 dark:text-white">
              {ticket.subject}
            </h1>
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="default">{t(`categoryLabels.${ticket.category}`)}</Badge>
              <Badge
                variant={
                  ticket.priority === TicketPriority.URGENT
                    ? 'danger'
                    : priorityVariantMap[ticket.priority]
                }
              >
                {t(`priorityLabels.${ticket.priority}`)}
              </Badge>
              <Badge variant={statusVariantMap[ticket.status]}>
                {t(`statusLabels.${ticket.status}`)}
              </Badge>
            </div>
            <p className="text-xs text-stone-500 dark:text-stone-400">
              {t('createdOn')} {formatDate(ticket.createdAt)}
            </p>
          </div>
          {!isClosed && (
            <Button
              variant="danger"
              size="sm"
              icon={<XCircle className="h-4 w-4" />}
              onClick={() => closeMutation.mutate()}
              loading={closeMutation.isPending}
            >
              {t('closeTicket')}
            </Button>
          )}
        </div>
      </Card>

      {/* Messages thread */}
      <div className="space-y-4">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-stone-500 dark:text-stone-400">
          {t('messages')}
        </h2>

        {messages && messages.length > 0 ? (
          <div className="space-y-4">
            {messages.map((msg) => {
              const isAdmin = msg.authorRole === 'admin';
              return (
                <div
                  key={msg.id}
                  className={`flex gap-3 ${isAdmin ? 'flex-row' : 'flex-row-reverse'}`}
                >
                  {/* Avatar */}
                  <div
                    className={`flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full text-sm font-semibold ${
                      isAdmin
                        ? 'bg-brand-100 text-brand-700 dark:bg-brand-900/30 dark:text-brand-400'
                        : 'bg-stone-100 text-stone-700 dark:bg-stone-700 dark:text-stone-300'
                    }`}
                  >
                    {isAdmin ? (
                      <ShieldCheck className="h-5 w-5" />
                    ) : (
                      getInitials(msg.authorName)
                    )}
                  </div>

                  {/* Message bubble */}
                  <div
                    className={`max-w-[75%] rounded-xl px-4 py-3 ${
                      isAdmin
                        ? 'rounded-ss-none bg-brand-50 dark:bg-brand-950/30'
                        : 'rounded-se-none bg-stone-100 dark:bg-stone-700'
                    }`}
                  >
                    <div className="mb-1 flex items-center gap-2">
                      <span className="text-sm font-semibold text-stone-900 dark:text-white">
                        {msg.authorName}
                      </span>
                      {isAdmin && (
                        <Badge variant="brand" size="sm">
                          {t('admin')}
                        </Badge>
                      )}
                    </div>
                    <p className="whitespace-pre-wrap text-sm text-stone-700 dark:text-stone-300">
                      {msg.content}
                    </p>
                    <p className="mt-2 text-end text-xs text-stone-400 dark:text-stone-500">
                      {formatDate(msg.createdAt)}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <Card className="py-8 text-center">
            <p className="text-sm text-stone-500 dark:text-stone-400">
              {t('noMessages')}
            </p>
          </Card>
        )}
      </div>

      {/* Reply form */}
      {!isClosed && (
        <Card>
          <form onSubmit={handleReply} className="space-y-4">
            <div className="space-y-1.5">
              <label
                htmlFor="reply"
                className="block text-sm font-medium text-stone-700 dark:text-stone-300"
              >
                {t('replyLabel')}
              </label>
              <textarea
                id="reply"
                value={replyContent}
                onChange={(e) => setReplyContent(e.target.value)}
                placeholder={t('replyPlaceholder')}
                rows={4}
                className="input-field w-full resize-y"
                required
              />
            </div>
            <div className="flex justify-end">
              <Button
                type="submit"
                loading={replyMutation.isPending}
                disabled={!replyContent.trim()}
                icon={<Send className="h-4 w-4" />}
              >
                {t('sendReply')}
              </Button>
            </div>
          </form>
        </Card>
      )}

      {isClosed && (
        <Card className="py-6 text-center">
          <p className="text-sm font-medium text-stone-500 dark:text-stone-400">
            {t('ticketClosedMessage')}
          </p>
        </Card>
      )}
    </div>
  );
}
