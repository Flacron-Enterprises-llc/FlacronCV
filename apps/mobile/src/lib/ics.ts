/**
 * Dependency-free iCalendar (RFC 5545) event generation — a port of
 * `apps/web/src/lib/ics.ts` (same output for the same input).
 *
 * The job tracker uses it so a scheduled interview can be added to whatever
 * calendar the user lives in (Google, Outlook, Apple) without an OAuth token:
 * the app writes a `.ics` file and hands it to the share sheet.
 *
 * The parts of the spec that decide whether a file imports at all:
 *   - CRLF line endings, and a CRLF after the final line.
 *   - `,` `;` `\` and newlines ESCAPED inside TEXT values.
 *   - Lines folded to 75 octets — octets, not characters, and never mid
 *     multi-byte character.
 *   - UTC timestamps (`…Z`), so an interview does not drift by hours.
 *
 * Pure: no React Native / Expo imports (unit-tested under node). The file
 * write + share lives in `src/components/jobs/share-interview-ics.ts`.
 */

const PRODID = '-//FlacronCV//Job Tracker//EN';
const MAX_OCTETS = 75;
const CRLF = '\r\n';
const DEFAULT_DURATION_MS = 60 * 60 * 1000;
const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

export interface IcsEventInput {
  /** SUMMARY — the event title shown in the calendar. */
  title: string;
  description?: string | null;
  location?: string | null;
  /** ISO instant, `YYYY-MM-DDTHH:mm` (local), `YYYY-MM-DD`, Date or Firestore timestamp. */
  start: unknown;
  /** Defaults to one hour after `start`; ignored if it is not after `start`. */
  end?: unknown;
  url?: string | null;
  uid?: string;
  /** DTSTAMP override (tests). */
  now?: Date;
}

/**
 * Same input contract as web `format-date.ts` `toDate` / mobile `utils.ts`
 * `toDate` (kept local: `utils.ts` imports expo modules).
 */
export function icsToDate(value: unknown): Date | null {
  if (value == null) return null;
  if (value instanceof Date) return isNaN(value.getTime()) ? null : value;
  if (typeof value === 'number' || typeof value === 'string') {
    if (typeof value === 'string' && DATE_ONLY.test(value)) {
      const [y, m, d] = value.split('-').map(Number);
      const local = new Date(y, m - 1, d);
      return isNaN(local.getTime()) ? null : local;
    }
    if (value === '') return null;
    const d = new Date(value);
    return isNaN(d.getTime()) ? null : d;
  }
  if (typeof value === 'object') {
    const o = value as Record<string, unknown>;
    if (typeof o.toDate === 'function') {
      const d = (o.toDate as () => Date)();
      return d instanceof Date && !isNaN(d.getTime()) ? d : null;
    }
    const seconds =
      typeof o.seconds === 'number' ? o.seconds : typeof o._seconds === 'number' ? o._seconds : null;
    if (seconds != null) {
      const d = new Date(seconds * 1000);
      return isNaN(d.getTime()) ? null : d;
    }
  }
  return null;
}

/** UTF-8 byte length of one string (computed by hand — no TextEncoder dependency on Hermes). */
function octetLength(value: string): number {
  let n = 0;
  for (const ch of value) {
    const cp = ch.codePointAt(0) ?? 0;
    n += cp < 0x80 ? 1 : cp < 0x800 ? 2 : cp < 0x10000 ? 3 : 4;
  }
  return n;
}

/** Escape a TEXT value. Backslashes first, or later escapes get escaped twice. */
export function escapeIcsText(value: string): string {
  return value
    .replace(/\\/g, '\\\\')
    .replace(/\r\n|\r|\n/g, '\\n')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,');
}

/** Fold one content line to 75 octets; continuation lines start with one space. */
export function foldIcsLine(line: string): string {
  if (octetLength(line) <= MAX_OCTETS) return line;

  const parts: string[] = [];
  let current = '';
  let used = 0;
  let budget = MAX_OCTETS;

  for (const ch of line) {
    const size = octetLength(ch);
    if (used + size > budget) {
      parts.push(current);
      current = '';
      used = 0;
      budget = MAX_OCTETS - 1;
    }
    current += ch;
    used += size;
  }
  parts.push(current);

  return parts.join(`${CRLF} `);
}

function toUtcStamp(date: Date): string {
  return date.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
}

/** FNV-1a — a stable UID so re-sharing the same interview updates, not duplicates. */
function fnv1a(input: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, '0');
}

/**
 * Build a single-event VCALENDAR string, or `null` when `start` is absent or
 * unparseable (nothing to schedule).
 */
export function buildIcsEvent(input: IcsEventInput): string | null {
  const start = icsToDate(input.start);
  if (!start) return null;

  const explicitEnd = icsToDate(input.end);
  const end =
    explicitEnd && explicitEnd.getTime() > start.getTime()
      ? explicitEnd
      : new Date(start.getTime() + DEFAULT_DURATION_MS);

  const startStamp = toUtcStamp(start);
  const uid = input.uid ?? `${fnv1a(`${input.title}|${startStamp}`)}-${startStamp}@flacroncv.com`;
  const stamp = toUtcStamp(input.now ?? new Date());

  const lines: string[] = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    `PRODID:${PRODID}`,
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:${uid}`,
    `DTSTAMP:${stamp}`,
    `DTSTART:${startStamp}`,
    `DTEND:${toUtcStamp(end)}`,
    `SUMMARY:${escapeIcsText(input.title)}`,
  ];

  if (input.description) lines.push(`DESCRIPTION:${escapeIcsText(input.description)}`);
  if (input.location) lines.push(`LOCATION:${escapeIcsText(input.location)}`);
  // URL is a URI value, not TEXT: only strip line breaks.
  if (input.url) lines.push(`URL:${input.url.replace(/[\r\n]+/g, '')}`);

  lines.push('END:VEVENT', 'END:VCALENDAR');

  return `${lines.map(foldIcsLine).join(CRLF)}${CRLF}`;
}

/** Keep a company/position-derived name usable as a filename on every OS. */
export function safeIcsFilename(filename: string): string {
  const cleaned = filename.replace(/[\\/:*?"<>|\r\n]+/g, '-').replace(/^[.\s]+/, '').trim();
  const base = cleaned || 'event.ics';
  return base.toLowerCase().endsWith('.ics') ? base : `${base}.ics`;
}
