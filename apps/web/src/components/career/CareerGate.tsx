'use client';

import type { ReactNode } from 'react';
import { useTranslations } from 'next-intl';
import { Lock } from 'lucide-react';
import Card from '@/components/ui/Card';
import Skeleton from '@/components/ui/Skeleton';
import { Link } from '@/i18n/routing';
import { useCareerAccess } from './CareerServices';

/**
 * Shows the career area only when the career service says the person's V1
 * plan includes it. The server checks again on every request; this only
 * decides what to render. A failed check never grants access.
 */
export function CareerGate({ children }: { children: ReactNode }) {
  const t = useTranslations('career.gate');
  const access = useCareerAccess();

  if (access.isLoading) {
    return (
      <div className="space-y-3" aria-busy="true">
        <Skeleton className="h-8 w-1/3" />
        <Skeleton className="h-32 w-full" />
      </div>
    );
  }

  if (access.isError || !access.data) {
    return (
      <Card padding="lg" role="status">
        <h2 className="text-lg font-semibold text-stone-900 dark:text-white">{t('unreachable_title')}</h2>
        <p className="mt-2 text-sm text-stone-600 dark:text-stone-300">{t('unreachable_body')}</p>
      </Card>
    );
  }

  if (!access.data.enabled) {
    const reason = access.data.reason ?? 'plan_not_mapped';
    return (
      <Card padding="lg" role="status">
        <div className="flex items-start gap-3">
          <Lock className="mt-0.5 h-5 w-5 shrink-0 text-brand-600" aria-hidden="true" />
          <div>
            <h2 className="text-lg font-semibold text-stone-900 dark:text-white">{t('locked_title')}</h2>
            <p className="mt-2 text-sm text-stone-600 dark:text-stone-300">{t(`locked_${reason}`)}</p>
            <div className="mt-4 flex flex-wrap gap-3 text-sm font-semibold">
              <Link className="text-brand-700 underline-offset-2 hover:underline dark:text-brand-400" href="/career/plans">
                {t('see_plan')}
              </Link>
              <Link className="text-brand-700 underline-offset-2 hover:underline dark:text-brand-400" href="/career/data">
                {t('your_data')}
              </Link>
            </div>
          </div>
        </div>
      </Card>
    );
  }

  return <>{children}</>;
}
