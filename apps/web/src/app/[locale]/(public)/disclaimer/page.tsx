import { getTranslations } from 'next-intl/server';
import { Metadata } from 'next';
import { pageMetadata } from '@/lib/seo';
import JsonLd from '@/components/seo/JsonLd';
import { pageBreadcrumbs } from '@/lib/json-ld';
import LegalDocumentView from '@/components/legal/LegalDocumentView';
import { DISCLAIMER } from '@/legal/disclaimer';

export async function generateMetadata(): Promise<Metadata> {
  return pageMetadata({
    locale: 'en',
    path: DISCLAIMER.path,
    title: DISCLAIMER.title,
    description: DISCLAIMER.description,
    englishDocument: true,
  });
}

export default async function DisclaimerPage() {
  const tNav = await getTranslations();
  return (
    <>
      <JsonLd data={pageBreadcrumbs('en', tNav('nav.home'), DISCLAIMER.title, DISCLAIMER.path)} />
      <LegalDocumentView doc={DISCLAIMER} />
    </>
  );
}
