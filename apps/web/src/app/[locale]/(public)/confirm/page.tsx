import { Suspense } from 'react';
import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { pageMetadata } from '@/lib/seo';
import ConfirmClient from './ConfirmClient';

export async function generateMetadata({
  params: { locale },
}: {
  params: { locale: string };
}): Promise<Metadata> {
  const t = await getTranslations('lead_confirm');
  return pageMetadata({
    locale,
    path: '/confirm',
    title: t('meta_title'),
    description: t('meta_desc'),
    robots: { index: false, follow: false },
  });
}

// Double-opt-in landing page for the link in the confirmation email.
// ConfirmClient reads ?token via useSearchParams, so it must sit in Suspense.
// noindex: a one-time token URL has no business in a search index.
export default function ConfirmPage() {
  return (
    <Suspense fallback={null}>
      <ConfirmClient />
    </Suspense>
  );
}
