import type { Metadata } from 'next';
import { routing } from '@/i18n/routing';

// Single source of truth for the site's canonical origin. Falls back to the
// Render host; set NEXT_PUBLIC_SITE_URL to the production/custom domain.
export const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL || 'https://flacroncv-web.onrender.com';

export const LOCALES = routing.locales;
export const DEFAULT_LOCALE = routing.defaultLocale;
export const OG_IMAGE = '/og.png';

/**
 * Build canonical + hreflang alternates for a locale-prefixed path.
 * `path` is the route WITHOUT the locale segment, e.g. '' for home or
 * '/about-us'. Emits one `languages` entry per locale plus `x-default`.
 */
export function localizedAlternates(path: string, locale: string): Metadata['alternates'] {
  const languages: Record<string, string> = {};
  for (const l of LOCALES) languages[l] = `${SITE_URL}/${l}${path}`;
  languages['x-default'] = `${SITE_URL}/${DEFAULT_LOCALE}${path}`;
  return { canonical: `${SITE_URL}/${locale}${path}`, languages };
}

/**
 * Shared page metadata: page-specific title (the root layout template appends
 * " | FlacronCV", so pass the bare title to avoid a double suffix), description,
 * canonical + hreflang alternates, and OpenGraph/Twitter cards.
 */
export function pageMetadata(opts: {
  locale: string;
  path: string;
  title: string;
  description: string;
}): Metadata {
  const { locale, path, title, description } = opts;
  const canonical = `${SITE_URL}/${locale}${path}`;
  const ogTitle = `${title} | FlacronCV`;
  return {
    title,
    description,
    alternates: localizedAlternates(path, locale),
    openGraph: {
      title: ogTitle,
      description,
      type: 'website',
      url: canonical,
      siteName: 'FlacronCV',
      images: [{ url: OG_IMAGE, width: 1200, height: 630, alt: 'FlacronCV' }],
    },
    twitter: {
      card: 'summary_large_image',
      title: ogTitle,
      description,
      images: [OG_IMAGE],
    },
  };
}
