/**
 * Dependency-free iCalendar (RFC 5545) event generation.
 *
 * Used by the job tracker so a scheduled interview can be added to whatever
 * calendar the user actually lives in (Google, Outlook, Apple) without us
 * holding an OAuth token for any of them: we hand the browser a `.ics` file and
 * every calendar app knows what to do with it.
 *
 * The parts of the spec that decide whether a file imports at all, rather than
 * being silently rejected:
 *   - CRLF line endings, and a CRLF after the final line.
 *   - `,` `;` `\` and newlines ESCAPED inside TEXT values. An unescaped comma in
 *     a company name ("Acme, Inc.") is read as a value separator, which
 *     truncates the summary or breaks the parse outright.
 *   - Lines folded to 75 octets — octets, not characters, and never mid
 *     multi-byte character.
 *   - UTC timestamps (`…Z`), so an interview does not drift by hours when the
 *     importing client assumes its own zone for a floating time.
 */

import { toDate } from './format-date';

/** Product identifier written into every file we generate. */
const PRODID = '-//FlacronCV//Job Tracker//EN';

/** RFC 5545: a content line SHOULD NOT exceed 75 octets, excluding the break. */
const MAX_OCTETS = 75;

const CRLF = '\r\n';

/** Events default to one hour when no explicit end is known. */
const DEFAULT_DURATION_MS = 60 * 60 * 1000;

export interface IcsEventInput {
  /** SUMMARY — the event title shown in the calendar. */
  title: string;
  description?: string | null;
  location?: string | null;
  /**
   * Any date-ish value `toDate()` understands (ISO instant, `datetime-local`
   * string, `YYYY-MM-DD`, Date, Firestore timestamp). Absent or unparseable
   * means there is nothing to schedule and no event is produced.
   */
  start: unknown;
  /** Defaults to one hour after `start`; ignored if it is not after `start`. */
  end?: unknown;
  url?: string | null;
  /** Override the derived UID (tests, or an update to a known event). */
  uid?: string;
  /** Override DTSTAMP — the moment the file was generated. Injectable for tests. */
  now?: Date;
}

/** UTF-8 byte length: folding is defined in octets, not characters. */
function octetLength(value: string): number {
  return new TextEncoder().encode(value).length;
}

/**
 * Escape a TEXT value. Order matters: backslashes first, or the backslashes
 * introduced by the later replacements get escaped a second time.
 */
export function escapeIcsText(value: string): string {
  return value
    .replace(/\\/g, '\\\\')
    .replace(/\r\n|\r|\n/g, '\\n')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,');
}

/**
 * Fold one content line to 75 octets per line, continuation lines starting with
 * a single space. Iterating code points (not UTF-16 units) keeps a fold from
 * landing inside a multi-byte character, which would corrupt it.
 */
export function foldIcsLine(line: string): string {
  if (octetLength(line) <= MAX_OCTETS) return line;

  const parts: string[] = [];
  let current = '';
  let used = 0;
  // The first line gets all 75 octets; every continuation spends one on the
  // leading space that marks it as a continuation.
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

/** `2026-08-03T14:30:00Z` → `20260803T143000Z`. */
function toUtcStamp(date: Date): string {
  return date.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
}

/**
 * FNV-1a, used only to derive a stable UID from the event's identity. Not a
 * security primitive — it just has to be deterministic, so re-downloading the
 * same interview updates the existing calendar entry instead of duplicating it.
 */
function fnv1a(input: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, '0');
}

/**
 * Build a single-event VCALENDAR string.
 *
 * @returns the `.ics` content, or `null` when `start` is absent or unparseable —
 *          a job with no interview date has no event to export.
 */
export function buildIcsEvent(input: IcsEventInput): string | null {
  const start = toDate(input.start);
  if (!start) return null;

  const explicitEnd = toDate(input.end);
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
  // URL carries a URI value, not TEXT: commas and semicolons are legal there and
  // escaping them would hand the calendar a broken link. Only the line breaks
  // that would end the property early are removed.
  if (input.url) lines.push(`URL:${input.url.replace(/[\r\n]+/g, '')}`);

  lines.push('END:VEVENT', 'END:VCALENDAR');

  // Trailing CRLF: the last content line needs its terminator like any other.
  return `${lines.map(foldIcsLine).join(CRLF)}${CRLF}`;
}

/** Keep a company/position-derived name usable as a filename on every OS. */
function safeFilename(filename: string): string {
  const cleaned = filename.replace(/[\\/:*?"<>|\r\n]+/g, '-').replace(/^[.\s]+/, '').trim();
  const base = cleaned || 'event.ics';
  return base.toLowerCase().endsWith('.ics') ? base : `${base}.ics`;
}

/**
 * Trigger a browser download of `.ics` content.
 *
 * Same blob/object-URL idiom as `downloadCsv`, with the anchor briefly attached
 * to the document — Firefox ignores a click on a detached anchor.
 */
export function downloadIcs(filename: string, content: string): void {
  const blob = new Blob([content], { type: 'text/calendar;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = safeFilename(filename);
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
