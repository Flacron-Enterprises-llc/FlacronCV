import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { pageMetadata } from '@/lib/seo';
import JsonLd from '@/components/seo/JsonLd';
import { pageBreadcrumbs } from '@/lib/json-ld';

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

export default async function ContactLayout({
  children,
  params: { locale },
}: {
  children: React.ReactNode;
  params: { locale: string };
}) {
  const t = await getTranslations('contact');
  const tNav = await getTranslations();
  return (
    <>
      <JsonLd data={pageBreadcrumbs(locale, tNav('nav.home'), t('title'), '/contact-us')} />
      {children}
    </>
  );
}
