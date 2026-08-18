import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { pageMetadata } from '@/lib/seo';

// Client page, so metadata lives here. `noindex, follow` for the same reason as
// /forgot-password: a signed-in-only waypoint with no search value, kept
// crawlable so the directive can actually be read.
export async function generateMetadata({
  params: { locale },
}: {
  params: { locale: string };
}): Promise<Metadata> {
  const t = await getTranslations('auth');
  return {
    ...pageMetadata({
      locale,
      path: '/verify-email',
      title: t('verify_title'),
      description: t('verify_desc'),
    }),
    robots: { index: false, follow: true },
  };
}

export default function VerifyEmailLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
