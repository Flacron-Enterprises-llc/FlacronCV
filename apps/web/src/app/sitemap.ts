import { MetadataRoute } from 'next';
import { SITE_URL, LOCALES } from '@/lib/seo';

// Public, indexable routes (without the locale prefix). Dashboard/CRM/admin
// routes are intentionally excluded (they are also Disallowed in robots).
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
  const lastModified = new Date();
  return PATHS.flatMap((path) =>
    LOCALES.map((locale) => ({
      url: `${SITE_URL}/${locale}${path}`,
      lastModified,
      changeFrequency: 'monthly' as const,
      priority: path === '' ? 1 : 0.7,
      alternates: {
        languages: Object.fromEntries(LOCALES.map((l) => [l, `${SITE_URL}/${l}${path}`])),
      },
    })),
  );
}
