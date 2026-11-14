import type { AlertDelivery, MatchingSchedule } from './catalog';

export type AlertChannel = 'email' | 'push' | 'telegram';

export type DigestChoice = 'weekly' | 'daily' | 'immediate';

export type AlertReasonCode = 'saved_search' | 'followed_company' | 'material_update';

const SCHEDULE_ORDER = ['weekly', 'daily', 'every_6_hours', 'hourly'] as const;

const SCHEDULE_MS: Record<MatchingSchedule, number> = {
  weekly: 7 * 24 * 60 * 60 * 1000,
  daily: 24 * 60 * 60 * 1000,
  every_6_hours: 6 * 60 * 60 * 1000,
  hourly: 60 * 60 * 1000,
};

const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;

/** How long the plan waits between scheduled matches. */
export function matchingIntervalMs(schedule: MatchingSchedule): number {
  return SCHEDULE_MS[schedule];
}

/** A null last run is due. A run inside the plan interval is not. */
export function scheduleDue(lastMatchedAt: Date | null, schedule: MatchingSchedule, now: Date): boolean {
  if (lastMatchedAt === null) return true;
  return now.getTime() - lastMatchedAt.getTime() >= SCHEDULE_MS[schedule];
}

/** A saved-search schedule faster than the plan is not stored. */
export function scheduleWithinPlan(plan: MatchingSchedule, asked: MatchingSchedule): boolean {
  return SCHEDULE_ORDER.indexOf(asked) <= SCHEDULE_ORDER.indexOf(plan);
}

/**
 * Free stays on a weekly email. Daily email starts at Starter.
 * Immediate email, push, and Telegram start at Professional.
 */
export function channelMinimumPlan(choice: 'daily' | 'immediate' | 'push' | 'telegram'): 'starter' | 'professional' {
  return choice === 'daily' ? 'starter' : 'professional';
}

export function digestAllowed(delivery: AlertDelivery, digest: DigestChoice): boolean {
  if (digest === 'weekly') return true;
  if (digest === 'daily') return delivery !== 'weekly_email';
  return delivery === 'immediate_optional';
}

export function channelAllowed(delivery: AlertDelivery, channel: AlertChannel): boolean {
  if (channel === 'email') return true;
  return delivery === 'immediate_optional';
}

/** Both empty clears the window. A half-filled or equal pair is invalid. Times are UTC. */
export function quietWindow(
  start: string | null,
  end: string | null,
): { ok: true; start: string | null; end: string | null } | { ok: false } {
  if (start === null && end === null) return { ok: true, start: null, end: null };
  if (start === null || end === null || !HHMM.test(start) || !HHMM.test(end) || start === end) return { ok: false };
  return { ok: true, start, end };
}

/** Quiet hours wrap past midnight when the start is later than the end. */
export function inQuietHours(now: Date, start: string | null, end: string | null): boolean {
  if (start === null || end === null) return false;
  const minutes = now.getUTCHours() * 60 + now.getUTCMinutes();
  const from = toMinutes(start);
  const to = toMinutes(end);
  if (from < to) return minutes >= from && minutes < to;
  return minutes >= from || minutes < to;
}

export function digestPeriodStart(now: Date, digest: 'weekly' | 'daily'): Date {
  const day = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  if (digest === 'weekly') {
    const mondayOffset = (day.getUTCDay() + 6) % 7;
    day.setUTCDate(day.getUTCDate() - mondayOffset);
  }
  return day;
}

function toMinutes(value: string): number {
  const [hours, minutes] = value.split(':');
  return Number(hours) * 60 + Number(minutes);
}

/** Alert intelligence (spec section 7), lowest first. Organization is Business's queue level. */
export const ALERT_TIER_ORDER = ['basic', 'personalized', 'enhanced', 'advanced', 'organization'] as const;
export type AlertTier = (typeof ALERT_TIER_ORDER)[number];

export function alertTierAtLeast(tier: AlertTier, minimum: AlertTier): boolean {
  return ALERT_TIER_ORDER.indexOf(tier) >= ALERT_TIER_ORDER.indexOf(minimum);
}

/** The plan that first sells a tier, for an upgrade prompt. */
export function alertTierMinimumPlan(tier: AlertTier): 'free' | 'starter' | 'professional' | 'career_pro' | 'business' {
  if (tier === 'basic') return 'free';
  if (tier === 'personalized') return 'starter';
  if (tier === 'enhanced') return 'professional';
  if (tier === 'advanced') return 'career_pro';
  return 'business';
}

/**
 * Saved-search filters by the tier that unlocks them. Basic (Free) searches
 * by words, category and one place; Personalized adds pay, schedule,
 * seniority and arrangement; Enhanced adds a relevance threshold, which needs
 * the fit explanation only Enhanced alerts carry.
 */
export const PERSONALIZED_FILTERS = ['minPay', 'workSchedule', 'seniority', 'arrangement'] as const;
export const ENHANCED_FILTERS = ['relevance'] as const;
export type SavedSearchFilterKey = 'q' | 'category' | (typeof PERSONALIZED_FILTERS)[number] | (typeof ENHANCED_FILTERS)[number];

export function filterTier(key: SavedSearchFilterKey): AlertTier {
  if ((PERSONALIZED_FILTERS as readonly string[]).includes(key)) return 'personalized';
  if ((ENHANCED_FILTERS as readonly string[]).includes(key)) return 'enhanced';
  return 'basic';
}

/** Relevance threshold on a saved search; `any` surfaces every match of the filters. */
export const RELEVANCE_THRESHOLDS = ['any', 'possible_fit', 'strong_fit'] as const;
export type RelevanceThreshold = (typeof RELEVANCE_THRESHOLDS)[number];

/** Whether a fit label passes a threshold. With no fit (no resume yet) only `any` passes: unknown is not a fit. */
export function meetsRelevance(label: 'strong_fit' | 'possible_fit' | 'stretch' | 'expired' | null, threshold: RelevanceThreshold): boolean {
  if (threshold === 'any') return true;
  if (label === null || label === 'expired' || label === 'stretch') return false;
  if (threshold === 'possible_fit') return true;
  return label === 'strong_fit';
}

/**
 * Exact or whole-word company match against a followed name or one of its
 * aliases: "Meta" matches "Meta" and "Meta Platforms", never "Metamorphic".
 */
export function companyMatches(organization: string, names: readonly string[]): string | null {
  const org = ` ${foldWords(organization)} `;
  if (org.trim().length === 0) return null;
  for (const name of names) {
    const folded = foldWords(name);
    if (folded.length > 0 && org.includes(` ${folded} `)) return name;
  }
  return null;
}

function foldWords(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/**
 * In-app reminders (spec sections 2 and 8). They never reserve an alert item:
 * "Interview, application, certification-expiry, and billing reminders do not
 * consume opportunity credits."
 */
export const REMINDER_KINDS = [
  'listing_deadline',
  'application_follow_up',
  'interview',
  'certification_expiry',
  'credential_maintenance',
] as const;
export type ReminderKind = (typeof REMINDER_KINDS)[number];

/** Days ahead a reminder becomes visible. Certifications need longer to renew. */
export function reminderLeadDays(kind: ReminderKind): number {
  if (kind === 'certification_expiry' || kind === 'credential_maintenance') return 90;
  if (kind === 'listing_deadline') return 14;
  return 7;
}

/** A reminder is due when its date is today or within its lead time. A date already passed stays in history only. */
export function reminderDue(kind: ReminderKind, dueDate: string, today: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dueDate) || dueDate < today) return false;
  const lead = new Date(`${today}T00:00:00Z`);
  lead.setUTCDate(lead.getUTCDate() + reminderLeadDays(kind));
  return dueDate <= lead.toISOString().slice(0, 10);
}
