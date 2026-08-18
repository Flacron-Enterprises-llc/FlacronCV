import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { pageMetadata } from '@/lib/seo';

// Client page, so metadata lives here. Indexable for the same reason as /login.
export async function generateMetadata({
  params: { locale },
}: {
  params: { locale: string };
}): Promise<Metadata> {
  const t = await getTranslations('auth');
  return pageMetadata({
    locale,
    path: '/register',
    title: t('register_title'),
    description: t('register_subtitle'),
  });
}

export default function RegisterLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
