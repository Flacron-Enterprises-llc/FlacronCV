'use client';
import React from 'react';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { useRouter } from '@/i18n/routing';
import { useAuth } from '@/providers/AuthProvider';
import { useMutation } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { toast } from 'sonner';
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

const categoryOptions: { value: TicketCategory; label: string }[] = [
  { value: TicketCategory.GENERAL, label: 'General' },
  { value: TicketCategory.BUG, label: 'Bug Report' },
  { value: TicketCategory.FEATURE_REQUEST, label: 'Feature Request' },
  { value: TicketCategory.BILLING, label: 'Billing' },
  { value: TicketCategory.ACCOUNT, label: 'Account' },
];

const priorityOptions: { value: TicketPriority; label: string }[] = [
  { value: TicketPriority.LOW, label: 'Low' },
  { value: TicketPriority.MEDIUM, label: 'Medium' },
  { value: TicketPriority.HIGH, label: 'High' },
  { value: TicketPriority.URGENT, label: 'Urgent' },
];

export default function NewSupportTicketPage(): React.JSX.Element | null {
  const t = useTranslations('support');
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
      toast.error(error.message || t('ticketCreateError'));
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (!subject.trim()) {
      toast.error(t('subjectRequired'));
      return;
    }

    if (!message.trim()) {
      toast.error(t('messageRequired'));
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
    <div className="mx-auto max-w-2xl space-y-6 p-4 sm:p-6 lg:p-8">
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
                {categoryOptions.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
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
                {priorityOptions.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
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
              className="input-field w-full resize-y"
              required
            />
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
