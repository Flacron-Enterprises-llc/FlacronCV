import type { PlanId } from './catalog';

/** Spec section 6. Business uses the same local radius as Career Pro. */
export const LOCAL_RADIUS_MILES: Record<PlanId, number> = {
  free: 25,
  starter: 50,
  professional: 100,
  career_pro: 200,
  business: 200,
};

/**
 * A listing whose checked time is older than this is shown as stale. The saved
 * revision still shows. Search, detail and the trust signal all use this one value.
 */
export const STALE_LISTING_DAYS = 14;

/** Stored when a paste has no employer. The API returns null and the screen says it was not stated. */
export const UNSTATED_ORGANIZATION = 'unstated';

/**
 * The employer name to show or write, or null when the listing did not state
 * one. Every place that builds text from a listing goes through this, so the
 * storage marker never reaches a letter, a checklist or a screen.
 */
export function statedOrganization(value: string | null | undefined): string | null {
  const name = value?.trim() ?? '';
  if (name.length < 2 || name.toLowerCase() === UNSTATED_ORGANIZATION) return null;
  return name;
}

export interface ListingCompensation {
  minimum: number | null;
  maximum: number | null;
  currency: string | null;
  period: string | null;
}

/**
 * Spec section 2 "Opportunity categories". `job` is general employment (the
 * value every listing stored before categories existed). The employment
 * schedule (full-time, part-time, temporary, contract) and the arrangement
 * (remote, hybrid) are separate fields because one listing can be both
 * "contract" and "remote"; the search filter still offers them as categories.
 */
export const OPPORTUNITY_CATEGORIES = [
  'job',
  'internship',
  'apprenticeship',
  'graduate_program',
  'government',
  'freelance',
  'scholarship',
  'fellowship',
  'funded_training',
  'certification',
  'career_fair',
  'volunteer',
  'international',
] as const;
export type OpportunityCategory = (typeof OPPORTUNITY_CATEGORIES)[number];

export const LISTING_SCHEDULES = ['full_time', 'part_time', 'temporary', 'contract'] as const;
export type ListingSchedule = (typeof LISTING_SCHEDULES)[number];

export const LISTING_ARRANGEMENTS = ['remote', 'hybrid', 'onsite'] as const;
export type ListingArrangement = (typeof LISTING_ARRANGEMENTS)[number];

export const LISTING_SENIORITIES = ['entry', 'mid', 'senior', 'lead', 'executive'] as const;
export type ListingSeniority = (typeof LISTING_SENIORITIES)[number];

/** Every value the search "category" filter accepts: a category, a schedule or an arrangement. */
export const OPPORTUNITY_FILTER_CATEGORIES = [
  ...LISTING_SCHEDULES,
  'remote',
  'hybrid',
  ...OPPORTUNITY_CATEGORIES,
] as const;
export type OpportunityFilterCategory = (typeof OPPORTUNITY_FILTER_CATEGORIES)[number];

/** Which column a filter category reads. */
export function filterCategoryColumn(value: OpportunityFilterCategory): 'category' | 'schedule' | 'arrangement' {
  if ((LISTING_SCHEDULES as readonly string[]).includes(value)) return 'schedule';
  if (value === 'remote' || value === 'hybrid') return 'arrangement';
  return 'category';
}

export function isOpportunityCategory(value: unknown): value is OpportunityCategory {
  return typeof value === 'string' && (OPPORTUNITY_CATEGORIES as readonly string[]).includes(value);
}
export function isFilterCategory(value: unknown): value is OpportunityFilterCategory {
  return typeof value === 'string' && (OPPORTUNITY_FILTER_CATEGORIES as readonly string[]).includes(value);
}
export function isListingSchedule(value: unknown): value is ListingSchedule {
  return typeof value === 'string' && (LISTING_SCHEDULES as readonly string[]).includes(value);
}
export function isListingArrangement(value: unknown): value is ListingArrangement {
  return typeof value === 'string' && (LISTING_ARRANGEMENTS as readonly string[]).includes(value);
}
export function isListingSeniority(value: unknown): value is ListingSeniority {
  return typeof value === 'string' && (LISTING_SENIORITIES as readonly string[]).includes(value);
}

/**
 * Which group of fields a listing shows. "A scholarship shows its deadline and
 * eligibility rather than employment fields" (spec section 23).
 */
export type CategoryFamily = 'employment' | 'early_career' | 'freelance' | 'funding' | 'event' | 'volunteer';

export function categoryFamily(category: string): CategoryFamily {
  switch (category) {
    case 'internship':
    case 'apprenticeship':
    case 'graduate_program':
      return 'early_career';
    case 'freelance':
      return 'freelance';
    case 'scholarship':
    case 'fellowship':
    case 'funded_training':
    case 'certification':
      return 'funding';
    case 'career_fair':
      return 'event';
    case 'volunteer':
      return 'volunteer';
    default:
      return 'employment';
  }
}

/** Category-specific facts, each exactly as the listing states it; null means not stated. */
export interface ListingDetails {
  /** Internship/apprenticeship pay or allowance, e.g. "£1,200 per month". */
  stipend: string | null;
  /** Who may apply as a student, e.g. "Final-year undergraduates". */
  studentEligibility: string | null;
  /** Scholarship/fellowship/training award or funding, e.g. "Full tuition". */
  funding: string | null;
  /** Freelance: what the client wants done. */
  clientScope: string | null;
  /** Freelance or volunteer: how long, e.g. "6 weeks". */
  duration: string | null;
  /** Freelance: fixed price, hourly, per milestone. */
  compensationBasis: string | null;
  /** Event date (YYYY-MM-DD) for a career fair or hiring event. */
  eventDate: string | null;
  /** How to register for an event (text or link). */
  registration: string | null;
  /** General eligibility sentence (scholarship, fellowship, volunteer). */
  eligibility: string | null;
}

export const LISTING_DETAIL_FIELDS = [
  'stipend',
  'studentEligibility',
  'funding',
  'clientScope',
  'duration',
  'compensationBasis',
  'eventDate',
  'registration',
  'eligibility',
] as const satisfies ReadonlyArray<keyof ListingDetails>;
export type ListingDetailField = (typeof LISTING_DETAIL_FIELDS)[number];

export const EMPTY_LISTING_DETAILS: ListingDetails = {
  stipend: null,
  studentEligibility: null,
  funding: null,
  clientScope: null,
  duration: null,
  compensationBasis: null,
  eventDate: null,
  registration: null,
  eligibility: null,
};

/**
 * Which listing fields a screen shows for a category, in order. Employment
 * fields (pay, sponsorship, schedule, seniority) only appear where they mean
 * something; every shown field says "not stated" when the listing is silent.
 */
export function fieldsForCategory(category: string): {
  employment: boolean;
  details: ListingDetailField[];
} {
  switch (categoryFamily(category)) {
    case 'early_career':
      return { employment: true, details: ['stipend', 'studentEligibility'] };
    case 'freelance':
      return { employment: false, details: ['clientScope', 'duration', 'compensationBasis'] };
    case 'funding':
      return { employment: false, details: ['funding', 'eligibility'] };
    case 'event':
      return { employment: false, details: ['eventDate', 'registration'] };
    case 'volunteer':
      return { employment: false, details: ['duration', 'eligibility'] };
    default:
      return { employment: true, details: [] };
  }
}

/** Reads a stored `details` object; anything not a short string becomes null. */
export function listingDetailsOf(value: unknown): ListingDetails {
  const details: ListingDetails = { ...EMPTY_LISTING_DETAILS };
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return details;
  const record = value as Record<string, unknown>;
  for (const field of LISTING_DETAIL_FIELDS) {
    const raw = record[field];
    if (typeof raw === 'string' && raw.trim().length > 0) details[field] = raw.trim().slice(0, 300);
  }
  if (details.eventDate !== null && !/^\d{4}-\d{2}-\d{2}$/.test(details.eventDate)) details.eventDate = null;
  return details;
}

export function localRadiusMiles(planId: PlanId): number {
  return LOCAL_RADIUS_MILES[planId];
}

/**
 * Same employer, title and place, ignoring case, accents and punctuation. The
 * place is part of the key so one employer's "Analyst" in London and in Leeds
 * stay two listings; only the city part ("Montreal" of "Montreal, QC") is used
 * so two feeds that format the region differently still meet. A paste never
 * shares a key with a feed.
 */
export function dedupeKey(listing: {
  provider: string;
  organization: string;
  title: string;
  sourceId: string;
  locations?: readonly string[];
}): string {
  if (listing.provider === 'paste') return `paste:${listing.sourceId}`;
  const organization = fold(listing.organization);
  const title = fold(listing.title);
  if (organization.length === 0 || title.length === 0) return `${listing.provider}:${listing.sourceId}`;
  const places = [...new Set((listing.locations ?? []).map((place) => fold(place.split(',')[0] ?? '')).filter((place) => place.length > 0))].sort();
  return places.length === 0 ? `${organization}|${title}` : `${organization}|${title}|${places.join('+')}`;
}

export function listingLabel(status: 'open' | 'closed', deadline: string | null, today: string): 'open' | 'expired' {
  if (status === 'closed') return 'expired';
  if (deadline !== null && deadline < today) return 'expired';
  return 'open';
}

export function isStaleListing(checkedAtIso: string, nowMs: number): boolean {
  const checked = Date.parse(checkedAtIso);
  if (Number.isNaN(checked)) return false;
  return nowMs - checked > STALE_LISTING_DAYS * 24 * 60 * 60 * 1000;
}

/** Great-circle distance in miles. Used only when both sides have real coordinates. */
export function distanceMiles(a: { latitude: number; longitude: number }, b: { latitude: number; longitude: number }): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(b.latitude - a.latitude);
  const dLon = toRad(b.longitude - a.longitude);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.latitude)) * Math.cos(toRad(b.latitude)) * Math.sin(dLon / 2) ** 2;
  return 2 * 3958.8 * Math.asin(Math.min(1, Math.sqrt(h)));
}

/**
 * Text match of a place against a listing's stated locations: the city part
 * of the place ("Montreal" of "Montreal, QC") must appear as whole words in
 * one location. Accents and case are ignored.
 */
export function placeMatchesLocations(place: string, locations: readonly string[]): boolean {
  const city = fold(place.split(',')[0] ?? '');
  if (city.length === 0) return false;
  // Folded text is only [a-z0-9 ], so padding with spaces gives a whole-word test without a regex.
  return locations.some((location) => ` ${fold(location)} `.includes(` ${city} `));
}

/** Lower case, accents removed, every run of non-alphanumerics one space. */
export function foldText(value: string): string {
  return fold(value);
}

function fold(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/ +/g, ' ');
}
