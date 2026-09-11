'use client';

import { useTranslations } from 'next-intl';
import { AlertCircle } from 'lucide-react';
import Button from '@/components/ui/Button';

/**
 * Escape hatch when account sync never finishes (placeholderAccount stuck).
 * Admin/CRM shells used to spin forever in that state.
 */
export default function AccountSyncError({
  onRetry,
  onSignOut,
  retrying,
}: {
  onRetry: () => void;
  onSignOut: () => void;
  retrying?: boolean;
}) {
  const t = useTranslations('dashboard');
  const tNav = useTranslations('nav');

  return (
    <div className="flex h-screen flex-col items-center justify-center gap-4 px-4 text-center">
      <AlertCircle className="h-10 w-10 text-danger-400 dark:text-danger-500" />
      <h1 className="text-lg font-semibold text-stone-900 dark:text-white">
        {t('degraded_title')}
      </h1>
      <p className="max-w-md text-sm text-stone-500 dark:text-stone-400">
        {t('degraded_desc')}
      </p>
      <div className="flex flex-wrap items-center justify-center gap-2">
        <Button variant="secondary" onClick={onRetry} loading={retrying}>
          {t('degraded_retry')}
        </Button>
        <Button variant="ghost" onClick={onSignOut}>
          {tNav('logout')}
        </Button>
      </div>
    </div>
  );
}
