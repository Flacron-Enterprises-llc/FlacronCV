import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { pageMetadata } from '@/lib/seo';

// The login page is a client component, so metadata lives in this server layout
// wrapper — the same pattern as /contact-us and /templates.
//
// Indexable, deliberately. "<brand> login" is real navigational search demand,
// and the defect this closes was the opposite of over-exposure: all six locale
// URLs previously fell back to the root layout's static English title with NO
// canonical and NO hreflang, so /en/login and /es/login were near-duplicates
// with nothing telling Google they were translations of one page. Reusing the
// on-page heading keys keeps <title> and <h1> in agreement.
export async function generateMetadata({
  params: { locale },
}: {
  params: { locale: string };
}): Promise<Metadata> {
  const t = await getTranslations('auth');
  return pageMetadata({
    locale,
    path: '/login',
    title: t('login_title'),
    description: t('login_subtitle'),
  });
}

export default function LoginLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
