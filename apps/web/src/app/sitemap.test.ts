import { describe, it, expect } from 'vitest';
import sitemap from './sitemap';

describe('sitemap', () => {
  const entries = sitemap();
  const urls = entries.map((e) => e.url);

  it('keeps privacy and contact as six-locale URLs with full hreflang', () => {
    const privacy = urls.filter((u) => u.endsWith('/privacy-policy'));
    expect(privacy).toHaveLength(6);
    const contact = entries.find((e) => e.url.endsWith('/en/contact-us'))!;
    expect(Object.keys(contact.alternates!.languages!).sort()).toEqual(
      ['ar', 'de', 'en', 'es', 'fr', 'ur', 'x-default'].sort(),
    );
  });

  it('omits /testimonials until real quotes exist', () => {
    expect(urls.some((u) => u.includes('/testimonials'))).toBe(false);
  });

  it('lists English legal bodies once, canonicalised to en, with en + x-default only', () => {
    for (const path of ['/terms-of-service', '/cookie-policy', '/disclaimer', '/refund-policy']) {
      const matches = entries.filter((e) => e.url.endsWith(path));
      expect(matches).toHaveLength(1);
      expect(matches[0].url).toBe(`https://www.flacroncv.com/en${path}`);
      expect(matches[0].alternates!.languages).toEqual({
        en: `https://www.flacroncv.com/en${path}`,
        'x-default': `https://www.flacroncv.com/en${path}`,
      });
    }
  });
});
