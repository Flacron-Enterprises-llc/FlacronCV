import { MetadataRoute } from 'next';
import { SITE_URL, LOCALES, DEFAULT_LOCALE } from '@/lib/seo';

// Public, indexable routes (without the locale prefix). Dashboard/CRM/admin
// are excluded here and carry `noindex` on their layouts. They are not
// Disallowed in robots.txt — a Disallow would hide that directive.
//
// Two sitemap shapes:
//   LOCALIZED_PATHS — chrome and body are translated (or, for privacy, still
//     the locale-JSON policy). Six locale locs + full hreflang + x-default.
//   ENGLISH_DOCUMENT_PATHS — English legal bodies. Chrome is still served at
//     /ar/… for RTL, but the sitemap must not advertise five translations that
//     do not exist. One loc (the en URL) with hreflang en + x-default only.
// Privacy stays localized until MC1 (client must name AWS SES and OpenAI).
// /testimonials is a real route (honest empty state) but is not listed here
// until there are real, verifiable quotes — a thin URL in the sitemap is a
// quality signal. Do not fill the page with placeholders to justify a loc.
const LOCALIZED_PATHS = [
  '',
  '/templates',
  '/about-us',
  '/contact-us',
  '/privacy-policy',
];

const ENGLISH_DOCUMENT_PATHS = [
  '/terms-of-service',
  '/cookie-policy',
  '/disclaimer',
  '/refund-policy',
];

export default function sitemap(): MetadataRoute.Sitemap {
  const localized = LOCALIZED_PATHS.flatMap((path) =>
    LOCALES.map((locale) => ({
      url: `${SITE_URL}/${locale}${path}`,
      changeFrequency: 'monthly' as const,
      priority: path === '' ? 1 : 0.7,
      alternates: {
        languages: {
          ...Object.fromEntries(LOCALES.map((l) => [l, `${SITE_URL}/${l}${path}`])),
          'x-default': `${SITE_URL}/${DEFAULT_LOCALE}${path}`,
        },
      },
    })),
  );

  const english = ENGLISH_DOCUMENT_PATHS.map((path) => ({
    url: `${SITE_URL}/${DEFAULT_LOCALE}${path}`,
    changeFrequency: 'monthly' as const,
    priority: 0.7,
    alternates: {
      languages: {
        [DEFAULT_LOCALE]: `${SITE_URL}/${DEFAULT_LOCALE}${path}`,
        'x-default': `${SITE_URL}/${DEFAULT_LOCALE}${path}`,
      },
    },
  }));

  return [...localized, ...english];
}

// lastmod is omitted on purpose. The previous `lastModified: new Date()`
// stamped every URL with the build time, so all 48 claimed to have changed on
// every deploy. Google discounts lastmod it finds untrustworthy, so a false
// date is worse than none. If lastmod is ever wanted back, the upgrade path is
// a hand-maintained per-path revision map — not the clock.
