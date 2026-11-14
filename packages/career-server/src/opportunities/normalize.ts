import type {
  ListingArrangement,
  ListingCompensation,
  ListingDetails,
  ListingSchedule,
  ListingSeniority,
  OpportunityCategory,
} from '@flacroncv/career-shared';

export type { ListingCompensation };

export interface NormalizedListing {
  provider: 'adzuna' | 'usajobs' | 'greenhouse' | 'lever' | 'paste';
  sourceId: string;
  title: string;
  organization: string;
  description: string;
  locations: string[];
  sourceUrl: string | null;
  deadline: string | null;
  compensation: ListingCompensation;
  category: OpportunityCategory;
  status: 'open' | 'closed';
  /** Only a paste states this today; feeds leave it out and it stays unknown. */
  sponsorship?: 'unknown' | 'stated_yes' | 'stated_no';
  /** The optional fields below are null or absent when the source does not state them. */
  publishedAt?: string | null;
  remoteRestriction?: string | null;
  schedule?: ListingSchedule | null;
  arrangement?: ListingArrangement | null;
  seniority?: ListingSeniority | null;
  details?: ListingDetails;
  latitude?: number | null;
  longitude?: number | null;
}

const EMPTY_PAY: ListingCompensation = { minimum: null, maximum: null, currency: null, period: null };

/** Adzuna search `results`. A predicted salary is not the employer's figure, so pay stays unknown. */
export function parseAdzuna(payload: unknown): NormalizedListing[] {
  if (!isRecord(payload) || !Array.isArray(payload.results)) return [];
  const listings: NormalizedListing[] = [];
  for (const item of payload.results) {
    if (!isRecord(item) || !isRecord(item.company)) continue;
    const sourceId = clip(text(item.id), 255);
    const title = clip(text(item.title), 300);
    const organization = clip(text(item.company.display_name), 300);
    if (!sourceId || !title || !organization) continue;
    const predicted = item.salary_is_predicted === true || item.salary_is_predicted === '1';
    listings.push({
      provider: 'adzuna',
      sourceId,
      title,
      organization,
      description: clip(text(item.description), 20000),
      locations: place(isRecord(item.location) ? item.location.display_name : null),
      sourceUrl: url(item.redirect_url),
      deadline: null,
      compensation: predicted
        ? EMPTY_PAY
        : { minimum: money(item.salary_min), maximum: money(item.salary_max), currency: null, period: null },
      category: 'job',
      status: 'open',
      publishedAt: day(item.created),
      schedule: item.contract_time === 'full_time' || item.contract_time === 'part_time' ? item.contract_time : item.contract_type === 'contract' ? 'contract' : null,
      ...coordinates(item.latitude, item.longitude),
    });
  }
  return listings;
}

/** USAJOBS `SearchResult.SearchResultItems`. Missing pay stays null. */
export function parseUsajobs(payload: unknown): NormalizedListing[] {
  if (!isRecord(payload) || !isRecord(payload.SearchResult) || !Array.isArray(payload.SearchResult.SearchResultItems)) {
    return [];
  }
  const listings: NormalizedListing[] = [];
  for (const item of payload.SearchResult.SearchResultItems) {
    if (!isRecord(item) || !isRecord(item.MatchedObjectDescriptor)) continue;
    const job = item.MatchedObjectDescriptor;
    const sourceId = clip(text(item.MatchedObjectId), 255);
    const title = clip(text(job.PositionTitle), 300);
    const organization = clip(text(job.OrganizationName), 300);
    if (!sourceId || !title || !organization) continue;
    const pay = Array.isArray(job.PositionRemuneration) ? job.PositionRemuneration[0] : null;
    const summary = isRecord(job.UserArea) && isRecord(job.UserArea.Details) ? job.UserArea.Details.JobSummary : null;
    listings.push({
      provider: 'usajobs',
      sourceId,
      title,
      organization,
      description: clip(text(summary ?? job.QualificationSummary), 20000),
      locations: locations(job.PositionLocation),
      sourceUrl: url(job.PositionURI),
      deadline: day(job.ApplicationCloseDate),
      compensation: isRecord(pay)
        ? { minimum: money(pay.MinimumRange), maximum: money(pay.MaximumRange), currency: null, period: text(pay.RateIntervalCode) || null }
        : EMPTY_PAY,
      category: 'government',
      status: 'open',
      publishedAt: day(job.PublicationStartDate),
      schedule: scheduleOf(Array.isArray(job.PositionSchedule) && isRecord(job.PositionSchedule[0]) ? job.PositionSchedule[0].Name : null),
      ...usajobsCoordinates(job.PositionLocation),
    });
  }
  return listings;
}

/**
 * Greenhouse job board `jobs`. The employer name is the board, not a field
 * on the job, so the caller passes it. HTML in `content` is reduced to text.
 */
export function parseGreenhouse(payload: unknown, organization: string): NormalizedListing[] {
  const employer = clip(organization, 300);
  if (!employer || !isRecord(payload) || !Array.isArray(payload.jobs)) return [];
  const listings: NormalizedListing[] = [];
  for (const item of payload.jobs) {
    if (!isRecord(item)) continue;
    const sourceId = clip(text(item.id), 255);
    const title = clip(text(item.title), 300);
    if (!sourceId || !title) continue;
    listings.push({
      provider: 'greenhouse',
      sourceId,
      title,
      organization: employer,
      description: clip(plain(text(item.content)), 20000),
      locations: place(isRecord(item.location) ? item.location.name : null),
      sourceUrl: url(item.absolute_url),
      deadline: null,
      compensation: EMPTY_PAY,
      category: 'job',
      status: 'open',
    });
  }
  return listings;
}

/** Lever postings. The employer name is the site, so the caller passes it. */
export function parseLever(payload: unknown, organization: string): NormalizedListing[] {
  const employer = clip(organization, 300);
  if (!employer || !Array.isArray(payload)) return [];
  const listings: NormalizedListing[] = [];
  for (const item of payload) {
    if (!isRecord(item)) continue;
    const sourceId = clip(text(item.id), 255);
    const title = clip(text(item.text), 300);
    if (!sourceId || !title) continue;
    listings.push({
      provider: 'lever',
      sourceId,
      title,
      organization: employer,
      description: clip(text(item.descriptionPlain), 20000),
      locations: place(isRecord(item.categories) ? item.categories.location : null),
      sourceUrl: url(item.hostedUrl),
      deadline: null,
      compensation: EMPTY_PAY,
      category: 'job',
      status: 'open',
      publishedAt: typeof item.createdAt === 'number' && Number.isFinite(item.createdAt) ? new Date(item.createdAt).toISOString().slice(0, 10) : null,
      schedule: scheduleOf(isRecord(item.categories) ? item.categories.commitment : null),
      arrangement: item.workplaceType === 'remote' || item.workplaceType === 'hybrid' ? item.workplaceType : item.workplaceType === 'on-site' ? 'onsite' : null,
    });
  }
  return listings;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function text(value: unknown): string {
  if (typeof value === 'string') return value.trim();
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  return '';
}

function clip(value: string, max: number): string {
  return value.length <= max ? value : value.slice(0, max);
}

function place(value: unknown): string[] {
  const name = clip(text(value), 300);
  return name.length > 0 ? [name] : [];
}

function locations(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const names: string[] = [];
  for (const item of value) {
    if (!isRecord(item)) continue;
    const name = clip(text(item.LocationName), 300);
    if (name.length > 0) names.push(name);
  }
  return names;
}

function url(value: unknown): string | null {
  const raw = text(value);
  if (!raw.startsWith('https://') && !raw.startsWith('http://')) return null;
  return clip(raw, 2000);
}

function money(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value) && value > 0) return value;
  if (typeof value === 'string' && /^\d+(\.\d+)?$/.test(value.trim())) {
    const parsed = Number(value.trim());
    return parsed > 0 ? parsed : null;
  }
  return null;
}

function day(value: unknown): string | null {
  const raw = text(value);
  return /^\d{4}-\d{2}-\d{2}/.test(raw) ? raw.slice(0, 10) : null;
}

/** A feed's own schedule words; anything else stays unknown. */
function scheduleOf(value: unknown): ListingSchedule | null {
  const raw = text(value).toLowerCase();
  if (/full[\s-]?time/.test(raw)) return 'full_time';
  if (/part[\s-]?time/.test(raw)) return 'part_time';
  if (/temporary|seasonal/.test(raw)) return 'temporary';
  if (/contract|fixed[\s-]?term/.test(raw)) return 'contract';
  return null;
}

function coordinates(lat: unknown, lon: unknown): { latitude: number | null; longitude: number | null } {
  const latitude = typeof lat === 'number' ? lat : typeof lat === 'string' ? Number(lat) : NaN;
  const longitude = typeof lon === 'number' ? lon : typeof lon === 'string' ? Number(lon) : NaN;
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude) || Math.abs(latitude) > 90 || Math.abs(longitude) > 180) {
    return { latitude: null, longitude: null };
  }
  return { latitude, longitude };
}

/** Only a single-location federal posting has one point; several locations have no single coordinate. */
function usajobsCoordinates(value: unknown): { latitude: number | null; longitude: number | null } {
  if (!Array.isArray(value) || value.length !== 1 || !isRecord(value[0])) return { latitude: null, longitude: null };
  return coordinates(value[0].Latitude, value[0].Longitude);
}

function plain(html: string): string {
  return html
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim();
}
