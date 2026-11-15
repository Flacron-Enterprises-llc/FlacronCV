import { ApiError } from '../../../../../packages/career-api-client/src/client';
import type {
  OpportunityCompensation,
  OpportunityItem,
  OpportunitySearchQuery,
  OpportunitySearchResult,
  PasteOpportunityInput,
} from '../../../../../packages/career-api-client/src/types';
import {
  fieldsForCategory,
  isOpportunityCategory,
  LISTING_SCHEDULES,
  LISTING_SENIORITIES,
  OPPORTUNITY_CATEGORIES,
  type ListingDetailField,
} from '../../../../../packages/career-shared/src/opportunities';
import { MIN_LISTING_TEXT } from '../../../../../packages/career-shared/src/listing-extract';
import { hasKey, intlLocale, t } from '../../i18n';

/**
 * Search filters, listing facts and the paste form for the mobile job search.
 * Port of the website's OpportunityScreen / ListingFacts (same query, same
 * labels, same "not stated" rules). Copy: `careerOpportunities` (the
 * website's `career.opportunities`). Unknown stays unknown; nothing is guessed.
 */

/** The search form's state; every field empty means "no filter". */
export interface OpportunityFilters {
  q: string;
  role: string;
  category: string;
  minPay: string;
  payCurrency: string;
  payStated: boolean;
  schedule: string;
  seniority: string;
  place: string;
  radiusMiles: string;
  remote: string;
  postedWithinDays: string;
  deadlineBefore: string;
  followedOnly: boolean;
  provider: string;
  includeExpired: boolean;
}

export const EMPTY_FILTERS: OpportunityFilters = {
  q: '',
  role: '',
  category: '',
  minPay: '',
  payCurrency: '',
  payStated: false,
  schedule: '',
  seniority: '',
  place: '',
  radiusMiles: '',
  remote: '',
  postedWithinDays: '',
  deadlineBefore: '',
  followedOnly: false,
  provider: '',
  includeExpired: false,
};

/** Only the filters the person set; expired listings are hidden unless asked for (website `searchQuery`). */
export function searchQuery(filters: OpportunityFilters): OpportunitySearchQuery {
  const query: OpportunitySearchQuery = { q: filters.q.trim() };
  const text = (value: string) => (value.trim().length > 0 ? value.trim() : undefined);
  const whole = (value: string) => (/^\d+$/.test(value.trim()) ? Number(value.trim()) : undefined);
  const set = <K extends keyof OpportunitySearchQuery>(key: K, value: OpportunitySearchQuery[K] | undefined) => {
    if (value !== undefined) query[key] = value;
  };
  set('role', text(filters.role));
  set('category', text(filters.category));
  set('minPay', whole(filters.minPay));
  set('payCurrency', text(filters.payCurrency)?.toUpperCase());
  if (filters.payStated) query.payStated = true;
  set('schedule', text(filters.schedule));
  set('seniority', text(filters.seniority));
  set('place', text(filters.place));
  set('radiusMiles', whole(filters.radiusMiles));
  set('remote', filters.remote === 'restricted' || filters.remote === 'unrestricted' ? filters.remote : undefined);
  set('postedWithinDays', whole(filters.postedWithinDays));
  set('deadlineBefore', /^\d{4}-\d{2}-\d{2}$/.test(filters.deadlineBefore.trim()) ? filters.deadlineBefore.trim() : undefined);
  if (filters.followedOnly) query.followedOnly = true;
  set('provider', text(filters.provider));
  if (!filters.includeExpired) query.includeExpired = false;
  return query;
}

/** Any filter beyond the default makes an empty list a "no results" answer rather than an empty page. */
export function isFiltered(filters: OpportunityFilters): boolean {
  return JSON.stringify(searchQuery(filters)) !== JSON.stringify(searchQuery(EMPTY_FILTERS));
}

/** How many filters (not the text query) are set; shown on the Filters button. */
export function activeFilterCount(filters: OpportunityFilters): number {
  // "Include expired" is sent by leaving `includeExpired: false` out, so it is counted from the form.
  const set = Object.keys(searchQuery(filters)).filter((key) => key !== 'q' && key !== 'includeExpired').length;
  return set + (filters.includeExpired ? 1 : 0);
}

export const FILTER_CATEGORIES = ['full_time', 'part_time', 'temporary', 'contract', 'remote', 'hybrid', ...OPPORTUNITY_CATEGORIES] as const;
export const PROVIDERS = ['paste', 'adzuna', 'usajobs', 'greenhouse', 'lever'] as const;
export const POSTED_WITHIN = ['1', '7', '30'] as const;
export { LISTING_SCHEDULES, LISTING_SENIORITIES, OPPORTUNITY_CATEGORIES };

/** A coded value read through `careerOpportunities.<prefix><value>`, or the raw value when there is no copy for it. */
function coded(prefix: string, value: string): string {
  const key = `careerOpportunities.${prefix}${value}`;
  return hasKey(key) ? t(key) : value;
}

export function categoryLabel(value: string): string {
  return (OPPORTUNITY_CATEGORIES as readonly string[]).includes(value) ? coded('category_', value) : coded('filter_category_', value);
}
export const scheduleLabel = (value: string) => coded('schedule_', value);
export const seniorityLabel = (value: string) => coded('seniority_', value);
export const arrangementLabel = (value: string) => coded('arrangement_', value);
export const detailLabel = (field: ListingDetailField) => coded('detail_', field);

/** Feed brand names are not translated. */
const PROVIDER_BRANDS: Record<string, string> = { adzuna: 'Adzuna', usajobs: 'USAJOBS' };

export function providerLabel(provider: string): string {
  if (PROVIDER_BRANDS[provider]) return PROVIDER_BRANDS[provider];
  if (provider === 'paste' || provider === 'greenhouse' || provider === 'lever') return coded('provider_', provider);
  return t('careerOpportunities.provider_other');
}

/** Filters the search could not apply, each with its reason (never dropped silently). */
export function notAppliedText(entry: NonNullable<OpportunitySearchResult['notApplied']>[number]): string {
  return coded('not_applied_', entry.reason);
}

/** The plan's radius limit when the API refused a distance, else null. */
export function radiusLimitOf(error: unknown): number | null {
  if (error instanceof ApiError && error.code === 'validation_error' && error.body?.field === 'radiusMiles' && typeof error.body.limit === 'number') {
    return error.body.limit;
  }
  return null;
}

/** "60,000–70,000 US$" in the interface language, or null when the listing states no pay (website `formatPay`). */
export function formatPay(compensation: OpportunityCompensation, locale: string = intlLocale()): string | null {
  const { minimum, maximum, currency } = compensation;
  if (minimum === null && maximum === null) return null;
  const plain = (n: number) => {
    try {
      return new Intl.NumberFormat(locale, { maximumFractionDigits: 0 }).format(n);
    } catch {
      return String(Math.round(n));
    }
  };
  let one = plain;
  if (currency) {
    try {
      const format = new Intl.NumberFormat(locale, { style: 'currency', currency, maximumFractionDigits: 0 });
      one = (n: number) => format.format(n);
    } catch {
      one = (n: number) => `${plain(n)} ${currency}`;
    }
  }
  if (minimum !== null && maximum !== null && maximum !== minimum) return `${one(minimum)}–${one(maximum)}`;
  return one((minimum ?? maximum) as number);
}

const PERIODS = new Set(['hour', 'day', 'week', 'month', 'year']);

/** A YYYY-MM-DD date read as a calendar day (no time-zone shift) in the interface language. */
export function formatListingDay(value: string, locale: string = intlLocale()): string {
  const date = new Date(`${value.slice(0, 10)}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return value;
  try {
    return new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeZone: 'UTC' }).format(date);
  } catch {
    return value.slice(0, 10);
  }
}

export interface ListingFactsView {
  rows: { label: string; value: string }[];
  /** Fields the listing is silent about, listed once rather than one by one. */
  missing: string[];
  /** Remote with no stated limit: remote does not always mean worldwide. */
  remoteNotWorldwide: boolean;
}

/**
 * The stated facts of a listing with their labels. Which fields appear depends
 * on the category: a scholarship shows funding and eligibility rather than pay
 * and sponsorship (spec section 23). Same order as the website.
 */
export function listingFacts(item: OpportunityItem, locale: string = intlLocale()): ListingFactsView {
  const fields = fieldsForCategory(item.category);
  const pay = formatPay(item.compensation, locale);
  const period = item.compensation.period && PERIODS.has(item.compensation.period) ? item.compensation.period : null;
  const rows: ListingFactsView['rows'] = [];
  const missing: string[] = [];
  const row = (label: string, value: string) => rows.push({ label, value });
  const L = (key: string) => t(`careerOpportunities.${key}`);

  if (isOpportunityCategory(item.category)) row(L('field_category'), categoryLabel(item.category));
  if (item.organization) row(L('field_employer'), item.organization);
  else missing.push(L('field_employer'));
  if (item.locations.length > 0) row(L('field_location'), item.locations.join(' · '));
  else missing.push(L('field_location'));
  if (item.arrangement) row(L('field_arrangement'), arrangementLabel(item.arrangement));
  if (item.remoteRestriction) row(L('field_remote_restriction'), item.remoteRestriction);

  if (fields.employment) {
    if (pay) row(L('field_pay'), period ? t(`careerOpportunities.pay_per_${period}`, { pay }) : pay);
    else missing.push(L('field_pay'));
    if (item.sponsorship !== 'unknown') row(L('field_sponsorship'), coded('sponsorship_', item.sponsorship));
    if (item.schedule) row(L('field_schedule'), scheduleLabel(item.schedule));
    if (item.seniority) row(L('field_seniority'), seniorityLabel(item.seniority));
  }
  for (const field of fields.details) {
    const value = item.details?.[field] ?? null;
    if (value) row(detailLabel(field), field === 'eventDate' ? formatListingDay(value, locale) : value);
    else missing.push(detailLabel(field));
  }
  if (item.publishedAt) row(L('field_published'), formatListingDay(item.publishedAt, locale));
  if (item.deadline) row(L('field_deadline'), formatListingDay(item.deadline, locale));
  else missing.push(L('field_deadline'));

  return { rows, missing, remoteNotWorldwide: item.arrangement === 'remote' && !item.remoteRestriction };
}

/** "Not stated in the listing: pay, deadline". */
export function missingText(missing: string[]): string | null {
  if (missing.length === 0) return null;
  return t('careerOpportunities.not_stated_list', { fields: missing.join(', ') });
}

// ---------------------------------------------------------------------------
// Paste
// ---------------------------------------------------------------------------

/** Same minimum as the API (career-shared): enough text to compare with a profile. */
export { MIN_LISTING_TEXT };
export const PASTE_MAX = 20000;
export const DETAIL_MAX = 300;

export interface PasteDraft {
  text: string;
  sourceUrl: string;
  category: string;
  deadline: string;
  details: Partial<Record<ListingDetailField, string>>;
}

export const EMPTY_PASTE: PasteDraft = { text: '', sourceUrl: '', category: '', deadline: '', details: {} };

/** The category-specific fields the paste form asks for (a job when no category is chosen). */
export function pasteDetailFields(category: string): ListingDetailField[] {
  return fieldsForCategory(category || 'job').details;
}

export type PasteCheckResult = { ok: true; input: PasteOpportunityInput } | { ok: false; message: string };

/** Website `savePaste` checks, before anything is sent. Only the fields for the chosen category are sent. */
export function checkPasteDraft(draft: PasteDraft): PasteCheckResult {
  const text = draft.text.trim();
  if (text.length < MIN_LISTING_TEXT) return { ok: false, message: t('careerOpportunities.paste_too_short', { count: MIN_LISTING_TEXT }) };
  if (text.length > PASTE_MAX) return { ok: false, message: t('careerJobs.paste.tooLong', { max: PASTE_MAX }) };
  const url = draft.sourceUrl.trim();
  if (url && (url.length > 2000 || !/^https?:\/\/[^\s]+$/i.test(url))) return { ok: false, message: t('careerOpportunities.paste_bad_url') };
  const deadline = draft.deadline.trim();
  if (deadline && !isCalendarDay(deadline)) return { ok: false, message: t('careerOpportunities.paste_bad_field') };
  const allowed = new Set(pasteDetailFields(draft.category));
  const details: Partial<Record<ListingDetailField, string>> = {};
  for (const [field, value] of Object.entries(draft.details) as [ListingDetailField, string | undefined][]) {
    const clean = (value ?? '').trim();
    if (!allowed.has(field) || clean.length === 0) continue;
    if (field === 'eventDate' && !isCalendarDay(clean)) return { ok: false, message: t('careerOpportunities.paste_bad_field') };
    details[field] = clean.slice(0, DETAIL_MAX);
  }
  return {
    ok: true,
    input: {
      text,
      ...(url ? { sourceUrl: url } : {}),
      ...(draft.category ? { category: draft.category } : {}),
      ...(deadline ? { deadline } : {}),
      ...(Object.keys(details).length > 0 ? { details } : {}),
    },
  };
}

/** The server's refusal of a paste, in the website's words. */
export function pasteErrorText(error: unknown): string | null {
  if (error instanceof ApiError && error.code === 'validation_error') {
    const field = error.body?.field;
    if (field === 'sourceUrl') return t('careerOpportunities.paste_bad_url');
    if (field === 'deadline' || field === 'category' || field === 'details') return t('careerOpportunities.paste_bad_field');
    return t('careerOpportunities.paste_too_short', { count: MIN_LISTING_TEXT });
  }
  return null;
}

/** A real YYYY-MM-DD calendar day (2026-02-30 is not one). */
export function isCalendarDay(value: string): boolean {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!m) return false;
  const date = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  return date.getUTCFullYear() === Number(m[1]) && date.getUTCMonth() === Number(m[2]) - 1 && date.getUTCDate() === Number(m[3]);
}
