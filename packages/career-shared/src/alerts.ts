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
