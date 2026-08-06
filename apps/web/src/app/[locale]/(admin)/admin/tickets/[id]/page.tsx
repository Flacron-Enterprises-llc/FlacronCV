'use client';

import React, { useState } from 'react';
import { useTranslations } from 'next-intl';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Link, useRouter } from '@/i18n/routing';
import { api } from '@/lib/api';
import { formatDate } from '@/lib/utils';
import { toDate } from '@/lib/format-date';
import { toast } from 'sonner';
import Card from '@/components/ui/Card';
import Badge from '@/components/ui/Badge';
import Button from '@/components/ui/Button';
import {
  ArrowLeft,
  Send,
  Loader2,
  AlertCircle,
  Lock,
  ShieldCheck,
  User as UserIcon,
} from 'lucide-react';
import { SupportTicket, TicketMessage, TicketStatus } from '@flacroncv/shared-types';

interface AdminTicketDetail {
  ticket: SupportTicket;
  /** Customer-visible messages only — the API filters internal notes out. */
  messages: TicketMessage[];
}

/** An internal note: same shape as a message, flagged and served separately. */
interface InternalNote extends TicketMessage {
  internal?: boolean;
}

/**
 * Notes come from their own admin-only endpoint (they are never mixed into the
 * message thread server-side, so they cannot leak through the customer's read),
 * and are interleaved into the thread here by timestamp.
 */
interface ThreadEntry {
  message: TicketMessage;
  isNote: boolean;
}

/** Epoch millis for a date-ish value; 0 when absent so it sorts first. */
function time(value: unknown): number {
  const d = toDate(value);
  return d ? d.getTime() : 0;
}

const priorityVariant: Record<string, 'success' | 'warning' | 'danger' | 'default'> = {
  low: 'success',
  medium: 'warning',
  high: 'danger',
  urgent: 'danger',
};

const statusVariant: Record<string, 'info' | 'warning' | 'success' | 'default' | 'brand'> = {
  open: 'info',
  in_progress: 'warning',
  waiting_on_customer: 'brand',
  resolved: 'success',
  closed: 'default',
};

const STATUS_OPTIONS: TicketStatus[] = [
  TicketStatus.OPEN,
  TicketStatus.IN_PROGRESS,
  TicketStatus.WAITING_ON_CUSTOMER,
  TicketStatus.RESOLVED,
  TicketStatus.CLOSED,
];

interface AdminTicketDetailPageProps {
  params: { id: string };
}

export default function AdminTicketDetailPage({ params }: AdminTicketDetailPageProps) {
  const t = useTranslations('admin');
  const ts = useTranslations('support');
  const router = useRouter();
  const queryClient = useQueryClient();
  const [replyContent, setReplyContent] = useState('');
  const [noteContent, setNoteContent] = useState('');

  const { data, isLoading, error } = useQuery<AdminTicketDetail>({
    queryKey: ['admin', 'ticket', params.id],
    queryFn: () => api.get(`/admin/tickets/${params.id}`),
  });

  const { data: notes, error: notesError } = useQuery<InternalNote[]>({
    queryKey: ['admin', 'ticket', params.id, 'notes'],
    queryFn: () => api.get(`/admin/tickets/${params.id}/notes`),
  });

  const replyMutation = useMutation({
    mutationFn: (content: string) =>
      api.post<TicketMessage>(`/admin/tickets/${params.id}/messages`, { content }),
    onSuccess: () => {
      setReplyContent('');
      toast.success(t('reply_sent'));
      queryClient.invalidateQueries({ queryKey: ['admin', 'ticket', params.id] });
    },
    onError: (err: Error) => toast.error(err.message || t('reply_failed')),
  });

  const noteMutation = useMutation({
    mutationFn: (content: string) =>
      api.post<InternalNote>(`/admin/tickets/${params.id}/notes`, { content }),
    onSuccess: () => {
      setNoteContent('');
      toast.success(t('internal_note_added'));
      queryClient.invalidateQueries({ queryKey: ['admin', 'ticket', params.id, 'notes'] });
    },
    onError: (err: Error) => toast.error(err.message || t('internal_note_failed')),
  });

  const statusMutation = useMutation({
    mutationFn: (status: TicketStatus) =>
      api.patch<SupportTicket>(`/admin/tickets/${params.id}`, { status }),
    // Optimistic: the status <select> shows the new value immediately rather than
    // snapping back to the stale cached status until the refetch lands.
    onMutate: async (status) => {
      await queryClient.cancelQueries({ queryKey: ['admin', 'ticket', params.id] });
      const prev = queryClient.getQueryData<AdminTicketDetail>(['admin', 'ticket', params.id]);
      queryClient.setQueryData<AdminTicketDetail>(['admin', 'ticket', params.id], (old) =>
        old ? { ...old, ticket: { ...old.ticket, status } } : old,
      );
      return { prev };
    },
    onSuccess: () => toast.success(t('status_updated')),
    onError: (err: Error, _v, ctx) => {
      if (ctx?.prev) queryClient.setQueryData(['admin', 'ticket', params.id], ctx.prev);
      toast.error(err.message || t('status_update_failed'));
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: ['admin', 'ticket', params.id] }),
  });

  const handleReply = (e: React.FormEvent) => {
    e.preventDefault();
    if (!replyContent.trim()) return;
    replyMutation.mutate(replyContent.trim());
  };

  const handleNote = (e: React.FormEvent) => {
    e.preventDefault();
    if (!noteContent.trim()) return;
    noteMutation.mutate(noteContent.trim());
  };

  // Notes are interleaved with the customer-visible messages so an agent reads
  // the ticket in the order it actually happened.
  const thread: ThreadEntry[] = React.useMemo(() => {
    const entries: ThreadEntry[] = [
      ...(data?.messages ?? []).map((message) => ({ message, isNote: false })),
      ...(notes ?? []).map((message) => ({ message, isNote: true })),
    ];
    return entries.sort((a, b) => time(a.message.createdAt) - time(b.message.createdAt));
  }, [data?.messages, notes]);

  if (isLoading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-brand-600" />
      </div>
    );
  }

  if (error || !data?.ticket) {
    return (
      <div className="flex h-64 flex-col items-center justify-center gap-3 text-stone-500">
        <AlertCircle className="h-8 w-8" />
        <p>{t('ticket_not_found')}</p>
        <Link href="/admin/tickets">
          <Button variant="secondary" size="sm">
            {t('back_to_tickets')}
          </Button>
        </Link>
      </div>
    );
  }

  const { ticket } = data;

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <button
        onClick={() => router.push('/admin/tickets')}
        className="inline-flex items-center gap-1.5 text-sm font-medium text-stone-600 hover:text-stone-900 dark:text-stone-400 dark:hover:text-white"
      >
        <ArrowLeft className="h-4 w-4" />
        {t('back_to_tickets')}
      </button>

      {/* Ticket header */}
      <Card>
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="space-y-3">
            <h1 className="text-2xl font-bold text-stone-900 dark:text-white">
              {ticket.subject}
            </h1>
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="default">{ts(`categoryLabels.${ticket.category}`)}</Badge>
              <Badge variant={priorityVariant[ticket.priority] || 'default'}>
                {ts(`priorityLabels.${ticket.priority}`)}
              </Badge>
              <Badge variant={statusVariant[ticket.status] || 'default'}>
                {ts(`statusLabels.${ticket.status}`)}
              </Badge>
            </div>
            <div className="text-xs text-stone-500 dark:text-stone-400">
              <p>
                {t('from')}{' '}
                <span className="font-medium text-stone-700 dark:text-stone-300">
                  {ticket.userDisplayName || ticket.userEmail}
                </span>{' '}
                ({ticket.userEmail})
              </p>
              <p className="mt-0.5">
                {t('created')} {formatDate(ticket.createdAt)}
              </p>
            </div>
          </div>

          {/* Status control */}
          <div className="space-y-1.5">
            <label
              htmlFor="ticket-status"
              className="block text-xs font-medium text-stone-500 dark:text-stone-400"
            >
              {t('status')}
            </label>
            <select
              id="ticket-status"
              value={ticket.status}
              onChange={(e) => statusMutation.mutate(e.target.value as TicketStatus)}
              disabled={statusMutation.isPending}
              className="input-field text-sm capitalize"
            >
              {STATUS_OPTIONS.map((status) => (
                <option key={status} value={status}>
                  {ts(`statusLabels.${status}`)}
                </option>
              ))}
            </select>
          </div>
        </div>
      </Card>

      {/* Message thread */}
      <div className="space-y-4">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-stone-500 dark:text-stone-400">
          {t('messages')}
        </h2>

        {/* Notes load separately, so say so when they fail rather than letting
            the thread imply this ticket simply has none. */}
        {notesError && (
          <Card className="border-amber-300 dark:border-amber-700/60">
            <p className="text-sm text-amber-700 dark:text-amber-500">{t('error_loading')}</p>
          </Card>
        )}

        {thread.length > 0 ? (
          <div className="space-y-4">
            {thread.map(({ message: msg, isNote }) => {
              const isAdmin = msg.authorRole === 'admin';

              // An internal note is deliberately NOT a chat bubble: it is a
              // flat, dashed, amber block spanning the thread so it can never
              // be mistaken for something the customer can read.
              if (isNote) {
                return (
                  <div
                    key={msg.id}
                    className="rounded-xl border border-dashed border-amber-400 bg-amber-50 px-4 py-3 dark:border-amber-600/70 dark:bg-amber-950/20"
                  >
                    <div className="mb-1.5 flex flex-wrap items-center gap-2">
                      <Lock
                        className="h-4 w-4 text-amber-700 dark:text-amber-500"
                        aria-hidden="true"
                      />
                      <Badge variant="warning" size="sm">
                        {t('internal_note_badge')}
                      </Badge>
                      <span className="text-sm font-semibold text-stone-900 dark:text-white">
                        {msg.authorName}
                      </span>
                    </div>
                    <p className="whitespace-pre-wrap text-sm text-stone-700 dark:text-stone-300">
                      {msg.content}
                    </p>
                    <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
                      <span className="text-xs font-medium text-amber-700 dark:text-amber-500">
                        {t('internal_note_hidden_from_customer')}
                      </span>
                      <span className="text-xs text-stone-400 dark:text-stone-500">
                        {formatDate(msg.createdAt)}
                      </span>
                    </div>
                  </div>
                );
              }

              return (
                <div
                  key={msg.id}
                  className={`flex gap-3 ${isAdmin ? 'flex-row-reverse' : 'flex-row'}`}
                >
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
                      <UserIcon className="h-5 w-5" />
                    )}
                  </div>

                  <div
                    className={`max-w-[75%] rounded-xl px-4 py-3 ${
                      isAdmin
                        ? 'rounded-se-none bg-brand-50 dark:bg-brand-950/30'
                        : 'rounded-ss-none bg-stone-100 dark:bg-stone-700'
                    }`}
                  >
                    <div className="mb-1 flex items-center gap-2">
                      <span className="text-sm font-semibold text-stone-900 dark:text-white">
                        {msg.authorName}
                      </span>
                      {isAdmin && (
                        <Badge variant="brand" size="sm">
                          {t('support_badge')}
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
            <p className="text-sm text-stone-500 dark:text-stone-400">{t('no_messages')}</p>
          </Card>
        )}
      </div>

      {/* Reply form */}
      <Card>
        <form onSubmit={handleReply} className="space-y-4">
          <div className="space-y-1.5">
            <label
              htmlFor="admin-reply"
              className="block text-sm font-medium text-stone-700 dark:text-stone-300"
            >
              {t('reply_to_customer')}
            </label>
            <textarea
              id="admin-reply"
              value={replyContent}
              onChange={(e) => setReplyContent(e.target.value)}
              placeholder={t('reply_placeholder')}
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
              {t('send_reply')}
            </Button>
          </div>
        </form>
      </Card>

      {/* Internal note form — kept visually separate from the reply form so an
          agent cannot mistake one box for the other. */}
      <Card className="border-amber-300 dark:border-amber-700/60">
        <form onSubmit={handleNote} className="space-y-4">
          <div className="space-y-1.5">
            <label
              htmlFor="admin-internal-note"
              className="flex items-center gap-2 text-sm font-medium text-stone-700 dark:text-stone-300"
            >
              <Lock className="h-4 w-4 text-amber-700 dark:text-amber-500" aria-hidden="true" />
              {t('add_internal_note')}
            </label>
            <p
              id="admin-internal-note-hint"
              className="text-xs font-medium text-amber-700 dark:text-amber-500"
            >
              {t('internal_note_hidden_from_customer')}
            </p>
            <textarea
              id="admin-internal-note"
              aria-describedby="admin-internal-note-hint"
              value={noteContent}
              onChange={(e) => setNoteContent(e.target.value)}
              placeholder={t('internal_note_placeholder')}
              rows={3}
              className="input-field w-full resize-y"
              required
            />
          </div>
          <div className="flex justify-end">
            <Button
              type="submit"
              variant="secondary"
              loading={noteMutation.isPending}
              disabled={!noteContent.trim()}
              icon={<Lock className="h-4 w-4" />}
            >
              {t('save_internal_note')}
            </Button>
          </div>
        </form>
      </Card>
    </div>
  );
}
