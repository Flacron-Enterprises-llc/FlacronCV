import { MetadataRoute } from 'next';
import { SITE_URL, LOCALES, DEFAULT_LOCALE } from '@/lib/seo';

// Public, indexable routes (without the locale prefix). Dashboard/CRM/admin
// routes are intentionally excluded (they are also Disallowed in robots).
// /disclaimer and /refund-policy do not exist yet — they arrive in Batch B.
// Do not add them here ahead of the routes.
const PATHS = [
  '',
  '/templates',
  '/about-us',
  '/contact-us',
  '/testimonials',
  '/privacy-policy',
  '/terms-of-service',
  '/cookie-policy',
];

export default function sitemap(): MetadataRoute.Sitemap {
  return PATHS.flatMap((path) =>
    LOCALES.map((locale) => ({
      url: `${SITE_URL}/${locale}${path}`,
      changeFrequency: 'monthly' as const,
      priority: path === '' ? 1 : 0.7,
      alternates: {
        languages: {
          ...Object.fromEntries(LOCALES.map((l) => [l, `${SITE_URL}/${l}${path}`])),
          // Pages emit x-default; the sitemap used not to, so the two
          // disagreed. Keep them in lockstep.
          'x-default': `${SITE_URL}/${DEFAULT_LOCALE}${path}`,
        },
      },
    })),
  );
}

// lastmod is omitted on purpose. The previous `lastModified: new Date()`
// stamped every URL with the build time, so all 48 claimed to have changed on
// every deploy. Google discounts lastmod it finds untrustworthy, so a false
// date is worse than none. If lastmod is ever wanted back, the upgrade path is
// a hand-maintained per-path revision map — not the clock. The legal pages'
// own "Last updated: Jan 1, 2026" is already flagged as suspect, which is why
// that map is not being seeded from dates we cannot defend.
