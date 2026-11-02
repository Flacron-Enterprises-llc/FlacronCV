import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { PublicPortfolioScreen } from '@/components/career/portfolios/PublicPortfolioScreen';

/** A person's published career portfolio (former V2 `/p/[slug]`). Public, anonymous read. */
export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('career.portfolios');
  return { title: t('meta_title'), description: t('meta_description'), robots: { index: false, follow: false } };
}

export default function Page({ params, searchParams }: { params: { slug: string }; searchParams: { token?: string } }) {
  return <PublicPortfolioScreen slug={params.slug} token={searchParams.token ?? null} />;
}
