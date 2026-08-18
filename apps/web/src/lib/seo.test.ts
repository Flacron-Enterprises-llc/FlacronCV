import { describe, it, expect } from 'vitest';
import { LOCALES, SITE_URL, localizedAlternates, pageMetadata } from '@/lib/seo';

/**
 * The canonical host has silently regressed twice.
 *
 * First it was the dead Render domain, so every canonical, the sitemap and
 * robots.txt nominated a host that no longer existed. Then it was the apex,
 * `https://flacroncv.com`, which answers 302 to the `www` host — a canonical
 * pointing at a host that redirects away, observed live on 2026-08-18.
 *
 * Both failures were invisible: the pages render perfectly either way, and no
 * test looked at the one constant every SEO surface derives from. This is that
 * test. It exercises the FALLBACK, because `NEXT_PUBLIC_SITE_URL` is unset here
 * — which is exactly the case the fallback exists to survive.
 */
describe('canonical origin', () => {
  it('is the www host, not the redirecting apex', () => {
    expect(SITE_URL).toBe('https://www.flacroncv.com');
  });

  it('never nominates the bare apex', () => {
    // `https://flacroncv.com/...` would match the apex; the www host does not.
    expect(SITE_URL).not.toMatch(/^https:\/\/flacroncv\.com/);
  });

  it('has no trailing slash, so joined paths cannot double up', () => {
    expect(SITE_URL).not.toMatch(/\/$/);
    expect(localizedAlternates('/about-us', 'en')!.canonical).toBe(
      'https://www.flacroncv.com/en/about-us',
    );
  });
});

describe('localizedAlternates', () => {
  it('emits one entry per locale plus x-default', () => {
    const languages = localizedAlternates('/templates', 'fr')!.languages!;
    expect(Object.keys(languages).sort()).toEqual([...LOCALES].concat('x-default').sort());
  });

  it('points x-default at the default locale', () => {
    expect(localizedAlternates('', 'ar')!.languages!['x-default']).toBe(
      'https://www.flacroncv.com/en',
    );
  });

  it('keeps the canonical on the requested locale', () => {
    expect(localizedAlternates('', 'ar')!.canonical).toBe('https://www.flacroncv.com/ar');
  });

  it('builds the home path without a trailing slash', () => {
    expect(localizedAlternates('', 'en')!.canonical).toBe('https://www.flacroncv.com/en');
  });
});

describe('pageMetadata', () => {
  const meta = pageMetadata({
    locale: 'de',
    path: '/about-us',
    title: 'Über uns',
    description: 'Beschreibung',
  });

  it('gives OpenGraph an absolute canonical url', () => {
    expect((meta.openGraph as { url?: string }).url).toBe(
      'https://www.flacroncv.com/de/about-us',
    );
  });

  it('leaves the bare title for the layout template to suffix', () => {
    // The root layout applies `%s | FlacronCV`; passing a suffixed title here
    // would render it twice.
    expect(meta.title).toBe('Über uns');
    expect((meta.openGraph as { title?: string }).title).toBe('Über uns | FlacronCV');
  });

  it('carries alternates so no page relies on the layout default', () => {
    expect(meta.alternates!.canonical).toBe('https://www.flacroncv.com/de/about-us');
    expect(meta.alternates!.languages).toBeDefined();
  });

  it('passes through an explicit robots directive when given one', () => {
    const noindex = pageMetadata({
      locale: 'en',
      path: '/confirm',
      title: 'Confirm',
      description: 'Token',
      robots: { index: false, follow: false },
    });
    expect(noindex.robots).toEqual({ index: false, follow: false });
  });
});
