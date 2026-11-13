/**
 * Old V2 public portfolio links (`/p/:slug`, `/:locale/p/:slug`) now live at
 * `/:locale/portfolio/:slug`. Next.js redirects run before the next-intl
 * middleware and pass the query string (the private-link `?token=`) through.
 *
 * Without a locale the redirect goes to `/portfolio/:slug`, and the next-intl
 * middleware then adds the visitor's locale exactly as for any other page.
 * Only the six site locales match the prefixed form, so an unrelated
 * `/<segment>/p/...` path is left alone.
 */
export const LEGACY_REDIRECT_LOCALES = ['en', 'es', 'fr', 'de', 'ar', 'ur'];

/** @type {Array<{ source: string; destination: string; permanent: boolean }>} */
export const legacyRedirects = [
  {
    source: `/:locale(${LEGACY_REDIRECT_LOCALES.join('|')})/p/:slug`,
    destination: '/:locale/portfolio/:slug',
    permanent: true,
  },
  {
    source: '/p/:slug',
    destination: '/portfolio/:slug',
    permanent: true,
  },
];
