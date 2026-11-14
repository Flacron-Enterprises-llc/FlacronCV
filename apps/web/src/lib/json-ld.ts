/**
 * JSON-LD builders. Every number a crawler can read as a fact about the product
 * comes from PLAN_CONFIGS — the same table the rest of the app is supposed to
 * treat as the single source of truth. Restating a limit or a price here is how
 * structured data and the paywall silently disagree.
 *
 * aggregateRating is deliberately absent. We have no real, verifiable reviews
 * (the testimonials section is hidden until we do), and inventing a rating is
 * both a Google rich-result policy violation and the same defect class as the
 * watermark claim: a published promise with no mechanism. Do not add one.
 */

import { PLAN_CONFIGS, SubscriptionPlan, customerFacingPlans } from '@flacroncv/shared-types';
import { SITE_URL } from '@/lib/seo';

export function organizationAndWebsite(locale: string) {
  return {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'Organization',
        '@id': `${SITE_URL}/#organization`,
        name: 'FlacronCV',
        url: SITE_URL,
        // Square colour mark for Google Organization cards (white background).
        // Full lockups are too wide; white-ink assets vanish on white cards.
        logo: `${SITE_URL}/logo-schema.png`,
      },
      {
        '@type': 'WebSite',
        '@id': `${SITE_URL}/#website`,
        name: 'FlacronCV',
        url: SITE_URL,
        publisher: { '@id': `${SITE_URL}/#organization` },
        inLanguage: locale,
      },
    ],
  };
}

export function softwareApplication() {
  return {
    '@context': 'https://schema.org',
    '@type': 'SoftwareApplication',
    name: 'FlacronCV',
    applicationCategory: 'BusinessApplication',
    operatingSystem: 'Web',
    url: SITE_URL,
    offers: customerFacingPlans().map((plan) => ({
      '@type': 'Offer',
      name: PLAN_CONFIGS[plan].name,
      price: String(PLAN_CONFIGS[plan].priceMonthly),
      priceCurrency: 'USD',
    })),
  };
}

export function breadcrumbList(
  locale: string,
  crumbs: readonly { name: string; path: string }[],
) {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: crumbs.map((crumb, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      name: crumb.name,
      item: `${SITE_URL}/${locale}${crumb.path}`,
    })),
  };
}

/** Home → this page. `homeLabel` is `t('nav.home')` so it stays translated. */
export function pageBreadcrumbs(locale: string, homeLabel: string, name: string, path: string) {
  return breadcrumbList(locale, [
    { name: homeLabel, path: '' },
    { name, path },
  ]);
}

function countPhrase(value: number | 'unlimited', singular: string, plural: string): string {
  if (value === 'unlimited') return `unlimited ${plural}`;
  return `${value} ${value === 1 ? singular : plural}`;
}

/**
 * Homepage FAQPage schema. English is the primary crawl language; the visible
 * FAQ on the page is translated. Plan quantities are interpolated from
 * PLAN_CONFIGS so this cannot drift from the paywall the way a restated
 * "5 CVs" can.
 *
 * The FAQ is said twice: `faq.a1`/`faq.a2` in locale JSON (humans) and this
 * block (crawlers). Cadence wording must match both: credits and analyses
 * renew every month (Free on the account anniversary, paid plans on the
 * billing date); PDF exports are unlimited on every plan. If you change one,
 * change the other. Only the five current plans are described — never a
 * legacy plan.
 */
export function faqPage() {
  const free = PLAN_CONFIGS[SubscriptionPlan.FREE].limits;
  const starter = PLAN_CONFIGS[SubscriptionPlan.STARTER].limits;

  return {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: [
      {
        '@type': 'Question',
        name: 'Is FlacronCV really free?',
        acceptedAnswer: {
          '@type': 'Answer',
          text: `Yes. The Free plan includes ${countPhrase(free.cvs, 'CV', 'CVs')}, ${countPhrase(free.coverLetters, 'cover letter', 'cover letters')}, ${countPhrase(free.aiCredits, 'AI document credit', 'AI document credits')} and ${countPhrase(free.analyses ?? 0, 'CV analysis', 'CV analyses')} a month, plus ${countPhrase(free.exports, 'PDF export', 'PDF exports')} with a small FlacronCV mark — no credit card required. Paid plans start with Starter (${countPhrase(starter.cvs, 'CV', 'CVs')}, ${countPhrase(starter.aiCredits, 'AI document credit', 'AI document credits')} a month) and add DOCX export and exports without the mark. Allowances renew every month.`,
        },
      },
      {
        '@type': 'Question',
        name: 'What export formats are supported?',
        acceptedAnswer: {
          '@type': 'Answer',
          text: `Every plan includes ${countPhrase(free.exports, 'PDF export', 'PDF exports')}. Paid plans (Starter and up) also unlock DOCX (Microsoft Word) format and remove the small FlacronCV mark from exports.`,
        },
      },
      {
        '@type': 'Question',
        name: 'How does the AI writing work?',
        acceptedAnswer: {
          '@type': 'Answer',
          text: 'Our AI analyzes your experience and the job description to generate tailored content. It uses advanced language models to create professional, impactful bullet points, summaries, and cover letters.',
        },
      },
      {
        '@type': 'Question',
        name: 'Is my data secure?',
        acceptedAnswer: {
          '@type': 'Answer',
          text: 'Yes. All data is encrypted in transit (TLS) and at rest (AES-256). We are GDPR compliant, we never sell your data to third parties, and you can request complete deletion of your account and all associated files at any time from your account settings.',
        },
      },
      {
        '@type': 'Question',
        name: 'Can I cancel my subscription anytime?',
        acceptedAnswer: {
          '@type': 'Answer',
          text: 'Yes, you can cancel anytime from your billing settings — no questions asked. Your subscription stays active until the end of the current billing period, and you will not be charged again.',
        },
      },
      {
        '@type': 'Question',
        name: 'What languages are supported?',
        acceptedAnswer: {
          '@type': 'Answer',
          text: 'FlacronCV currently supports English, Spanish, French, German, Arabic, and Urdu — for both the app interface and your CV content. More languages (including Portuguese, Italian, and Chinese) are coming soon.',
        },
      },
    ],
  };
}
