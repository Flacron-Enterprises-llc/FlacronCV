'use client';
import React from 'react';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/routing';
import { api } from '@/lib/api';
import Card from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import { Plus, FileText, Trash2, Copy, Pencil, Sparkles, AlertTriangle } from 'lucide-react';
import Skeleton from '@/components/ui/Skeleton';
import { CV, PLAN_CONFIGS } from '@flacroncv/shared-types';
import { formatDate } from '@/lib/utils';
import { toast } from 'sonner';
import { useState } from 'react';
import { useRouter } from '@/i18n/routing';
import { useAuth } from '@/providers/AuthProvider';
import UpgradeModal from '@/components/shared/UpgradeModal';

export default function CVListPage(): React.JSX.Element | null {
  const t = useTranslations();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [showUpgrade, setShowUpgrade] = useState(false);

  const planLimits = PLAN_CONFIGS[user?.subscription?.plan ?? 'free'].limits;
  const cvLimit = planLimits.cvs;
  const cvsCreated = user?.usage?.cvsCreated ?? 0;
  const atLimit = cvLimit !== 'unlimited' && cvsCreated >= cvLimit;

  const { data, isLoading } = useQuery({
    queryKey: ['cvs'],
    queryFn: () => api.get<{ items: CV[] }>('/cvs'),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/cvs/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['cvs'] });
      toast.success('CV deleted');
      setConfirmDeleteId(null);
    },
    onError: () => {
      toast.error('Failed to delete CV. Please try again.');
      setConfirmDeleteId(null);
    },
  });

  const duplicateMutation = useMutation({
    mutationFn: (id: string) => api.post(`/cvs/${id}/duplicate`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['cvs'] });
      toast.success('CV duplicated');
    },
    onError: () => {
      toast.error('Failed to duplicate CV. Please try again.');
    },
  });

  const cvs = data?.items || [];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-stone-900 dark:text-white">{t('dashboard.my_cvs')}</h1>
        {atLimit ? (
          <Button icon={<Plus className="h-4 w-4" />} onClick={() => setShowUpgrade(true)}>
            {t('dashboard.create_cv')}
          </Button>
        ) : (
          <Link href="/cv/new">
            <Button icon={<Plus className="h-4 w-4" />}>{t('dashboard.create_cv')}</Button>
          </Link>
        )}
      </div>

      {isLoading ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3].map((i) => (
            <Card key={i} padding="none" className="overflow-hidden">
              <Skeleton className="h-40 w-full" rounded="sm" />
              <div className="space-y-2 p-4">
                <Skeleton className="h-5 w-3/4" />
                <Skeleton className="h-3 w-1/2" />
                <div className="flex gap-2 pt-1">
                  <Skeleton className="h-5 w-16" rounded="full" />
                  <Skeleton className="h-5 w-16" rounded="full" />
                </div>
              </div>
            </Card>
          ))}
        </div>
      ) : cvs.length === 0 ? (
        <Card className="py-16 text-center">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-brand-50 dark:bg-brand-950">
            <FileText className="h-8 w-8 text-brand-600" />
          </div>
          <h3 className="text-xl font-bold text-stone-900 dark:text-white">
            {t('common.create_your_first_cv')}
          </h3>
          <p className="mx-auto mt-2 max-w-sm text-sm text-stone-500">{t('dashboard.start_creating')}</p>
          <Link href="/cv/new">
            <Button variant="gradient" className="mt-6" size="lg" icon={<Sparkles className="h-5 w-5" />}>
              {t('common.get_started')}
            </Button>
          </Link>
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {cvs.map((cv) => (
            <CVCard
              key={cv.id}
              cv={cv}
              onDelete={() => setConfirmDeleteId(cv.id)}
              onDuplicate={() => duplicateMutation.mutate(cv.id)}
              duplicating={duplicateMutation.isPending}
            />
          ))}
        </div>
      )}

      <UpgradeModal
        isOpen={showUpgrade}
        onClose={() => setShowUpgrade(false)}
        reason="cvs"
      />

      {/* Delete confirmation modal */}
      {confirmDeleteId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-sm rounded-xl border border-stone-200 bg-white p-6 shadow-xl dark:border-stone-700 dark:bg-stone-900">
            <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-red-100 dark:bg-red-900/30">
              <AlertTriangle className="h-6 w-6 text-red-600 dark:text-red-400" />
            </div>
            <h3 className="text-lg font-semibold text-stone-900 dark:text-white">Delete CV?</h3>
            <p className="mt-2 text-sm text-stone-500 dark:text-stone-400">
              This action cannot be undone. The CV will be permanently deleted.
            </p>
            <div className="mt-6 flex gap-3">
              <Button
                variant="secondary"
                className="flex-1"
                onClick={() => setConfirmDeleteId(null)}
                disabled={deleteMutation.isPending}
              >
                Cancel
              </Button>
              <Button
                className="flex-1 !bg-red-600 hover:!bg-red-700"
                loading={deleteMutation.isPending}
                onClick={() => deleteMutation.mutate(confirmDeleteId)}
              >
                Delete
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function CVCard({
  cv,
  onDelete,
  onDuplicate,
  duplicating,
}: {
  cv: CV;
  onDelete: () => void;
  onDuplicate: () => void;
  duplicating?: boolean;
}) {
  const router = useRouter();

  return (
    <Card padding="none" className="group overflow-hidden transition-shadow hover:shadow-md">
      {/* Clickable preview area */}
      <button
        className="relative flex h-40 w-full items-center justify-center bg-gradient-to-br from-stone-50 to-stone-100 dark:from-stone-800 dark:to-stone-900"
        onClick={() => router.push(`/cv/${cv.id}`)}
        aria-label={`Open ${cv.title}`}
      >
        {/* Mini CV mockup */}
        <div className="w-24 rounded border border-stone-200 bg-white p-2 shadow-sm dark:border-stone-600 dark:bg-stone-700">
          <div className="mb-1 h-2 w-14 rounded bg-stone-800 dark:bg-stone-200" />
          <div className="mb-1 h-1 w-10 rounded bg-stone-300" />
          <div className="mb-2 h-px w-full bg-brand-400" />
          <div className="space-y-0.5">
            <div className="h-1 w-full rounded bg-stone-200 dark:bg-stone-500" />
            <div className="h-1 w-4/5 rounded bg-stone-200 dark:bg-stone-500" />
            <div className="h-1 w-3/5 rounded bg-stone-200 dark:bg-stone-500" />
          </div>
        </div>
        {/* Hover overlay */}
        <div className="absolute inset-0 flex items-center justify-center bg-black/0 transition-all group-hover:bg-black/20">
          <span className="flex items-center gap-1.5 rounded-lg bg-white px-3 py-1.5 text-sm font-medium text-stone-800 opacity-0 shadow transition-opacity group-hover:opacity-100">
            <Pencil className="h-3.5 w-3.5" /> Open Editor
          </span>
        </div>
      </button>

      {/* Info */}
      <div className="p-4">
        <div className="mb-3">
          <h3 className="truncate font-semibold text-stone-900 dark:text-white">{cv.title}</h3>
          <p className="mt-0.5 text-xs text-stone-500 dark:text-stone-400">
            Updated {formatDate(cv.updatedAt)}
          </p>
        </div>

        {/* Action buttons — always visible */}
        <div className="flex items-center gap-2">
          <button
            className="flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-stone-200 py-1.5 text-sm font-medium text-stone-700 hover:border-brand-400 hover:text-brand-600 dark:border-stone-700 dark:text-stone-300 dark:hover:border-brand-500 dark:hover:text-brand-400"
            onClick={() => router.push(`/cv/${cv.id}`)}
          >
            <Pencil className="h-3.5 w-3.5" /> Edit
          </button>
          <button
            className="flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-stone-200 py-1.5 text-sm font-medium text-stone-700 hover:border-stone-300 dark:border-stone-700 dark:text-stone-300"
            onClick={onDuplicate}
            disabled={duplicating}
          >
            <Copy className="h-3.5 w-3.5" /> Duplicate
          </button>
          <button
            className="flex items-center justify-center rounded-lg border border-stone-200 p-1.5 text-stone-400 hover:border-red-300 hover:bg-red-50 hover:text-red-600 dark:border-stone-700 dark:hover:border-red-700 dark:hover:bg-red-900/20 dark:hover:text-red-400"
            onClick={onDelete}
            aria-label="Delete CV"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      </div>
    </Card>
  );
}
