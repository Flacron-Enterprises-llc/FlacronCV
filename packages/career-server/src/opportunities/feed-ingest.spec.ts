import { readFileSync } from 'fs';
import { join } from 'path';
import { FeedIngester, feedConfigFromEnv, feedsConfigured, parseBoards } from './feed-ingest';
import type { NormalizedListing } from './normalize';

const fixture = (name: string) => JSON.parse(readFileSync(join(__dirname, 'fixtures', name), 'utf8'));

function fakeFetch(routes: Array<[RegExp, number, unknown]>) {
  const urls: string[] = [];
  const headers: Array<Record<string, string>> = [];
  const impl = (async (url: string, init?: RequestInit) => {
    urls.push(url);
    headers.push((init?.headers ?? {}) as Record<string, string>);
    const route = routes.find(([re]) => re.test(url));
    if (!route) return new Response('not found', { status: 404 });
    return new Response(JSON.stringify(route[2]), { status: route[1], headers: { 'Content-Type': 'application/json' } });
  }) as unknown as typeof fetch;
  return { impl, urls, headers };
}

function sink() {
  const batches: NormalizedListing[][] = [];
  return { batches, ingest: async (_who: string | null, listings: NormalizedListing[]) => { batches.push(listings); return { inserted: listings.length, revised: 0 }; } };
}

describe('feed configuration', () => {
  it('is off unless a source is configured, and validates board ids and keys', () => {
    expect(feedsConfigured(feedConfigFromEnv({}))).toBe(false);
    expect(parseBoards('acme:Acme Corp; bad id:X; :Nope; globex:Globex')).toEqual([{ id: 'acme', organization: 'Acme Corp' }, { id: 'globex', organization: 'Globex' }]);
    expect(feedConfigFromEnv({ ADZUNA_APP_ID: 'id' }).adzuna).toBeNull();
    expect(feedConfigFromEnv({ ADZUNA_APP_ID: 'id', ADZUNA_APP_KEY: 'k', ADZUNA_COUNTRY: 'GB' }).adzuna).toEqual({ appId: 'id', appKey: 'k', country: 'gb' });
    expect(feedConfigFromEnv({ USAJOBS_API_KEY: 'k', USAJOBS_USER_AGENT: 'no-email' }).usajobs).toBeNull();
    expect(feedsConfigured(feedConfigFromEnv({ JOB_FEED_LEVER_SITES: 'acme:Acme' }))).toBe(true);
  });
});

describe('FeedIngester', () => {
  it('reads configured boards and searches saved-search keywords, importing parsed listings', async () => {
    const config = feedConfigFromEnv({
      JOB_FEED_GREENHOUSE_BOARDS: 'acme:Acme Corp', JOB_FEED_LEVER_SITES: 'globex:Globex',
      ADZUNA_APP_ID: 'id', ADZUNA_APP_KEY: 'key', USAJOBS_API_KEY: 'uk', USAJOBS_USER_AGENT: 'ops@example.test',
    });
    const { impl, urls, headers } = fakeFetch([
      [/boards-api\.greenhouse\.io\/v1\/boards\/acme\/jobs\?content=true$/, 200, fixture('greenhouse.json')],
      [/api\.lever\.co\/v0\/postings\/globex\?mode=json&limit=100&skip=0$/, 200, fixture('lever.json')],
      [/api\.adzuna\.com\/v1\/api\/jobs\/us\/search\/1\?/, 200, fixture('adzuna.json')],
      [/data\.usajobs\.gov\/api\/search\?/, 200, fixture('usajobs.json')],
    ]);
    const out = sink();
    const result = await new FeedIngester(config, out, async () => ['data analyst'], impl).runOnce();
    expect(result.failedSources).toEqual([]);
    expect(result.sources).toBe(4);
    expect(result.fetched).toBeGreaterThan(0);
    expect(result.inserted).toBe(result.fetched);
    expect(out.batches.flat().every((l) => ['greenhouse', 'lever', 'adzuna', 'usajobs'].includes(l.provider))).toBe(true);
    expect(out.batches.flat().find((l) => l.provider === 'greenhouse')?.organization).toBe('Acme Corp');
    const adz = urls.find((u) => u.includes('adzuna'))!;
    expect(new URL(adz).searchParams.get('what')).toBe('data analyst');
    const usIdx = urls.findIndex((u) => u.includes('usajobs'));
    expect(headers[usIdx]).toMatchObject({ 'Authorization-Key': 'uk', 'User-Agent': 'ops@example.test', Host: 'data.usajobs.gov' });
  });

  it('isolates a failing source, never queries search feeds without keywords, and fetches nothing when unconfigured', async () => {
    const config = feedConfigFromEnv({ JOB_FEED_GREENHOUSE_BOARDS: 'down:Down Inc;acme:Acme Corp', ADZUNA_APP_ID: 'id', ADZUNA_APP_KEY: 'key' });
    const { impl, urls } = fakeFetch([
      [/boards\/down\//, 503, {}],
      [/boards\/acme\//, 200, fixture('greenhouse.json')],
    ]);
    const out = sink();
    const result = await new FeedIngester(config, out, async () => [], impl).runOnce();
    expect(result.failedSources).toEqual(['greenhouse:down']);
    expect(result.inserted).toBeGreaterThan(0);
    expect(urls.some((u) => u.includes('adzuna'))).toBe(false);

    const none = fakeFetch([]);
    const empty = await new FeedIngester(feedConfigFromEnv({}), sink(), async () => ['x'], none.impl).runOnce();
    expect(empty).toEqual({ sources: 0, failedSources: [], fetched: 0, inserted: 0, revised: 0 });
    expect(none.urls).toEqual([]);
  });

  it('pages through a large Lever site and stops at a short page', async () => {
    const config = feedConfigFromEnv({ JOB_FEED_LEVER_SITES: 'big:Big Co' });
    const one = fixture('lever.json')[0];
    const page = (n: number, offset: number) => Array.from({ length: n }, (_, i) => ({ ...one, id: `p-${offset + i}` }));
    const { impl, urls } = fakeFetch([
      [/skip=0$/, 200, page(100, 0)],
      [/skip=100$/, 200, page(100, 100)],
      [/skip=200$/, 200, page(7, 200)],
    ]);
    const out = sink();
    const result = await new FeedIngester(config, out, async () => [], impl).runOnce();
    expect(urls).toHaveLength(3);
    expect(result.fetched).toBe(207);
    expect(new Set(out.batches.flat().map((l) => l.sourceId)).size).toBe(207);
  });

  it('caps search terms', async () => {
    const config = feedConfigFromEnv({ ADZUNA_APP_ID: 'id', ADZUNA_APP_KEY: 'key' });
    const { impl, urls } = fakeFetch([[/adzuna/, 200, { results: [] }]]);
    await new FeedIngester(config, sink(), async () => Array.from({ length: 40 }, (_, i) => `term ${i}`), impl).runOnce();
    expect(urls).toHaveLength(15);
  });
});
