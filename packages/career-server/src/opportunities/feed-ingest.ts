import { parseAdzuna, parseGreenhouse, parseLever, parseUsajobs } from './normalize';
import type { NormalizedListing } from './normalize';

/**
 * Scheduled import of job listings from licensed or public feeds. Nothing is
 * fetched unless configured:
 * - Greenhouse boards / Lever sites (public job-board APIs, no key): the
 *   operator lists which employers' boards to read.
 * - Adzuna and USAJOBS (free API keys): searched with the keywords people put
 *   in their active saved searches, capped, so only relevant listings arrive.
 * Each source is isolated; one failing never stops the others. Listings go
 * through the normal import (dedupe, revisions), then alert matching runs.
 */
export interface BoardSource { id: string; organization: string }
export interface FeedConfig {
  greenhouse: BoardSource[];
  lever: BoardSource[];
  adzuna: { appId: string; appKey: string; country: string } | null;
  usajobs: { apiKey: string; userAgent: string } | null;
}

const BOARD_ID = /^[A-Za-z0-9_-]{1,100}$/;
const COUNTRY = /^[a-z]{2}$/;
export const MAX_SEARCH_TERMS = 15;
const PER_PAGE = 50;
const TIMEOUT_MS = 20_000;
const LEVER_PAGE = 100;
const LEVER_MAX_PAGES = 10;

/** `board:Employer name; other:Other employer` — ids are board tokens / site names. */
export function parseBoards(value: string | undefined): BoardSource[] {
  const out: BoardSource[] = [];
  for (const entry of (value ?? '').split(';')) {
    const at = entry.indexOf(':');
    if (at <= 0) continue;
    const id = entry.slice(0, at).trim();
    const organization = entry.slice(at + 1).trim();
    if (BOARD_ID.test(id) && organization.length > 0 && organization.length <= 300) out.push({ id, organization });
  }
  return out;
}

export function feedConfigFromEnv(env: NodeJS.ProcessEnv = process.env): FeedConfig {
  const appId = env.ADZUNA_APP_ID?.trim() ?? '';
  const appKey = env.ADZUNA_APP_KEY?.trim() ?? '';
  const country = (env.ADZUNA_COUNTRY?.trim().toLowerCase() || 'us');
  const usKey = env.USAJOBS_API_KEY?.trim() ?? '';
  const usAgent = env.USAJOBS_USER_AGENT?.trim() ?? '';
  return {
    greenhouse: parseBoards(env.JOB_FEED_GREENHOUSE_BOARDS),
    lever: parseBoards(env.JOB_FEED_LEVER_SITES),
    adzuna: appId && appKey && COUNTRY.test(country) ? { appId, appKey, country } : null,
    usajobs: usKey && /@/.test(usAgent) ? { apiKey: usKey, userAgent: usAgent } : null,
  };
}

export function feedsConfigured(config: FeedConfig): boolean {
  return config.greenhouse.length > 0 || config.lever.length > 0 || config.adzuna !== null || config.usajobs !== null;
}

export interface FeedSink { ingest(candidateAuthUserId: string | null, listings: NormalizedListing[]): Promise<{ inserted: number; revised: number }> }
export interface FeedRunResult { sources: number; failedSources: string[]; fetched: number; inserted: number; revised: number }

export class FeedIngester {
  constructor(
    private readonly config: FeedConfig,
    private readonly sink: FeedSink,
    /** Distinct active saved-search keywords (lower-cased), at most MAX_SEARCH_TERMS. */
    private readonly searchTerms: () => Promise<string[]>,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  async runOnce(): Promise<FeedRunResult> {
    const result: FeedRunResult = { sources: 0, failedSources: [], fetched: 0, inserted: 0, revised: 0 };
    const tasks: Array<{ name: string; load: () => Promise<NormalizedListing[]> }> = [];
    for (const b of this.config.greenhouse) {
      tasks.push({ name: `greenhouse:${b.id}`, load: async () => parseGreenhouse(await this.json(`https://boards-api.greenhouse.io/v1/boards/${encodeURIComponent(b.id)}/jobs?content=true`), b.organization) });
    }
    for (const s of this.config.lever) {
      // Large employers return megabytes in one response; read it in pages instead.
      tasks.push({ name: `lever:${s.id}`, load: async () => {
        const listings: NormalizedListing[] = [];
        for (let page = 0; page < LEVER_MAX_PAGES; page++) {
          const payload = await this.json(`https://api.lever.co/v0/postings/${encodeURIComponent(s.id)}?mode=json&limit=${LEVER_PAGE}&skip=${page * LEVER_PAGE}`);
          listings.push(...parseLever(payload, s.organization));
          if (!Array.isArray(payload) || payload.length < LEVER_PAGE) break;
        }
        return listings;
      } });
    }
    const terms = this.config.adzuna || this.config.usajobs ? (await this.searchTerms()).slice(0, MAX_SEARCH_TERMS) : [];
    const adzuna = this.config.adzuna;
    if (adzuna) {
      for (const term of terms) {
        const q = new URLSearchParams({ app_id: adzuna.appId, app_key: adzuna.appKey, results_per_page: String(PER_PAGE), what: term, 'content-type': 'application/json' });
        tasks.push({ name: 'adzuna', load: async () => parseAdzuna(await this.json(`https://api.adzuna.com/v1/api/jobs/${adzuna.country}/search/1?${q}`)) });
      }
    }
    const usajobs = this.config.usajobs;
    if (usajobs) {
      for (const term of terms) {
        const q = new URLSearchParams({ Keyword: term, ResultsPerPage: String(PER_PAGE) });
        tasks.push({ name: 'usajobs', load: async () => parseUsajobs(await this.json(`https://data.usajobs.gov/api/search?${q}`, {
          Host: 'data.usajobs.gov', 'User-Agent': usajobs.userAgent, 'Authorization-Key': usajobs.apiKey,
        })) });
      }
    }
    for (const task of tasks) {
      result.sources += 1;
      try {
        const listings = await task.load();
        result.fetched += listings.length;
        if (listings.length > 0) {
          const counts = await this.sink.ingest(null, listings);
          result.inserted += counts.inserted;
          result.revised += counts.revised;
        }
      } catch {
        // The source name only (never a key or URL with a key) so a persistent failure is visible.
        if (!result.failedSources.includes(task.name)) result.failedSources.push(task.name);
      }
    }
    return result;
  }

  private async json(url: string, headers: Record<string, string> = {}): Promise<unknown> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    try {
      const response = await this.fetchImpl(url, { headers: { Accept: 'application/json', ...headers }, signal: controller.signal });
      if (!response.ok) throw new Error(`feed responded ${response.status}`);
      return await response.json();
    } finally {
      clearTimeout(timer);
    }
  }
}

/** Distinct keywords of active saved searches, most common first. */
export const SEARCH_TERMS_SQL = `
  SELECT lower(trim(filters->>'q')) AS term, count(*) AS n
    FROM saved_searches
   WHERE NOT paused AND coalesce(trim(filters->>'q'), '') <> '' AND length(trim(filters->>'q')) <= 100
   GROUP BY 1 ORDER BY n DESC, term LIMIT ${MAX_SEARCH_TERMS}`;
