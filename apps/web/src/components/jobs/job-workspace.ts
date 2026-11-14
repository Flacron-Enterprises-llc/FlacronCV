/**
 * Pure application-workspace logic for the Job Tracker (list, board, form).
 * No React here, so it is unit-tested directly (job-workspace.test.ts).
 */
import { JOB_STATUSES, JobApplication, JobStatus, normalizeJobStatus } from '@flacroncv/shared-types';
import { toDate } from '@/lib/format-date';
import { buildIcsEvent, escapeIcsText, foldIcsLine } from '@/lib/ics';

/** Board / tab / sort order: the spec's seven stages. */
export const STATUS_ORDER: readonly JobStatus[] = JOB_STATUSES;

export type BadgeVariant = 'default' | 'info' | 'warning' | 'brand' | 'danger' | 'success';

export const STATUS_VARIANT: Record<JobStatus, BadgeVariant> = {
  [JobStatus.SAVED]: 'default',
  [JobStatus.PREPARING]: 'info',
  [JobStatus.APPLIED]: 'info',
  [JobStatus.INTERVIEWING]: 'warning',
  [JobStatus.OFFERED]: 'brand',
  [JobStatus.REJECTED]: 'danger',
  [JobStatus.WITHDRAWN]: 'default',
};

/**
 * The API always answers in the current vocabulary, but a cached response from
 * before an update (or any stray legacy value) must still land in a column.
 */
export function boardStatus(status: string): JobStatus {
  return normalizeJobStatus(status)?.status ?? JobStatus.SAVED;
}

export type SortKey = 'updated' | 'applied' | 'deadline' | 'company' | 'position' | 'status';
export const SORT_KEYS: readonly SortKey[] = ['updated', 'applied', 'deadline', 'company', 'position', 'status'];

/** Epoch millis for any date-ish value; 0 when absent. */
function time(value: unknown): number {
  const d = toDate(value);
  return d ? d.getTime() : 0;
}

export const SORTERS: Record<SortKey, (a: JobApplication, b: JobApplication) => number> = {
  // Most recently touched first — the default, matching the API's ordering.
  updated: (a, b) => time(b.updatedAt) - time(a.updatedAt),
  // Newest application first; entries with no applied date sort to the end.
  applied: (a, b) => time(b.appliedDate) - time(a.appliedDate),
  // Soonest deadline first; no deadline sorts last.
  deadline: (a, b) => {
    const da = time(a.deadline);
    const db = time(b.deadline);
    if (!da || !db) return (da ? 0 : 1) - (db ? 0 : 1);
    return da - db;
  },
  company: (a, b) => a.company.localeCompare(b.company),
  position: (a, b) => a.position.localeCompare(b.position),
  // Pipeline order rather than alphabetical, which would be meaningless for a funnel.
  status: (a, b) => STATUS_ORDER.indexOf(boardStatus(a.status)) - STATUS_ORDER.indexOf(boardStatus(b.status)),
};

/** Per-status counts for the filter tabs and board column headers. */
export function statusCounts(jobs: readonly JobApplication[]): Record<JobStatus, number> {
  const counts = Object.fromEntries(STATUS_ORDER.map((s) => [s, 0])) as Record<JobStatus, number>;
  for (const job of jobs) counts[boardStatus(job.status)] += 1;
  return counts;
}

/** Search across the fields a person remembers an application by, including every contact. */
export function matchesSearch(job: JobApplication, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  const fields = [
    job.company,
    job.position,
    job.location,
    job.notes,
    ...(job.contacts ?? []).flatMap((c) => [c.name, c.role, c.email]),
  ];
  return fields.some((f) => typeof f === 'string' && f.toLowerCase().includes(q));
}

export function filterJobs(
  jobs: readonly JobApplication[],
  opts: { status: 'all' | JobStatus; search: string; sort: SortKey },
): JobApplication[] {
  return jobs
    .filter((j) => opts.status === 'all' || boardStatus(j.status) === opts.status)
    .filter((j) => matchesSearch(j, opts.search))
    .sort(SORTERS[opts.sort]);
}

/** Group for the board: every stage gets a column, even an empty one, so cards can be dropped there. */
export function groupByStatus(jobs: readonly JobApplication[]): Record<JobStatus, JobApplication[]> {
  const groups = Object.fromEntries(STATUS_ORDER.map((s) => [s, [] as JobApplication[]])) as Record<
    JobStatus,
    JobApplication[]
  >;
  for (const job of jobs) groups[boardStatus(job.status)].push(job);
  return groups;
}

export function checklistProgress(job: Pick<JobApplication, 'checklist'>): { done: number; total: number } {
  const items = job.checklist ?? [];
  return { done: items.filter((i) => i.done).length, total: items.length };
}

// ---------------------------------------------------------------------------
// Calendar (.ics)
// ---------------------------------------------------------------------------

export type CalendarKind = 'interview' | 'follow_up' | 'deadline';

/** Filename-safe fragment of a company or position name. */
export function slug(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

const BARE_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

/** `YYYY-MM-DD` → `YYYYMMDD` of that day and the next (all-day DTEND is exclusive). */
function allDayRange(value: string): { start: string; end: string } | null {
  const m = BARE_DATE.exec(value.trim());
  if (!m) return null;
  const start = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  if (Number.isNaN(start.getTime()) || start.getUTCDate() !== Number(m[3])) return null;
  const end = new Date(start.getTime() + 86_400_000);
  const fmt = (d: Date) => d.toISOString().slice(0, 10).replace(/-/g, '');
  return { start: fmt(start), end: fmt(end) };
}

/**
 * An all-day event for a date-only value (deadline, follow-up). A timed event
 * at UTC midnight would show on the previous evening west of Greenwich; a
 * VALUE=DATE event is the same calendar day in every zone.
 */
export function buildAllDayIcsEvent(input: {
  title: string;
  description?: string | null;
  date: string;
  url?: string | null;
  uid: string;
  now?: Date;
}): string | null {
  const range = allDayRange(input.date);
  if (!range) return null;
  const stamp = (input.now ?? new Date()).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//FlacronCV//Job Tracker//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:${input.uid}`,
    `DTSTAMP:${stamp}`,
    `DTSTART;VALUE=DATE:${range.start}`,
    `DTEND;VALUE=DATE:${range.end}`,
    `SUMMARY:${escapeIcsText(input.title)}`,
  ];
  if (input.description) lines.push(`DESCRIPTION:${escapeIcsText(input.description)}`);
  if (input.url) lines.push(`URL:${input.url.replace(/[\r\n]+/g, '')}`);
  lines.push('END:VEVENT', 'END:VCALENDAR');
  return `${lines.map(foldIcsLine).join('\r\n')}\r\n`;
}

/** The calendar entries this application can produce, in display order. */
export function calendarKinds(job: Pick<JobApplication, 'interviewDate' | 'followUpDate' | 'deadline'>): CalendarKind[] {
  const kinds: CalendarKind[] = [];
  if (job.interviewDate && toDate(job.interviewDate)) kinds.push('interview');
  if (job.followUpDate && allDayRange(job.followUpDate)) kinds.push('follow_up');
  if (job.deadline && allDayRange(job.deadline)) kinds.push('deadline');
  return kinds;
}

/**
 * One `.ics` file for an interview, follow-up or deadline. The UID is derived
 * from the application id and the kind, so downloading again after a date
 * change updates the existing calendar entry instead of adding a second one.
 *
 * `text` supplies the translated title/description for the kind.
 */
export function applicationCalendarFile(
  job: Pick<JobApplication, 'id' | 'company' | 'position' | 'location' | 'jobUrl' | 'interviewDate' | 'followUpDate' | 'deadline'>,
  kind: CalendarKind,
  text: { title: string; description: string },
  now?: Date,
): { filename: string; content: string } | null {
  const uid = `${job.id}-${kind}@flacroncv.com`;
  const description = [text.description, job.jobUrl].filter(Boolean).join('\n');
  const content =
    kind === 'interview'
      ? buildIcsEvent({
          title: text.title,
          description,
          location: job.location,
          start: job.interviewDate,
          url: job.jobUrl,
          uid,
          now,
        })
      : buildAllDayIcsEvent({
          title: text.title,
          description,
          date: (kind === 'deadline' ? job.deadline : job.followUpDate) ?? '',
          url: job.jobUrl,
          uid,
          now,
        });
  if (!content) return null;
  const name = [slug(job.company), slug(job.position)].filter(Boolean).join('-') || 'application';
  return { filename: `${kind.replace('_', '-')}-${name}.ics`, content };
}

/**
 * Plain text of a frozen cover letter. Letters may be stored as HTML; this
 * reads the text through an inert document (no script runs, nothing is
 * inserted into the page), so the snapshot can be shown without innerHTML.
 */
export function letterText(content: string): string {
  if (!/<[a-z][\s\S]*>/i.test(content)) return content;
  if (typeof DOMParser === 'undefined') return content.replace(/<[^>]*>/g, ' ');
  const doc = new DOMParser().parseFromString(content.replace(/<\/(p|div|li|h[1-6])>|<br\s*\/?>/gi, '$&\n'), 'text/html');
  return (doc.body.textContent ?? '').replace(/\n{3,}/g, '\n\n').trim();
}

/** The plan's tracked-application capacity refused the save (code from jobs.service checkCapacity). */
export function isCapacityError(error: unknown): boolean {
  return typeof error === 'object' && error !== null && (error as { code?: unknown }).code === 'JOB_CAPACITY_REACHED';
}
