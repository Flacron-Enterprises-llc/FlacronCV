import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { pageMetadata } from '@/lib/seo';

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

export default function TemplatesLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
