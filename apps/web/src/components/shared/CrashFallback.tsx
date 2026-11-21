'use client';

import { useTranslations } from 'next-intl';
import { AlertTriangle, Home, RotateCcw } from 'lucide-react';
import { Link } from '@/i18n/routing';
import { cn } from '@/lib/utils';

/**
 * What a person sees when a page crashes: a calm explanation, "Try again"
 * (re-renders the failed part) and a way home. Used by the route-level
 * error.tsx and by the in-app ErrorBoundary.
 */
export default function CrashFallback({ onRetry, fullPage = false, digest }: { onRetry: () => void; fullPage?: boolean; digest?: string }) {
  const t = useTranslations('error_boundary');
  const tNotFound = useTranslations('not_found');
  return (
    <div
      role="alert"
      className={cn('flex flex-col items-center justify-center px-6 py-16 text-center', fullPage ? 'min-h-[70vh]' : 'min-h-[400px]')}
    >
      <span className="flex h-20 w-20 items-center justify-center rounded-full bg-brand-50 text-brand-600 ring-8 ring-brand-50/50 dark:bg-brand-950 dark:text-brand-400 dark:ring-brand-950/30">
        <AlertTriangle className="h-9 w-9" aria-hidden="true" />
      </span>
      <h2 className="mt-6 text-2xl font-black tracking-tight text-navy dark:text-white">{t('title')}</h2>
      <p className="mt-2 max-w-md text-[15px] leading-relaxed text-stone-600 dark:text-stone-400">{t('message')}</p>
      <div className="mt-8 flex w-full max-w-xs flex-col gap-3 sm:max-w-none sm:flex-row sm:justify-center">
        <button
          type="button"
          onClick={onRetry}
          className="inline-flex h-12 items-center justify-center gap-2 rounded-full bg-brand-600 px-7 text-[15px] font-semibold text-white shadow-lg shadow-brand-600/25 transition-colors hover:bg-brand-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-stone-950"
        >
          <RotateCcw className="h-4 w-4" aria-hidden="true" />
          {t('retry')}
        </button>
        <Link
          href="/"
          className="inline-flex h-12 items-center justify-center gap-2 rounded-full border border-stone-300 bg-white px-7 text-[15px] font-semibold text-stone-800 transition-colors hover:bg-stone-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2 dark:border-stone-700 dark:bg-stone-900 dark:text-stone-100 dark:hover:bg-stone-800 dark:focus-visible:ring-offset-stone-950"
        >
          <Home className="h-4 w-4" aria-hidden="true" />
          {tNotFound('btn_home')}
        </Link>
      </div>
      {digest ? (
        // A reference support can match to the server log; not secret, no details of the error.
        <p className="mt-6 font-mono text-xs text-stone-400" dir="ltr">
          Ref: {digest}
        </p>
      ) : null}
    </div>
  );
}
