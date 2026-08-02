'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/routing';
import { setAnalyticsConsent } from '@/lib/analytics';

const CONSENT_KEY = 'cookie_consent';

/**
 * GDPR cookie-consent banner. Shows once until the visitor decides, then
 * persists the choice and flips the analytics consent gate
 * ({@link setAnalyticsConsent}) — analytics stays a no-op until "Accept".
 */
export default function CookieConsent() {
  const t = useTranslations('cookie_consent');
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    try {
      setVisible(window.localStorage.getItem(CONSENT_KEY) === null);
    } catch {
      // storage blocked (private mode) — don't nag
    }
  }, []);

  const decide = (accepted: boolean) => {
    try {
      window.localStorage.setItem(CONSENT_KEY, accepted ? 'accepted' : 'declined');
    } catch {
      /* ignore */
    }
    setAnalyticsConsent(accepted);
    setVisible(false);
  };

  if (!visible) return null;

  return (
    <div
      role="region"
      aria-label={t('aria_label')}
      className="fixed inset-x-0 bottom-0 z-[90] border-t border-stone-200 bg-white/95 p-4 shadow-lg backdrop-blur motion-safe:animate-fade-in dark:border-stone-700 dark:bg-stone-900/95"
    >
      <div className="mx-auto flex max-w-5xl flex-col items-start gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-stone-600 dark:text-stone-300">
          {t('message')}{' '}
          <Link
            href="/cookie-policy"
            className="font-medium text-brand-600 underline underline-offset-2 hover:text-brand-700 dark:text-brand-400"
          >
            {t('learn_more')}
          </Link>
        </p>
        <div className="flex flex-shrink-0 gap-2">
          <button
            type="button"
            onClick={() => decide(false)}
            className="rounded-lg border border-stone-300 px-4 py-2 text-sm font-medium text-stone-700 transition-colors hover:bg-stone-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 dark:border-stone-600 dark:text-stone-300 dark:hover:bg-stone-800"
          >
            {t('decline')}
          </button>
          <button
            type="button"
            onClick={() => decide(true)}
            className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-brand-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2"
          >
            {t('accept')}
          </button>
        </div>
      </div>
    </div>
  );
}
