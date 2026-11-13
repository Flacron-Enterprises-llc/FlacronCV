import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { pageMetadata } from '@/lib/seo';
import { careerBuildEnabled } from '@/lib/career-switch';
import { PublicPricingPage } from '@/components/pricing/PublicPricingPage';

export async function generateMetadata({
  params: { locale },
}: {
  params: { locale: string };
}): Promise<Metadata> {
  const t = await getTranslations('career_pricing');
  const description = careerBuildEnabled() ? t('page_lede_with_career') : t('page_lede');
  return pageMetadata({ locale, path: '/pricing', title: t('page_title'), description });
}

/** FlacronCV plans plus, when the career build switch is on, the career tools add-on. */
export default function PricingPage() {
  return <PublicPricingPage />;
}
