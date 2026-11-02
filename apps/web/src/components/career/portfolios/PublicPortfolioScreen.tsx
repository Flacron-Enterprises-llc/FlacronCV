'use client';

import { useEffect, useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import { createApiClient, isApiError, type PublicPortfolioView } from '@flacroncv/career-api-client';
import { Button, Card, EmptyState, LoadingState, ProviderUnavailableState } from '@/components/career/ui';
import { careerApiOrigin } from '@/components/career/CareerServices';

export function PublicPortfolioScreen({ slug, token }: { slug: string; token: string | null }) {
  const t = useTranslations('career.portfolios');
  const api = useMemo(() => createApiClient({ baseUrl: careerApiOrigin(), getToken: async () => null }), []);
  const [attempt, setAttempt] = useState(0);
  const [load, setLoad] = useState<'loading' | 'missing' | 'unavailable' | 'ready'>('loading');
  const [page, setPage] = useState<PublicPortfolioView | null>(null);

  useEffect(() => {
    let active = true;
    setLoad('loading');
    api.publicPortfolio(slug, token ?? undefined).then((view) => {
      if (!active) return;
      setPage(view);
      setLoad('ready');
    }).catch((error: unknown) => {
      if (!active) return;
      setLoad(isApiError(error, 'not_found') ? 'missing' : 'unavailable');
    });
    return () => {
      active = false;
    };
  }, [api, slug, token, attempt]);

  return (
    <div className="mx-auto w-full max-w-4xl px-4 py-10">
      {load === 'loading' ? <LoadingState label={t('public_loading')} /> : null}
      {load === 'missing' ? <EmptyState title={t('public_missing_title')} body={t('public_missing_body')} /> : null}
      {load === 'unavailable' ? (
        <ProviderUnavailableState
          title={t('public_unavailable_title')}
          body={t('public_unavailable_body')}
          action={<Button type="button" onClick={() => setAttempt((value) => value + 1)}>{t('retry')}</Button>}
        />
      ) : null}
      {load === 'ready' && page ? (
        <article className="grid grid-cols-1 gap-4">
          <h1 className="text-2xl font-semibold text-career-ink">{page.displayName || page.title}</h1>
          {page.headline ? <p className="text-base text-career-ink">{page.headline}</p> : null}
          {page.contactEmail ? <p className="text-sm text-career-ink">{page.contactEmail}</p> : null}
          {page.contactPhone ? <p className="text-sm text-career-ink">{page.contactPhone}</p> : null}
          <ul className="grid grid-cols-1 gap-3">
            {page.items.map((item) => (
              <li key={item.id}>
                <Card>
                  <h2 className="text-lg font-semibold text-career-ink">{item.title}</h2>
                  <p className="mt-2 whitespace-pre-wrap text-sm text-career-ink">{item.description}</p>
                </Card>
              </li>
            ))}
          </ul>
        </article>
      ) : null}
    </div>
  );
}
