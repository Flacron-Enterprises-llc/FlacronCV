'use client';

import { useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/routing';
import { api } from '@/lib/api';
import { CheckCircle2, XCircle, Loader2 } from 'lucide-react';

export default function ConfirmClient() {
  const t = useTranslations('lead_confirm');
  const params = useSearchParams();
  const token = params.get('token');
  const [state, setState] = useState<'loading' | 'ok' | 'fail'>('loading');

  useEffect(() => {
    if (!token) {
      setState('fail');
      return;
    }
    let active = true;
    api
      .get<{ confirmed: boolean }>(`/leads/confirm?token=${encodeURIComponent(token)}`)
      .then((r) => active && setState(r.confirmed ? 'ok' : 'fail'))
      .catch(() => active && setState('fail'));
    return () => {
      active = false;
    };
  }, [token]);

  return (
    <div
      role="status"
      aria-live="polite"
      className="mx-auto flex max-w-md flex-col items-center px-4 py-24 text-center"
    >
      {state === 'loading' && (
        <>
          <Loader2 className="h-10 w-10 animate-spin text-brand-600" />
          <p className="mt-4 text-stone-600 dark:text-stone-400">{t('loading')}</p>
        </>
      )}
      {state === 'ok' && (
        <>
          <CheckCircle2 className="h-12 w-12 text-emerald-500" />
          <h1 className="mt-4 text-2xl font-bold text-stone-900 dark:text-white">{t('ok_title')}</h1>
          <p className="mt-2 text-stone-600 dark:text-stone-400">{t('ok_desc')}</p>
        </>
      )}
      {state === 'fail' && (
        <>
          <XCircle className="h-12 w-12 text-red-500" />
          <h1 className="mt-4 text-2xl font-bold text-stone-900 dark:text-white">{t('fail_title')}</h1>
          <p className="mt-2 text-stone-600 dark:text-stone-400">{t('fail_desc')}</p>
        </>
      )}
      {state !== 'loading' && (
        <Link
          href="/"
          className="mt-6 rounded-lg bg-brand-600 px-5 py-2 text-sm font-semibold text-white transition-colors hover:bg-brand-700"
        >
          {t('home')}
        </Link>
      )}
    </div>
  );
}
