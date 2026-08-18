import { getTranslations } from 'next-intl/server';
import { Metadata } from 'next';
import { pageMetadata } from '@/lib/seo';
import JsonLd from '@/components/seo/JsonLd';
import { pageBreadcrumbs } from '@/lib/json-ld';
import LegalDocumentView from '@/components/legal/LegalDocumentView';
import { REFUND } from '@/legal/refund';

export async function generateMetadata(): Promise<Metadata> {
  return pageMetadata({
    locale: 'en',
    path: REFUND.path,
    title: REFUND.title,
    description: REFUND.description,
    englishDocument: true,
  });
}

export default async function RefundPolicyPage() {
  const tNav = await getTranslations();
  return (
    <>
      <JsonLd data={pageBreadcrumbs('en', tNav('nav.home'), REFUND.title, REFUND.path)} />
      <LegalDocumentView doc={REFUND} />
    </>
  );
}
