import { toDate } from '@/lib/format-date';

export type FollowUpState = 'overdue' | 'today' | 'upcoming';

/** Local calendar day number (days since epoch in the viewer's time zone). */
function localDay(d: Date): number {
  return Math.floor(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / 86_400_000);
}

/**
 * Where a follow-up reminder stands relative to today, or null when there is
 * none (or it cannot be read).
 *
 * Compared as LOCAL calendar days. The reminder is entered with a date input,
 * so it is stored as a bare "YYYY-MM-DD"; `new Date("2026-11-14")` parses that
 * as UTC midnight, which west of Greenwich is still the previous evening — a
 * reminder due today would show as overdue. Bare dates are therefore read as
 * local dates; anything else falls back to the general date parser.
 */
export function followUpState(value: unknown, now: Date = new Date()): FollowUpState | null {
  let due: Date | null = null;
  if (typeof value === 'string') {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim());
    if (m) due = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  }
  due ??= toDate(value);
  if (!due || Number.isNaN(due.getTime())) return null;

  const diff = localDay(due) - localDay(now);
  if (diff < 0) return 'overdue';
  if (diff === 0) return 'today';
  return 'upcoming';
}
