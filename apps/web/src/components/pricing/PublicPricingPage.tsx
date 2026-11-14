'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import type { BillingInterval } from '@flacroncv/career-shared';
import type { ApiClient } from '@flacroncv/career-api-client';
import Pricing from '@/components/landing/Pricing';
import { Link } from '@/i18n/routing';
import { careerBuildEnabled } from '@/lib/career-switch';
import { PlanComparison } from './PlanComparison';
import { AddonCatalog } from './AddonCatalog';
import { PriceCalculator } from './PriceCalculator';
import { ContactSalesForm } from './ContactSalesForm';

/**
 * Public `/pricing` (spec §5, §16): the five plan cards, the complete
 * comparison with unit definitions, the add-on catalog, the price calculator
 * and Contact Sales beneath Business. One catalog for the whole product; there
 * is no separate career add-on any more.
 */
export function PublicPricingPage({ api }: { api?: ApiClient } = {}) {
  const t = useTranslations('plan_catalog');
  const tPage = useTranslations('career_pricing');
  const [interval, setBillingInterval] = useState<BillingInterval>('monthly');
  const intro = (
    <>
      <h1 className="text-4xl font-bold tracking-tight text-stone-900 dark:text-white sm:text-5xl">{tPage('page_title')}</h1>
      <p className="mx-auto mt-4 max-w-2xl text-lg text-stone-600 dark:text-stone-400">{t('page_lede')}</p>
      <nav aria-label={t('page_sections')} className="mt-4 flex flex-wrap justify-center gap-x-4 gap-y-1 text-sm font-semibold">
        {(
          [
            ['#compare', 'nav_compare'],
            ['#addons', 'nav_addons'],
            ['#calculator', 'nav_calculator'],
            ['#contact-sales', 'contact_sales'],
          ] as const
        ).map(([href, key]) => (
          <a
            key={href}
            href={href}
            className="rounded text-brand-700 underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 dark:text-brand-400"
          >
            {t(key)}
          </a>
        ))}
      </nav>
    </>
  );

  return (
    <>
      <Pricing intro={intro} interval={interval} onIntervalChange={setBillingInterval} fullPage />
      <div className="bg-white dark:bg-stone-950">
        <div className="mx-auto max-w-7xl space-y-16 px-4 py-16 sm:px-6 sm:py-20 lg:px-8">
          <section id="compare" className="scroll-mt-20" aria-labelledby="compare-title">
            <PlanComparison interval={interval} />
          </section>
          <section id="addons" className="scroll-mt-20" aria-labelledby="addons-title">
            <AddonCatalog />
          </section>
          <section id="calculator" className="scroll-mt-20" aria-labelledby="calculator-title">
            <PriceCalculator initialInterval={interval} />
          </section>
          <section
            id="contact-sales"
            aria-labelledby="contact-sales-title"
            className="scroll-mt-20 rounded-2xl border border-stone-200 bg-stone-50 p-5 sm:p-6 dark:border-stone-700 dark:bg-stone-900"
          >
            <h2 id="contact-sales-title" className="text-xl font-bold text-stone-900 dark:text-white">
              {t('contact_sales')}
            </h2>
            <p className="mt-2 max-w-3xl text-sm text-stone-600 dark:text-stone-400">{t('contact_sales_body')}</p>
            {careerBuildEnabled() ? (
              <ContactSalesForm api={api} />
            ) : (
              <Link
                href="/contact-us"
                className="mt-4 inline-flex items-center justify-center rounded-lg bg-brand-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-brand-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2"
              >
                {t('contact_us')}
              </Link>
            )}
          </section>
        </div>
      </div>
    </>
  );
}
