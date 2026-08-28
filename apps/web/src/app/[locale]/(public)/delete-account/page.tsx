import { getTranslations } from 'next-intl/server';
import { Metadata } from 'next';
import { pageMetadata } from '@/lib/seo';
import JsonLd from '@/components/seo/JsonLd';
import { pageBreadcrumbs } from '@/lib/json-ld';
import LegalDocumentView from '@/components/legal/LegalDocumentView';
import { DELETE_ACCOUNT, DELETE_ACCOUNT_PATH } from '@/content/delete-account';

export async function generateMetadata(): Promise<Metadata> {
  return pageMetadata({
    locale: 'en',
    path: DELETE_ACCOUNT_PATH,
    title: DELETE_ACCOUNT.title,
    description: DELETE_ACCOUNT.description,
    englishDocument: true,
  });
}

export default async function DeleteAccountPage() {
  const tNav = await getTranslations();
  return (
    <>
      <JsonLd
        data={pageBreadcrumbs('en', tNav('nav.home'), DELETE_ACCOUNT.title, DELETE_ACCOUNT_PATH)}
      />
      <LegalDocumentView doc={DELETE_ACCOUNT} />
    </>
  );
}
