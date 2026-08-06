/**
 * Date normalisation + formatting for values that originate in Firestore.
 *
 * A Firestore `Timestamp` reaches the client as JSON in one of several shapes
 * depending on the firebase-admin version — `{ seconds, nanoseconds }`,
 * `{ _seconds, _nanoseconds }`, or `{ type: 'firestore/timestamp/1.0',
 * seconds, ... }`. `new Date(...)` can parse NONE of these, so it produces
 * "Invalid Date" in the UI. These helpers accept any of those shapes (plus a
 * real Date, an ISO string, or epoch milliseconds) and format with a graceful
 * fallback for missing/unparseable values.
 */

import { format as dateFnsFormat, formatDistanceToNow } from 'date-fns';

/** A bare calendar date with no time or zone, e.g. "2026-08-03". */
const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

/** Best-effort conversion of any date-ish value to a valid Date, else null. */
export function toDate(value: unknown): Date | null {
  if (value == null) return null;
  if (value instanceof Date) return isNaN(value.getTime()) ? null : value;
  if (typeof value === 'number' || typeof value === 'string') {
    // Date-only strings must be read in LOCAL time, not UTC.
    //
    // Per spec, `new Date('2026-08-03')` is UTC midnight, so formatting it for
    // a viewer west of UTC renders 2 August — a job application's "applied
    // date" or an interview reminder silently showing the wrong day. These
    // values come from <input type="date">, which has no timezone at all; the
    // user means the calendar day they picked. Splitting the parts builds the
    // Date in the local zone, which round-trips correctly everywhere.
    if (typeof value === 'string' && DATE_ONLY.test(value)) {
      const [y, m, d] = value.split('-').map(Number);
      const local = new Date(y, m - 1, d);
      return isNaN(local.getTime()) ? null : local;
    }
    const d = new Date(value);
    return isNaN(d.getTime()) ? null : d;
  }
  if (typeof value === 'object') {
    const o = value as Record<string, unknown>;
    // A live Firestore Timestamp instance (uncommon on the client) has toDate().
    if (typeof o.toDate === 'function') {
      const d = (o.toDate as () => Date)();
      return d instanceof Date && !isNaN(d.getTime()) ? d : null;
    }
    // Serialized forms: `seconds` (v9+) or the older `_seconds`.
    const seconds =
      typeof o.seconds === 'number'
        ? o.seconds
        : typeof o._seconds === 'number'
          ? o._seconds
          : null;
    if (seconds != null) {
      const d = new Date(seconds * 1000);
      return isNaN(d.getTime()) ? null : d;
    }
  }
  return null;
}

const DEFAULT_DATE_OPTS: Intl.DateTimeFormatOptions = {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
};

/** Format a date-ish value as a date, e.g. "5 Jul 2026". `—` when absent/invalid. */
export function formatDate(
  value: unknown,
  opts: Intl.DateTimeFormatOptions = DEFAULT_DATE_OPTS,
  locale = 'en-GB',
): string {
  const d = toDate(value);
  return d ? d.toLocaleDateString(locale, opts) : '—';
}

/** Format a date-ish value as date + time. `—` when absent/invalid. */
export function formatDateTime(
  value: unknown,
  opts: Intl.DateTimeFormatOptions = { dateStyle: 'medium', timeStyle: 'short' },
  locale = 'en-GB',
): string {
  const d = toDate(value);
  return d ? d.toLocaleString(locale, opts) : '—';
}

/**
 * date-fns `format()` that never throws. The bare `format(new Date(value), …)`
 * pattern throws a RangeError on an unparseable value (e.g. a raw Firestore
 * Timestamp), which crashes the whole page. This normalises first and returns
 * the fallback for missing/invalid values, preserving the caller's pattern.
 */
export function safeFormat(value: unknown, pattern: string, fallback = '—'): string {
  const d = toDate(value);
  return d ? dateFnsFormat(d, pattern) : fallback;
}

/**
 * Relative time, e.g. "about 3 hours ago". Like the other helpers this never
 * throws — `formatDistanceToNow(new Date(bad))` otherwise raises a RangeError
 * that crashes the surrounding component.
 */
export function formatRelative(
  value: unknown,
  opts: { addSuffix?: boolean } = { addSuffix: true },
  fallback = '—',
): string {
  const d = toDate(value);
  return d ? formatDistanceToNow(d, opts) : fallback;
}
