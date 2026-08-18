import { getTranslations } from 'next-intl/server';
import { Metadata } from 'next';
import { pageMetadata } from '@/lib/seo';
import JsonLd from '@/components/seo/JsonLd';
import { pageBreadcrumbs } from '@/lib/json-ld';
import LegalDocumentView from '@/components/legal/LegalDocumentView';
import { TERMS } from '@/legal/terms';

export async function generateMetadata(): Promise<Metadata> {
  return pageMetadata({
    locale: 'en',
    path: TERMS.path,
    title: TERMS.title,
    description: TERMS.description,
    englishDocument: true,
  });
}

export default async function TermsOfServicePage() {
  const tNav = await getTranslations();
  return (
    <>
      <JsonLd data={pageBreadcrumbs('en', tNav('nav.home'), TERMS.title, TERMS.path)} />
      <LegalDocumentView doc={TERMS} />
    </>
  );
}
