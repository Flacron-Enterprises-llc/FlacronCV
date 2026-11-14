'use client';
import React from 'react';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { useRouter } from '@/i18n/routing';
import { useAuth } from '@/providers/AuthProvider';
import { useMutation } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { toast } from 'sonner';
import { useApiErrorMessage } from '@/hooks/useApiErrorMessage';
import Button from '@/components/ui/Button';
import Card from '@/components/ui/Card';
import Input from '@/components/ui/Input';
import { ArrowLeft, Send } from 'lucide-react';
import { Link } from '@/i18n/routing';
import {
  SupportTicket,
  CreateTicketData,
  TicketCategory,
  TicketPriority,
} from '@flacroncv/shared-types';

const CATEGORY_VALUES: TicketCategory[] = [
  TicketCategory.GENERAL,
  TicketCategory.BUG,
  TicketCategory.FEATURE_REQUEST,
  TicketCategory.BILLING,
  TicketCategory.ACCOUNT,
];

/** Must match CreateTicketDto's @MaxLength limits on the API. */
const SUBJECT_MAX = 200;
const MESSAGE_MAX = 5000;

const PRIORITY_VALUES: TicketPriority[] = [
  TicketPriority.LOW,
  TicketPriority.MEDIUM,
  TicketPriority.HIGH,
  TicketPriority.URGENT,
];

export default function NewSupportTicketPage(): React.JSX.Element | null {
  const t = useTranslations('support');
  const formatApiError = useApiErrorMessage();
  const router = useRouter();
  const { user } = useAuth();

  const [subject, setSubject] = useState('');
  const [category, setCategory] = useState<TicketCategory>(TicketCategory.GENERAL);
  const [priority, setPriority] = useState<TicketPriority>(TicketPriority.MEDIUM);
  const [message, setMessage] = useState('');

  const createTicket = useMutation({
    mutationFn: (data: CreateTicketData) =>
      api.post<SupportTicket>('/support/tickets', data),
    onSuccess: (ticket) => {
      toast.success(t('ticketCreated'));
      router.push(`/support/${ticket.id}`);
    },
    onError: (error: Error) => {
      toast.error(formatApiError(error, t('ticketCreateError')));
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    // Validated here, in the user's language, against the same limits as the
    // API. Previously an over-long subject reached the server and came back as
    // its raw English validation message.
    if (!subject.trim()) {
      toast.error(t('subjectRequired'));
      return;
    }
    if (subject.trim().length > SUBJECT_MAX) {
      toast.error(t('subjectTooLong', { max: SUBJECT_MAX }));
      return;
    }

    if (!message.trim()) {
      toast.error(t('messageRequired'));
      return;
    }
    if (message.trim().length > MESSAGE_MAX) {
      toast.error(t('messageTooLong', { max: MESSAGE_MAX }));
      return;
    }

    createTicket.mutate({
      subject: subject.trim(),
      category,
      priority,
      message: message.trim(),
    });
  };

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div className="flex items-center gap-3">
        <Link href="/support">
          <Button variant="ghost" size="sm" icon={<ArrowLeft className="h-4 w-4" />}>
            {t('back')}
          </Button>
        </Link>
        <div>
          <h1 className="text-2xl font-bold text-stone-900 dark:text-white">
            {t('newTicketTitle')}
          </h1>
          <p className="mt-1 text-sm text-stone-500 dark:text-stone-400">
            {t('newTicketDescription')}
          </p>
        </div>
      </div>

      <Card>
        <form onSubmit={handleSubmit} className="space-y-5">
          <Input
            id="subject"
            label={t('subjectLabel')}
            placeholder={t('subjectPlaceholder')}
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            maxLength={SUBJECT_MAX}
            hint={t('charCount', { count: subject.length, max: SUBJECT_MAX })}
            required
          />

          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
            <div className="space-y-1.5">
              <label
                htmlFor="category"
                className="block text-sm font-medium text-stone-700 dark:text-stone-300"
              >
                {t('categoryLabel')}
              </label>
              <select
                id="category"
                value={category}
                onChange={(e) => setCategory(e.target.value as TicketCategory)}
                className="input-field w-full"
              >
                {CATEGORY_VALUES.map((value) => (
                  <option key={value} value={value}>
                    {t(`categoryLabels.${value}`)}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-1.5">
              <label
                htmlFor="priority"
                className="block text-sm font-medium text-stone-700 dark:text-stone-300"
              >
                {t('priorityLabel')}
              </label>
              <select
                id="priority"
                value={priority}
                onChange={(e) => setPriority(e.target.value as TicketPriority)}
                className="input-field w-full"
              >
                {PRIORITY_VALUES.map((value) => (
                  <option key={value} value={value}>
                    {t(`priorityLabels.${value}`)}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="space-y-1.5">
            <label
              htmlFor="message"
              className="block text-sm font-medium text-stone-700 dark:text-stone-300"
            >
              {t('messageLabel')}
            </label>
            <textarea
              id="message"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder={t('messagePlaceholder')}
              rows={8}
              maxLength={MESSAGE_MAX}
              aria-describedby="message-count"
              className="input-field w-full resize-y"
              required
            />
            <p id="message-count" className="text-end text-xs text-stone-500 dark:text-stone-400">
              {t('charCount', { count: message.length, max: MESSAGE_MAX })}
            </p>
          </div>

          <div className="flex justify-end">
            <Button
              type="submit"
              loading={createTicket.isPending}
              icon={<Send className="h-4 w-4" />}
            >
              {t('submitTicket')}
            </Button>
          </div>
        </form>
      </Card>
    </div>
  );
}
