'use client';
import React from 'react';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { Link, useRouter } from '@/i18n/routing';
import { api } from '@/lib/api';
import Card from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import Badge from '@/components/ui/Badge';
import Modal from '@/components/ui/Modal';
import {
  Plus,
  Mail,
  Trash2,
  Copy,
  Building2,
  Briefcase,
  Loader2,
  AlertTriangle,
} from 'lucide-react';
import { CoverLetter, PLAN_CONFIGS, resolveEffectivePlan } from '@flacroncv/shared-types';
import { formatDate } from '@/lib/utils';
import { toast } from 'sonner';
import { useAuth } from '@/providers/AuthProvider';

export default function CoverLettersPage(): React.JSX.Element | null {
  const t = useTranslations();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const letterLimit = PLAN_CONFIGS[resolveEffectivePlan(user?.subscription)].limits.coverLetters;
  const lettersCreated = user?.usage?.coverLettersCreated ?? 0;
  const atLimit = letterLimit !== 'unlimited' && lettersCreated >= letterLimit;

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['cover-letters'],
    queryFn: () => api.get<{ items: CoverLetter[] }>('/cover-letters?limit=100'),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/cover-letters/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['cover-letters'] });
      toast.success(t('coverLetters.deleted'));
      setDeleteId(null);
    },
    onError: (error: Error) => {
      toast.error(error.message);
    },
  });

  const duplicateMutation = useMutation({
    mutationFn: (id: string) => api.post(`/cover-letters/${id}/duplicate`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['cover-letters'] });
      toast.success(t('coverLetters.duplicated'));
    },
    onError: () => {
      toast.error(t('coverLetters.duplicate_failed'));
    },
  });

  const coverLetters = data?.items || [];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-stone-900 dark:text-white">
          {t('coverLetters.title')}
        </h1>
        <Link href="/cover-letters/new">
          <Button icon={<Plus className="h-4 w-4" />}>{t('coverLetters.create')}</Button>
        </Link>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-12" role="status" aria-label={t('common.loading')}>
          <Loader2 className="h-8 w-8 animate-spin text-brand-600" />
        </div>
      ) : isError ? (
        <Card className="py-16 text-center">
          <AlertTriangle className="mx-auto h-12 w-12 text-amber-400" />
          <h3 className="mt-4 text-lg font-semibold text-stone-900 dark:text-white">
            {t('coverLetters.list_error_title')}
          </h3>
          <p className="mt-2 text-sm text-stone-500">{t('coverLetters.list_error_desc')}</p>
          <Button className="mt-6" variant="secondary" onClick={() => refetch()}>
            {t('coverLetters.retry')}
          </Button>
        </Card>
      ) : coverLetters.length === 0 ? (
        <Card className="py-16 text-center">
          <Mail className="mx-auto h-12 w-12 text-stone-300 dark:text-stone-600" />
          <h3 className="mt-4 text-lg font-semibold text-stone-900 dark:text-white">
            {t('coverLetters.empty_title')}
          </h3>
          <p className="mt-2 text-sm text-stone-500">{t('coverLetters.empty_description')}</p>
          <Link href="/cover-letters/new">
            <Button className="mt-6" icon={<Plus className="h-4 w-4" />}>
              {t('coverLetters.create')}
            </Button>
          </Link>
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {coverLetters.map((cl) => (
            <CoverLetterCard
              key={cl.id}
              coverLetter={cl}
              onDelete={() => setDeleteId(cl.id)}
              onDuplicate={() => duplicateMutation.mutate(cl.id)}
              duplicating={duplicateMutation.isPending && duplicateMutation.variables === cl.id}
            />
          ))}
        </div>
      )}

      {/* Delete confirmation modal */}
      <Modal
        isOpen={!!deleteId}
        onClose={() => setDeleteId(null)}
        title={t('coverLetters.delete_confirm_title')}
        size="sm"
      >
        <p className="text-sm text-stone-600 dark:text-stone-400">
          {t('coverLetters.delete_confirm_message')}
        </p>
        {atLimit && (
          <p className="mt-2 text-sm text-stone-600 dark:text-stone-400">
            {t('coverLetters.delete_confirm_no_allowance')}
          </p>
        )}
        <div className="mt-6 flex justify-end gap-3">
          <Button variant="secondary" onClick={() => setDeleteId(null)}>
            {t('common.cancel')}
          </Button>
          <Button
            variant="danger"
            loading={deleteMutation.isPending}
            onClick={() => deleteId && deleteMutation.mutate(deleteId)}
          >
            {t('common.delete')}
          </Button>
        </div>
      </Modal>
    </div>
  );
}

function CoverLetterCard({
  coverLetter,
  onDelete,
  onDuplicate,
  duplicating,
}: {
  coverLetter: CoverLetter;
  onDelete: () => void;
  onDuplicate: () => void;
  duplicating?: boolean;
}) {
  const router = useRouter();
  const t = useTranslations('coverLetters');
  const statusLabel = coverLetter.status === 'final' ? t('status_final') : t('status_draft');

  return (
    <Card hover padding="none" className="group overflow-hidden">
      {/* Clickable preview area */}
      <button
        className="relative flex h-40 w-full items-center justify-center bg-gradient-to-br from-brand-50 to-brand-100 dark:from-stone-800 dark:to-stone-900"
        onClick={() => router.push(`/cover-letters/${coverLetter.id}`)}
        aria-label={t('card_open', { title: coverLetter.title })}
      >
        <div className="w-24 rounded border border-stone-200 bg-white p-2 shadow-sm dark:border-stone-600 dark:bg-stone-700">
          <div className="mb-1 h-1 w-10 rounded bg-stone-300 dark:bg-stone-500" />
          <div className="mb-2 h-px w-full bg-brand-400" />
          <div className="space-y-0.5">
            <div className="h-1 w-full rounded bg-stone-200 dark:bg-stone-500" />
            <div className="h-1 w-full rounded bg-stone-200 dark:bg-stone-500" />
            <div className="h-1 w-4/5 rounded bg-stone-200 dark:bg-stone-500" />
            <div className="h-1 w-full rounded bg-stone-200 dark:bg-stone-500" />
            <div className="h-1 w-3/5 rounded bg-stone-200 dark:bg-stone-500" />
          </div>
          <div className="mt-2 h-1 w-8 rounded bg-stone-300 dark:bg-stone-500" />
        </div>
        <div className="absolute inset-0 flex items-center justify-center bg-black/0 transition-all group-hover:bg-black/20">
          <span className="flex items-center gap-1.5 rounded-lg bg-white px-3 py-1.5 text-sm font-medium text-stone-800 opacity-0 shadow transition-opacity group-hover:opacity-100">
            {t('card_open_editor')}
          </span>
        </div>
      </button>

      {/* Info */}
      <div className="p-4">
        <div className="mb-2 min-w-0">
          <h3 className="truncate font-semibold text-stone-900 dark:text-white">{coverLetter.title}</h3>
          {coverLetter.companyName && (
            <p className="mt-0.5 flex items-center gap-1 text-xs text-stone-500">
              <Building2 className="h-3 w-3" />
              {coverLetter.companyName}
            </p>
          )}
          {coverLetter.jobTitle && (
            <p className="mt-0.5 flex items-center gap-1 text-xs text-stone-500">
              <Briefcase className="h-3 w-3" />
              {coverLetter.jobTitle}
            </p>
          )}
          {/* Both dates, not just "Updated". `formatDate` now understands the
              Firestore `_seconds` timestamp shape, which is why these rendered
              as a bare "Updated" with no date before. */}
          <p className="mt-1 text-xs text-stone-400">
            {t('card_created', { date: formatDate(coverLetter.createdAt) })}
          </p>
          <p className="text-xs text-stone-400">
            {t('card_updated', { date: formatDate(coverLetter.updatedAt) })}
          </p>
        </div>

        <div className="mb-3 flex flex-wrap items-center gap-2">
          <Badge variant={coverLetter.status === 'final' ? 'success' : 'default'}>
            {statusLabel}
          </Badge>
          {coverLetter.aiGenerated && <Badge variant="brand">AI</Badge>}
          {coverLetter.linkedCVId && (
            <Badge variant="info">{t('card_linked_cv')}</Badge>
          )}
        </div>

        {/* Action buttons */}
        <div className="flex items-center gap-2">
          <button
            className="flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-stone-200 py-1.5 text-sm font-medium text-stone-700 hover:border-brand-400 hover:text-brand-600 dark:border-stone-700 dark:text-stone-300 dark:hover:border-brand-500 dark:hover:text-brand-400"
            onClick={() => router.push(`/cover-letters/${coverLetter.id}`)}
          >
            {t('card_edit')}
          </button>
          <button
            className="flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-stone-200 py-1.5 text-sm font-medium text-stone-700 hover:border-stone-300 disabled:opacity-50 dark:border-stone-700 dark:text-stone-300"
            onClick={onDuplicate}
            disabled={duplicating}
          >
            {duplicating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Copy className="h-3.5 w-3.5" />} {t('card_duplicate')}
          </button>
          <button
            className="flex items-center justify-center rounded-lg border border-stone-200 p-1.5 text-stone-400 hover:border-red-300 hover:bg-red-50 hover:text-red-600 dark:border-stone-700 dark:hover:border-red-700 dark:hover:bg-red-900/20 dark:hover:text-red-400"
            onClick={onDelete}
            aria-label={t('card_delete')}
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      </div>
    </Card>
  );
}
