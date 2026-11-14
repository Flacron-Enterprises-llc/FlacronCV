'use client';

import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { useTranslations } from 'next-intl';
import { isApiError, type ApiClient, type OpportunityItem } from '@flacroncv/career-api-client';
import { MIN_LISTING_TEXT } from '@flacroncv/career-shared';
import {
  Button,
  Card,
  EmptyState,
  InlineNote,
  Input,
  LoadingState,
  NoResultsState,
  PageHeader,
  PermissionDeniedState,
  ProviderUnavailableState,
  ScreenStack,
} from '@/components/career/ui';
import type { SignedInUser } from '@/lib/career/auth-gateway';
import { profileLoadFailure } from '@/lib/career/profile-load';
import { ListingFacts } from './ListingFacts';

export function OpportunityScreen({
  api,
  user,
  ready,
  signInHref,
  locale,
}: {
  api: ApiClient;
  user: SignedInUser | null;
  ready: boolean;
  signInHref: string;
  locale: string;
}) {
  const t = useTranslations('career.opportunities');
  const [load, setLoad] = useState<'loading' | 'signed-out' | 'permission' | 'unavailable' | 'ready'>('loading');
  const [query, setQuery] = useState('');
  const [paste, setPaste] = useState('');
  const [sourceUrl, setSourceUrl] = useState('');
  const [items, setItems] = useState<OpportunityItem[]>([]);
  const [searched, setSearched] = useState(false);
  const [pending, setPending] = useState(false);
  const [radiusLimit, setRadiusLimit] = useState<number | null>(null);
  const [pasteNote, setPasteNote] = useState<{ tone: 'success' | 'error'; text: string } | null>(null);

  const note = useCallback((error: unknown) => {
    if (isApiError(error, 'validation_error') && error.body.field === 'radiusMiles' && typeof error.body.limit === 'number') {
      setRadiusLimit(error.body.limit);
      return;
    }
    const failure = profileLoadFailure(error);
    setLoad(failure === 'signed-out' ? 'signed-out' : failure === 'permission' ? 'permission' : 'unavailable');
  }, []);

  // Saved listings show as soon as the page opens, not only after a search.
  const loadSaved = useCallback(async () => {
    setLoad('loading');
    try {
      setItems((await api.opportunities({ q: '' })).items);
      setLoad('ready');
    } catch (error) {
      note(error);
    }
  }, [api, note]);

  useEffect(() => {
    if (!ready) return;
    if (!user) {
      setLoad('signed-out');
      return;
    }
    void loadSaved();
  }, [ready, user, loadSaved]);

  async function search(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setRadiusLimit(null);
    try {
      setItems((await api.opportunities({ q: query })).items);
      setSearched(query.trim().length > 0);
    } catch (error) {
      note(error);
    } finally {
      setPending(false);
    }
  }

  async function savePaste(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPasteNote(null);
    if (paste.trim().length < MIN_LISTING_TEXT) {
      setPasteNote({ tone: 'error', text: t('paste_too_short', { count: MIN_LISTING_TEXT }) });
      return;
    }
    setPending(true);
    try {
      const created = await api.pasteOpportunity({ text: paste, sourceUrl: sourceUrl.trim() || undefined });
      setItems((current) => [created, ...current.filter((item) => item.id !== created.id)]);
      setPaste('');
      setSourceUrl('');
      setPasteNote({ tone: 'success', text: t('paste_saved') });
    } catch (error) {
      if (isApiError(error, 'validation_error')) {
        setPasteNote({
          tone: 'error',
          text: error.body.field === 'sourceUrl' ? t('paste_bad_url') : t('paste_too_short', { count: MIN_LISTING_TEXT }),
        });
      } else {
        note(error);
      }
    } finally {
      setPending(false);
    }
  }

  if (!ready || load === 'loading') return <LoadingState label={t('loading')} />;
  if (load === 'permission') return <PermissionDeniedState title={t('permission_title')} body={t('permission_body')} />;
  if (load === 'unavailable') {
    return (
      <ProviderUnavailableState
        title={t('unavailable_title')}
        body={t('unavailable_body')}
        action={<Button type="button" onClick={() => void loadSaved()}>{t('retry')}</Button>}
      />
    );
  }
  if (load === 'signed-out' || !user) {
    return (
      <EmptyState
        title={t('signed_out_title')}
        body={t('signed_out_body')}
        action={
          <a className="inline-flex min-h-career-touch items-center rounded-md bg-career-navy px-4 text-sm font-semibold text-white dark:text-stone-950" href={signInHref}>
            {t('go_sign_in')}
          </a>
        }
      />
    );
  }

  return (
    <ScreenStack>
      <PageHeader title={t('title')} />
      <form className="flex flex-col gap-3 sm:flex-row sm:items-end" onSubmit={(event) => void search(event)}>
        <div className="min-w-0 flex-1">
          <Input label={t('query_label')} name="q" value={query} onChange={(event) => setQuery(event.target.value)} />
        </div>
        <Button type="submit" disabled={pending}>{t('search')}</Button>
      </form>
      {radiusLimit !== null ? <InlineNote>{t('radius', { limit: radiusLimit })}</InlineNote> : null}
      {items.length === 0 ? (
        searched ? (
          <NoResultsState title={t('no_results_title')} body={t('no_results_body')} />
        ) : (
          <EmptyState title={t('empty_title')} body={t('empty_body')} />
        )
      ) : (
        <ul className="grid grid-cols-1 gap-3">
          {items.map((item) => (
            <li key={item.id}>
              <Card>
                <a className="text-lg font-semibold text-career-ink hover:underline" dir="auto" href={`/${locale}/career/opportunities/${item.id}`}>{item.title}</a>
                <ListingFacts item={item} className="mt-2" />
                {item.label === 'expired' ? <p className="mt-1 text-sm text-career-orange-text">{t('expired')}</p> : null}
              </Card>
            </li>
          ))}
        </ul>
      )}
      <Card>
        <form className="flex flex-col gap-3" onSubmit={(event) => void savePaste(event)}>
          <h2 className="text-lg font-semibold text-career-ink">{t('paste_heading')}</h2>
          <label className="text-sm font-semibold text-career-ink" htmlFor="paste-text">{t('paste_label')}</label>
          <textarea
            id="paste-text"
            className="min-h-[8rem] rounded-md border border-career-line bg-career-surface p-3 text-sm text-career-ink placeholder:text-career-muted"
            placeholder={t('paste_placeholder')}
            value={paste}
            onChange={(event) => setPaste(event.target.value)}
          />
          <Input label={t('paste_url')} name="sourceUrl" type="url" value={sourceUrl} onChange={(event) => setSourceUrl(event.target.value)} />
          <div>
            <Button type="submit" variant="secondary" disabled={pending}>{t('paste')}</Button>
          </div>
          {pasteNote ? <InlineNote tone={pasteNote.tone}>{pasteNote.text}</InlineNote> : null}
        </form>
      </Card>
    </ScreenStack>
  );
}
