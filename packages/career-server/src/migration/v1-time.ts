/** A Firestore timestamp is seconds, not an object `new Date` can read. */
export function v1Instant(value: unknown): string | null {
  if (typeof value === 'string') {
    if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
  }
  if (typeof value !== 'object' || value === null) return null;
  const record = value as Record<string, unknown>;
  const seconds = typeof record.seconds === 'number' ? record.seconds : typeof record._seconds === 'number' ? record._seconds : null;
  if (seconds === null) return null;
  const nanos = typeof record.nanoseconds === 'number' ? record.nanoseconds : typeof record._nanoseconds === 'number' ? record._nanoseconds : 0;
  return new Date(seconds * 1000 + Math.floor(nanos / 1_000_000)).toISOString();
}

export function addUtcMonths(start: Date, months: number): Date {
  const day = start.getUTCDate();
  const next = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + months, 1, start.getUTCHours(), start.getUTCMinutes(), start.getUTCSeconds()));
  const last = new Date(Date.UTC(next.getUTCFullYear(), next.getUTCMonth() + 1, 0)).getUTCDate();
  next.setUTCDate(Math.min(day, last));
  if (next.getTime() <= start.getTime()) next.setUTCDate(next.getUTCDate() + 1);
  return next;
}
