/**
 * Pure job-tracker logic shared by the list screen and the form — mirrors
 * `apps/web/src/app/[locale]/(dashboard)/jobs/page.tsx` and
 * `apps/web/src/components/jobs/JobFormModal.tsx`.
 *
 * No React Native / Expo imports (unit-tested under node).
 */
import { t } from '../i18n';
import { JobStatus } from '../types/enums';
import type { JobApplication } from '../types/job.types';
import { buildIcsEvent, icsToDate, safeIcsFilename } from './ics';

/** Pipeline order (wishlist → accepted), as on the website. */
export const STATUS_ORDER: JobStatus[] = [
  JobStatus.WISHLIST,
  JobStatus.APPLIED,
  JobStatus.INTERVIEWING,
  JobStatus.OFFER,
  JobStatus.REJECTED,
  JobStatus.ACCEPTED,
];

/** Website `jobs.status.*` wording, read in the current language at call time. */
const STATUS_LABEL: Record<JobStatus, () => string> = {
  [JobStatus.WISHLIST]: () => t('jobs.status.wishlist'),
  [JobStatus.APPLIED]: () => t('jobs.status.applied'),
  [JobStatus.INTERVIEWING]: () => t('jobs.status.interviewing'),
  [JobStatus.OFFER]: () => t('jobs.status.offer'),
  [JobStatus.REJECTED]: () => t('jobs.status.rejected'),
  [JobStatus.ACCEPTED]: () => t('jobs.status.accepted'),
};

/** Status label in the current language; an unknown status is shown as sent. */
export function jobStatusLabel(status: string): string {
  const label = STATUS_LABEL[status as JobStatus];
  return label ? label() : status;
}

export type JobSortKey = 'updated' | 'applied' | 'company' | 'position' | 'status';

/** Sort menu order. */
export const SORT_KEYS: JobSortKey[] = ['updated', 'applied', 'company', 'position', 'status'];

/** Website `jobs.sort.*` wording, read in the current language at call time. */
const SORT_LABEL: Record<JobSortKey, () => string> = {
  updated: () => t('jobs.sort.updated'),
  applied: () => t('jobs.sort.applied'),
  company: () => t('jobs.sort.company'),
  position: () => t('jobs.sort.position'),
  status: () => t('jobs.sort.status'),
};

export function jobSortLabel(key: JobSortKey): string {
  return SORT_LABEL[key]();
}

/** Epoch millis for any date-ish value; 0 when absent so it sorts last. */
function time(value: unknown): number {
  const d = icsToDate(value);
  return d ? d.getTime() : 0;
}

const SORTERS: Record<JobSortKey, (a: JobApplication, b: JobApplication) => number> = {
  updated: (a, b) => time(b.updatedAt) - time(a.updatedAt),
  applied: (a, b) => time(b.appliedDate) - time(a.appliedDate),
  company: (a, b) => (a.company ?? '').localeCompare(b.company ?? ''),
  position: (a, b) => (a.position ?? '').localeCompare(b.position ?? ''),
  status: (a, b) => STATUS_ORDER.indexOf(a.status) - STATUS_ORDER.indexOf(b.status),
};

/** Archived applications are shown only in the archived view (and vice versa). */
export function visibleJobs(jobs: readonly JobApplication[], showArchived: boolean): JobApplication[] {
  return jobs.filter((j) => !!j.archived === showArchived);
}

/** Per-status counts of the visible set, for the filter chips. */
export function statusCounts(visible: readonly JobApplication[]): Record<string, number> {
  return visible.reduce<Record<string, number>>(
    (acc, j) => ({ ...acc, [j.status]: (acc[j.status] ?? 0) + 1 }),
    {},
  );
}

/** Status filter + search (company, position, location, notes, contact) + sort — same fields as the website. */
export function filterAndSortJobs(
  visible: readonly JobApplication[],
  opts: { status: 'all' | JobStatus; search: string; sort: JobSortKey },
): JobApplication[] {
  const q = opts.search.trim().toLowerCase();
  return visible
    .filter((j) => opts.status === 'all' || j.status === opts.status)
    .filter(
      (j) =>
        !q ||
        [j.company, j.position, j.location, j.notes, j.contactName]
          .filter((f): f is string => typeof f === 'string' && f.length > 0)
          .some((f) => f.toLowerCase().includes(q)),
    )
    .sort(SORTERS[opts.sort]);
}

/**
 * Contact email check, aligned with the API's `@IsEmail()` (which requires a
 * dotted domain with a TLD) so the user sees the problem before a 400.
 * Empty is valid (the field is optional).
 */
const EMAIL_RE =
  /^[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?)*\.[A-Za-z]{2,}$/;

export function isValidContactEmail(value: string): boolean {
  const v = value.trim();
  if (!v) return true;
  if (v.length > 320) return false;
  const [local] = v.split('@');
  if (local.startsWith('.') || local.endsWith('.') || local.includes('..')) return false;
  return EMAIL_RE.test(v);
}

/** Max lengths from CreateJobDto. */
export const JOB_FIELD_MAX = {
  company: 200,
  position: 200,
  location: 200,
  salaryRange: 100,
  contactName: 200,
  contactEmail: 320,
  jobUrl: 2048,
  notes: 5000,
} as const;

/**
 * Optional form value → payload value. On EDIT a cleared field is sent as
 * `null` (the API only copies fields that are `!== undefined`; `''` would trip
 * `@IsEmail`). On CREATE it is omitted so the server applies its defaults.
 */
export function optionalJobField(value: string, isEdit: boolean): string | null | undefined {
  const trimmed = value.trim();
  if (trimmed) return trimmed;
  return isEdit ? null : undefined;
}

/** Query params for GET /jobs/duplicate-check, or null when there is nothing to check. */
export function duplicateCheckParams(company: string, position: string): { company: string; position: string } | null {
  const c = company.trim();
  const p = position.trim();
  if (!c || !p) return null;
  return { company: c, position: p };
}

/** Website `duplicate_confirm` wording. */
export function duplicateConfirmMessage(dup: Pick<JobApplication, 'company' | 'position'>): string {
  return t('jobs.form.duplicateBody', { position: dup.position, company: dup.company });
}

/** Filename-safe fragment of a company or position name. */
function slug(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

/**
 * The interview as an `.ics` file — same summary/description/location/url and
 * filename as the website's "Add to calendar". Null when there is no parseable
 * interview date.
 */
export function interviewCalendarFile(
  job: Pick<JobApplication, 'company' | 'position' | 'location' | 'jobUrl' | 'interviewDate'>,
  now?: Date,
): { filename: string; content: string } | null {
  const content = buildIcsEvent({
    title: t('jobs.calendar.summary', { position: job.position, company: job.company }),
    description: [t('jobs.calendar.description', { position: job.position, company: job.company }), job.jobUrl]
      .filter(Boolean)
      .join('\n'),
    location: job.location,
    start: job.interviewDate,
    url: job.jobUrl,
    now,
  });
  if (!content) return null;
  const name = [slug(job.company ?? ''), slug(job.position ?? '')].filter(Boolean).join('-') || 'interview';
  return { filename: safeIcsFilename(`interview-${name}.ics`), content };
}
