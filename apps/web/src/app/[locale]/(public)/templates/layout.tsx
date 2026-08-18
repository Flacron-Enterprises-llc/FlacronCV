import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { pageMetadata } from '@/lib/seo';
import JsonLd from '@/components/seo/JsonLd';
import { pageBreadcrumbs } from '@/lib/json-ld';

// The templates gallery is a client component, so metadata lives in this
// server layout wrapper.
export async function generateMetadata({
  params: { locale },
}: {
  params: { locale: string };
}): Promise<Metadata> {
  const t = await getTranslations('public_templates');
  return pageMetadata({ locale, path: '/templates', title: t('title'), description: t('subtitle') });
}

export default async function TemplatesLayout({
  children,
  params: { locale },
}: {
  children: React.ReactNode;
  params: { locale: string };
}) {
  const t = await getTranslations('public_templates');
  const tNav = await getTranslations();
  return (
    <>
      <JsonLd data={pageBreadcrumbs(locale, tNav('nav.home'), t('title'), '/templates')} />
      {children}
    </>
  );
}
