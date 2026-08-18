import type { Metadata } from 'next';
import { routing } from '@/i18n/routing';

// Single source of truth for the site's canonical origin.
//
// The fallback was the old Render host. Production runs on AWS ECS and that
// Render service is gone, so any build missing NEXT_PUBLIC_SITE_URL emitted
// canonical links, the sitemap and robots.txt all pointing at a dead domain —
// which is what search engines take to be this site's real address. The failure
// is silent: the pages render perfectly.
//
// apps/web/Dockerfile now requires NEXT_PUBLIC_SITE_URL at build time, so a
// deployed image cannot reach this fallback at all. It remains for `next dev`
// and unit tests, and now names the live domain so a miss is harmless.
//
// The fallback MUST be the `www` host. It was the apex, and on 2026-08-18
// production was observed emitting `https://flacroncv.com/en` as the canonical
// of every page while the apex answers `302` to `https://www.flacroncv.com/en`
// — a canonical nominating a host that redirects away, so Google is told the
// real address is one that declines the job. That covers canonicals, hreflang,
// og:url, all sitemap <loc>s and the robots Sitemap line, since every one of
// them derives from this constant.
//
// ⚠️ Fixing this constant is only half the fix. NEXT_PUBLIC_SITE_URL must ALSO
// be set to `https://www.flacroncv.com` on the deploy platform, and because
// every NEXT_PUBLIC_* is inlined by `next build`, changing it requires a
// REBUILD, not a redeploy. The Dockerfile/ECS path fails the build when it is
// missing; the live Amplify path has no equivalent guard, so there a miss is
// silent and this fallback is the only thing standing behind it.
export const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://www.flacroncv.com';

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
  robots?: Metadata['robots'];
}): Metadata {
  const { locale, path, title, description, robots } = opts;
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
    ...(robots ? { robots } : {}),
  };
}
