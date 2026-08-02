/**
 * Normalise a Firestore Timestamp — or a Date, ISO string, or epoch ms — to an
 * ISO 8601 string.
 *
 * WHY: passing a raw Firestore Timestamp to `new Date()` yields an Invalid Date
 * whose `.toISOString()` THROWS a RangeError, which previously 500'd the CSV
 * export. This converts safely via the Timestamp's own `toDate()` (or its
 * serialized `seconds`/`_seconds`) first. Returns '' for missing/unparseable
 * values so a CSV cell stays well-formed rather than blowing up the request.
 */
export function toIsoString(value: unknown): string {
  if (value == null) return '';

  const ts = value as { toDate?: () => Date; seconds?: number; _seconds?: number };
  if (typeof ts.toDate === 'function') {
    const d = ts.toDate();
    return d instanceof Date && !isNaN(d.getTime()) ? d.toISOString() : '';
  }

  const seconds =
    typeof ts.seconds === 'number'
      ? ts.seconds
      : typeof ts._seconds === 'number'
        ? ts._seconds
        : null;
  if (seconds != null) return new Date(seconds * 1000).toISOString();

  const d = value instanceof Date ? value : new Date(value as string | number);
  return isNaN(d.getTime()) ? '' : d.toISOString();
}
