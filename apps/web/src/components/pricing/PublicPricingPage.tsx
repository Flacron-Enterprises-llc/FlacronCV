'use client';

import { useTranslations } from 'next-intl';
import Pricing from '@/components/landing/Pricing';
import { careerBuildEnabled } from '@/lib/career-switch';
import { CareerPricing } from './CareerPricing';

/**
 * Public `/pricing`: FlacronCV's own plans (the homepage pricing section) and,
 * when the career build switch is on, the optional career tools add-on with its
 * own prices. Without the switch only V1's plans show.
 *
 * The page heading is handed to the plans section as its intro rather than
 * rendered above it: the section has its own heading, and the two stacked
 * read "Pricing / Simple, Transparent Pricing". Inside the section the intro
 * also gets the section's background and spacing, so the add-on link no longer
 * sits on the seam between two backgrounds.
 */
export function PublicPricingPage() {
  const t = useTranslations('career_pricing');
  const careerOn = careerBuildEnabled();
  const intro = (
    <>
      <h1 className="text-4xl font-bold tracking-tight text-stone-900 dark:text-white sm:text-5xl">{t('page_title')}</h1>
      <p className="mx-auto mt-4 max-w-2xl text-lg text-stone-600 dark:text-stone-400">
        {careerOn ? t('page_lede_with_career') : t('page_lede')}
      </p>
      {careerOn ? (
        <a
          href="#career"
          className="mt-4 inline-block rounded text-sm font-semibold text-brand-700 underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 dark:text-brand-400"
        >
          {t('jump_to_career')}
        </a>
      ) : null}
    </>
  );
  return (
    <>
      <Pricing intro={intro} />
      {careerOn ? <CareerPricing /> : null}
    </>
  );
}
