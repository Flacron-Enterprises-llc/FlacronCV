import { cache } from 'react';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { createApiClient, isApiError, type PublicPortfolioView } from '@flacroncv/career-api-client';
import { PublicPortfolioScreen } from '@/components/career/portfolios/PublicPortfolioScreen';

type Params = { params: { slug: string }; searchParams: { token?: string } };

type Load =
  | { kind: 'ready'; view: PublicPortfolioView }
  | { kind: 'missing' }
  | { kind: 'unavailable' };

/**
 * Server-side origin of the career API. CAREER_API_URL lets a deployment use
 * an internal address from the web server; the public URL is the fallback.
 * (Not imported from CareerServices: that is a client module.)
 */
function careerApiOriginForServer(): string {
  return (
    process.env.CAREER_API_URL?.trim() ||
    process.env.NEXT_PUBLIC_CAREER_API_URL?.trim() ||
    'http://localhost:4101'
  );
}

/**
 * One read per request: generateMetadata and the page share it through
 * React's cache(), so a visit is counted once. `no-store` because Next 14
 * caches server fetches by default, and a page that was unpublished must
 * stop being served at once.
 */
const loadPortfolio = cache(async (slug: string, token: string | null): Promise<Load> => {
  const api = createApiClient({
    baseUrl: careerApiOriginForServer(),
    getToken: async () => null,
    fetch: (input, init) => fetch(input, { ...init, cache: 'no-store' }),
  });
  try {
    return { kind: 'ready', view: await api.publicPortfolio(slug, token ?? undefined) };
  } catch (error) {
    return isApiError(error, 'not_found') ? { kind: 'missing' } : { kind: 'unavailable' };
  }
});

/** A person's published career portfolio (former V2 `/p/[slug]`). Public, anonymous read. */
export async function generateMetadata({ params, searchParams }: Params): Promise<Metadata> {
  const t = await getTranslations('career.portfolios');
  const load = await loadPortfolio(params.slug, searchParams.token ?? null);
  const title =
    load.kind === 'ready' ? load.view.displayName || load.view.title || t('meta_title') : t('meta_title');
  const description =
    load.kind === 'ready' && load.view.headline ? load.view.headline : t('meta_description');
  // Personal pages stay out of search results: sharing a link is not consent
  // to being indexed.
  return { title, description, robots: { index: false, follow: false } };
}

export default async function Page({ params, searchParams }: Params) {
  const token = searchParams.token ?? null;
  const load = await loadPortfolio(params.slug, token);
  // A real 404 (status and page), not an empty 200 that said "not public".
  if (load.kind === 'missing') notFound();
  return (
    <PublicPortfolioScreen
      slug={params.slug}
      token={token}
      initial={load.kind === 'ready' ? load.view : null}
    />
  );
}
