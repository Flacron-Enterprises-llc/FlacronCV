'use client';

import { useState, type FormEvent } from 'react';
import { useTranslations } from 'next-intl';
import { isApiError, type ApiClient, type OpportunityItem } from '@flacroncv/career-api-client';
import { Button, Card, EmptyState, Input, LoadingState, NoResultsState, PermissionDeniedState, ProviderUnavailableState } from '@/components/career/ui';
import type { SignedInUser } from '@/lib/career/auth-gateway';
import { profileLoadFailure } from '@/lib/career/profile-load';

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
  const [load, setLoad] = useState<'signed-out' | 'permission' | 'unavailable' | 'ready'>('ready');
  const [query, setQuery] = useState('');
  const [paste, setPaste] = useState('');
  const [sourceUrl, setSourceUrl] = useState('');
  const [items, setItems] = useState<OpportunityItem[] | null>(null);
  const [pending, setPending] = useState(false);
  const [radiusLimit, setRadiusLimit] = useState<number | null>(null);

  if (!ready) return <LoadingState label={t('loading')} />;
  if (load === 'permission') return <PermissionDeniedState title={t('permission_title')} body={t('permission_body')} />;
  if (load === 'unavailable') {
    return (
      <ProviderUnavailableState
        title={t('unavailable_title')}
        body={t('unavailable_body')}
        action={<Button type="button" onClick={() => setLoad('ready')}>{t('retry')}</Button>}
      />
    );
  }
  if (!user) {
    return (
      <EmptyState
        title={t('signed_out_title')}
        body={t('signed_out_body')}
        action={
          <a className="inline-flex min-h-career-touch items-center rounded-md bg-career-navy px-4 text-sm font-semibold text-white" href={signInHref}>
            {t('go_sign_in')}
          </a>
        }
      />
    );
  }

  async function search(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setRadiusLimit(null);
    try {
      setItems((await api.opportunities({ q: query })).items);
      setLoad('ready');
    } catch (error) {
      note(error);
    } finally {
      setPending(false);
    }
  }

  async function savePaste(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    try {
      const created = await api.pasteOpportunity({ text: paste, sourceUrl: sourceUrl.trim() || undefined });
      setItems((current) => [created, ...(current ?? []).filter((item) => item.id !== created.id)]);
      setPaste('');
    } catch (error) {
      note(error);
    } finally {
      setPending(false);
    }
  }

  function note(error: unknown) {
    if (isApiError(error, 'validation_error') && error.body.field === 'radiusMiles' && typeof error.body.limit === 'number') {
      setRadiusLimit(error.body.limit);
      return;
    }
    const failure = profileLoadFailure(error);
    if (failure === 'signed-out') return;
    setLoad(failure === 'permission' ? 'permission' : 'unavailable');
  }

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-2xl font-semibold text-career-ink">{t('title')}</h1>
      <form className="flex flex-col gap-3" onSubmit={(event) => void search(event)}>
        <Input label={t('query_label')} name="q" value={query} onChange={(event) => setQuery(event.target.value)} />
        <Button type="submit" disabled={pending}>{t('search')}</Button>
      </form>
      {radiusLimit !== null ? <p role="status">{t('radius', { limit: radiusLimit })}</p> : null}
      {items === null ? (
        <EmptyState title={t('empty_title')} body={t('empty_body')} />
      ) : items.length === 0 ? (
        <NoResultsState title={t('no_results_title')} body={t('no_results_body')} />
      ) : (
        <ul className="grid grid-cols-1 gap-3">
          {items.map((item) => (
            <li key={item.id}>
              <Card>
                <a className="text-lg font-semibold text-career-ink" href={`/${locale}/career/opportunities/${item.id}`}>{item.title}</a>
                <p className="mt-1 text-sm text-career-muted">{item.organization ?? t('not_stated')}</p>
                <p className="mt-1 text-sm text-career-ink">{item.locations.length > 0 ? item.locations.join(', ') : t('not_stated')}</p>
                <p className="mt-1 text-sm text-career-ink">{payText(item, t('not_stated'))}</p>
                <p className="mt-1 text-sm text-career-ink">{item.sponsorship === 'unknown' ? t('not_stated') : item.sponsorship}</p>
                {item.label === 'expired' ? <p className="mt-1 text-sm text-career-orange-text">{t('expired')}</p> : null}
              </Card>
            </li>
          ))}
        </ul>
      )}
      <form className="flex flex-col gap-3" onSubmit={(event) => void savePaste(event)}>
        <label className="text-sm font-semibold text-career-ink" htmlFor="paste-text">{t('paste_label')}</label>
        <textarea
          id="paste-text"
          className="min-h-[8rem] rounded-md border border-career-line bg-white p-3 text-sm text-career-ink"
          value={paste}
          onChange={(event) => setPaste(event.target.value)}
        />
        <Input label={t('paste_url')} name="sourceUrl" value={sourceUrl} onChange={(event) => setSourceUrl(event.target.value)} />
        <Button type="submit" variant="secondary" disabled={pending}>{t('paste')}</Button>
      </form>
    </div>
  );
}

function payText(item: OpportunityItem, notStated: string): string {
  const { minimum, maximum, currency, period } = item.compensation;
  if (minimum === null && maximum === null) return notStated;
  const amount = minimum !== null && maximum !== null ? `${minimum}–${maximum}` : String(minimum ?? maximum);
  return [amount, currency, period].filter((part) => part !== null && part.length > 0).join(' ');
}
