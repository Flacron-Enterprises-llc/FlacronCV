'use client';

import { useTranslations } from 'next-intl';
import { useMutation } from '@tanstack/react-query';
import { useAuth } from '@/providers/AuthProvider';
import { api } from '@/lib/api';
import Button from '@/components/ui/Button';
import { AlertTriangle, ExternalLink } from 'lucide-react';
import { toast } from 'sonner';
import { DELINQUENT_STATUSES, SubscriptionStatus } from '@flacroncv/shared-types';

/**
 * Shown across the dashboard when the user's subscription payment is failing
 * (past_due / unpaid / incomplete). The generic "upgrade to Pro" banner is
 * suppressed for paid plans, so without this a delinquent customer gets no
 * prompt to fix their card before their paid access lapses at period end.
 */
export default function DunningBanner() {
  const t = useTranslations('dunning');
  const { user } = useAuth();

  const portal = useMutation({
    mutationFn: () =>
      api.post<{ url: string }>('/payments/create-portal-session', {
        returnUrl: `${window.location.origin}/settings/billing`,
      }),
    onSuccess: (data) => {
      window.location.href = data.url;
    },
    onError: (e: Error) => toast.error(e.message || t('error')),
  });

  const status = user?.subscription?.status as SubscriptionStatus | undefined;
  if (!status || !DELINQUENT_STATUSES.includes(status)) return null;

  return (
    <div
      role="alert"
      className="mb-6 flex flex-col gap-3 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 dark:border-amber-800/60 dark:bg-amber-900/20 sm:flex-row sm:items-center sm:justify-between"
    >
      <div className="flex items-start gap-3">
        <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-500" />
        <div>
          <p className="text-sm font-semibold text-amber-800 dark:text-amber-300">{t('title')}</p>
          <p className="text-sm text-amber-700 dark:text-amber-400">{t('desc')}</p>
        </div>
      </div>
      <Button
        variant="outline"
        size="sm"
        className="shrink-0 border-amber-400 text-amber-700 hover:bg-amber-100 dark:border-amber-600 dark:text-amber-300"
        onClick={() => portal.mutate()}
        loading={portal.isPending}
        icon={<ExternalLink className="h-4 w-4" />}
      >
        {t('cta')}
      </Button>
    </div>
  );
}
