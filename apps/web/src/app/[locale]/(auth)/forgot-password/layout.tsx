import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { pageMetadata } from '@/lib/seo';

// Client page, so metadata lives here.
//
// `noindex, follow` — unlike /login and /register this page has no navigational
// search value, but it is deliberately NOT blocked in robots.txt: a Disallow
// prevents the fetch, so the crawler would never read this directive and the URL
// could still be indexed with no content. `follow` lets it walk back out to the
// pages we do want indexed.
export async function generateMetadata({
  params: { locale },
}: {
  params: { locale: string };
}): Promise<Metadata> {
  const t = await getTranslations('auth');
  return {
    ...pageMetadata({
      locale,
      path: '/forgot-password',
      title: t('forgot_title'),
      description: t('forgot_subtitle'),
    }),
    robots: { index: false, follow: true },
  };
}

export default function ForgotPasswordLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
