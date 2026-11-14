import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { pageMetadata } from '@/lib/seo';
import { PublicPricingPage } from '@/components/pricing/PublicPricingPage';

export async function generateMetadata({
  params: { locale },
}: {
  params: { locale: string };
}): Promise<Metadata> {
  const tPage = await getTranslations('career_pricing');
  const t = await getTranslations('plan_catalog');
  return pageMetadata({ locale, path: '/pricing', title: tPage('page_title'), description: t('page_lede') });
}

/** The five FlacronCV plans, comparison, add-ons, calculator and Contact Sales. */
export default function PricingPage() {
  return <PublicPricingPage />;
}
