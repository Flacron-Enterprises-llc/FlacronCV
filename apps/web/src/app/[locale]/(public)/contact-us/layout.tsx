import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { pageMetadata } from '@/lib/seo';

// The contact page itself is a client component, so metadata lives in this
// server layout wrapper.
export async function generateMetadata({
  params: { locale },
}: {
  params: { locale: string };
}): Promise<Metadata> {
  const t = await getTranslations('contact');
  return pageMetadata({ locale, path: '/contact-us', title: t('title'), description: t('subtitle') });
}

export default function ContactLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
