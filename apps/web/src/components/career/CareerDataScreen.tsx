'use client';

import { useState, type FormEvent } from 'react';
import { useTranslations } from 'next-intl';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { isApiError, type AccountExport, type ApiClient } from '@flacroncv/career-api-client';
import type { Locale } from '@flacroncv/career-shared';
import Button from '@/components/ui/Button';
import Card from '@/components/ui/Card';
import Input from '@/components/ui/Input';
import type { SignedInUser } from '@/lib/career/auth-gateway';
import { CAREER_ACCESS_QUERY_KEY } from './CareerServices';

const EXPORT_POLLS = 20;
const EXPORT_POLL_MS = 1500;

/**
 * Career data only. The V1 account, CVs, cover letters, Jobs tracker and
 * subscription are managed in V1 Settings and are not touched here. Export
 * and erase work whatever the V1 plan, so leaving a plan never traps data.
 */
export function CareerDataScreen({
  api,
  user,
  ready,
  signInHref,
  documentLocale,
  embedded = false,
}: {
  api: ApiClient;
  user: SignedInUser | null;
  ready: boolean;
  signInHref: string;
  documentLocale: Locale;
  /** Inside a page that already has the h1 (Settings): the title becomes a section heading. */
  embedded?: boolean;
}) {
  const t = useTranslations('career.data');
  const queryClient = useQueryClient();
  const [language, setLanguage] = useState<Locale>(documentLocale);
  const [exporting, setExporting] = useState(false);
  const [confirm, setConfirm] = useState('');
  const [erasing, setErasing] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  if (!ready) return null;
  if (!user) {
    return (
      <Card padding="lg">
        <p className="text-sm text-stone-600 dark:text-stone-300">{t('signed_out')}</p>
        <a className="mt-3 inline-block text-sm font-semibold text-brand-700 dark:text-brand-400" href={signInHref}>
          {t('sign_in')}
        </a>
      </Card>
    );
  }

  async function saveLanguage(next: Locale) {
    setLanguage(next);
    try {
      await api.setLocale(next);
      toast.success(t('language_saved'));
    } catch (error) {
      toast.error(isApiError(error, 'feature_unavailable') ? t('language_locked') : t('language_failed'));
    }
  }

  async function download() {
    setExporting(true);
    setNote(null);
    try {
      let current: AccountExport = await api.createExport('personal');
      for (let i = 0; current.status === 'queued' && i < EXPORT_POLLS; i++) {
        await new Promise((resolve) => setTimeout(resolve, EXPORT_POLL_MS));
        current = await api.accountExport(current.id);
      }
      if (current.status === 'ready' && current.url) {
        window.location.assign(current.url);
      } else {
        setNote(t('export_failed'));
      }
    } catch (error) {
      setNote(isApiError(error, 'not_found') ? t('nothing_to_export') : t('export_failed'));
    } finally {
      setExporting(false);
    }
  }

  async function erase(event: FormEvent) {
    event.preventDefault();
    if (confirm !== 'DELETE' || !user) {
      setNote(t('confirm_exact'));
      return;
    }
    setErasing(true);
    setNote(null);
    try {
      // A fresh token: the career service refuses an erase from an old sign-in.
      await api.deleteAccount({ idToken: await user.getIdToken(), confirm: 'DELETE' });
      setConfirm('');
      setNote(t('erased'));
      await queryClient.invalidateQueries({ queryKey: CAREER_ACCESS_QUERY_KEY });
    } catch (error) {
      if (isApiError(error, 'not_found')) setNote(t('nothing_to_erase'));
      else if (isApiError(error, 'validation_error') && error.body.reason === 'stale') setNote(t('sign_in_again'));
      else setNote(t('erase_failed'));
    } finally {
      setErasing(false);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        {embedded ? (
          <h2 className="text-xl font-bold text-stone-900 dark:text-white">{t('title')}</h2>
        ) : (
          <h1 className="text-2xl font-bold text-stone-900 dark:text-white">{t('title')}</h1>
        )}
        <p className="mt-2 max-w-2xl text-sm text-stone-600 dark:text-stone-300">{t('intro')}</p>
      </div>

      <Card padding="lg">
        <h2 className="text-lg font-semibold text-stone-900 dark:text-white">{t('language_title')}</h2>
        <p className="mt-1 text-sm text-stone-600 dark:text-stone-300">{t('language_body')}</p>
        <div className="mt-3 flex gap-2" role="group" aria-label={t('language_title')}>
          {(['en', 'fr'] as const).map((code) => (
            <Button key={code} type="button" size="sm" variant={language === code ? 'primary' : 'outline'} onClick={() => void saveLanguage(code)}>
              {t(`language_${code}`)}
            </Button>
          ))}
        </div>
      </Card>

      <Card padding="lg">
        <h2 className="text-lg font-semibold text-stone-900 dark:text-white">{t('export_title')}</h2>
        <p className="mt-1 text-sm text-stone-600 dark:text-stone-300">{t('export_body')}</p>
        <Button type="button" variant="secondary" className="mt-3" loading={exporting} onClick={() => void download()}>
          {t('export_button')}
        </Button>
      </Card>

      <Card padding="lg">
        <h2 className="text-lg font-semibold text-stone-900 dark:text-white">{t('erase_title')}</h2>
        <p className="mt-1 text-sm text-stone-600 dark:text-stone-300">{t('erase_body')}</p>
        <form className="mt-3 flex max-w-md flex-col gap-3" onSubmit={(event) => void erase(event)}>
          <Input label={t('confirm_label')} value={confirm} onChange={(event) => setConfirm(event.target.value)} autoComplete="off" />
          <Button type="submit" variant="danger" loading={erasing}>
            {t('erase_button')}
          </Button>
        </form>
      </Card>

      {note ? (
        <p role="status" className="text-sm text-stone-700 dark:text-stone-200">
          {note}
        </p>
      ) : null}
    </div>
  );
}
