import { describe, expect, it } from 'vitest';
import { getPathMatch } from 'next/dist/shared/lib/router/utils/path-match';
import { prepareDestination } from 'next/dist/shared/lib/router/utils/prepare-destination';
import { legacyRedirects } from '../../legacy-redirects.mjs';

/**
 * Resolves a request the way Next.js applies `redirects()` (same matcher and
 * destination builder), so this checks the real behaviour, not a copy of it.
 */
function resolve(pathname: string, query: Record<string, string> = {}): { location: string; permanent: boolean } | null {
  for (const rule of legacyRedirects) {
    const params = getPathMatch(rule.source, { removeUnnamedParams: true, strict: true })(pathname);
    if (!params) continue;
    const { parsedDestination } = prepareDestination({ appendParamsToQuery: false, destination: rule.destination, params, query });
    const search = new URLSearchParams(parsedDestination.query as Record<string, string>).toString();
    return { location: `${parsedDestination.pathname}${search ? `?${search}` : ''}`, permanent: rule.permanent };
  }
  return null;
}

describe('old V2 portfolio links', () => {
  it('sends /:locale/p/:slug to /:locale/portfolio/:slug and keeps the private-link token', () => {
    expect(resolve('/fr/p/ada-lovelace', { token: 'abc123' })).toEqual({
      location: '/fr/portfolio/ada-lovelace?token=abc123',
      permanent: true,
    });
    expect(resolve('/ar/p/ada')?.location).toBe('/ar/portfolio/ada');
  });

  it('sends unprefixed /p/:slug to /portfolio/:slug, where the locale middleware adds the language', () => {
    expect(resolve('/p/ada', { token: 't' })?.location).toBe('/portfolio/ada?token=t');
  });

  it('leaves other paths alone', () => {
    expect(resolve('/xx/p/ada')).toBeNull();
    expect(resolve('/en/portfolio/ada')).toBeNull();
    expect(resolve('/p')).toBeNull();
    expect(resolve('/en/p/ada/extra')).toBeNull();
  });
});
