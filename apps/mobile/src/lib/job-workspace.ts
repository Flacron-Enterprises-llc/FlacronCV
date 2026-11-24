import { ApiError } from '../../../../packages/career-api-client/src/client';
import type { WritingContextInput, WritingType } from '../../../../packages/career-api-client/src/types';
import { t } from '../i18n';
import { JobStatus } from '../types/enums';
import type { JobApplication, JobOutcome } from '../types/job.types';
import { escapeIcsText, foldIcsLine, safeIcsFilename } from './ics';
import { normalizeStatus } from './job-tracker';

/**
 * Application-workspace logic the website has in components/jobs
 * (job-workspace.ts, application-drafts.ts): the follow-up calendar file,
 * referral / thank-you draft context and honest refusal states, the outcome
 * list and the frozen-letter text. Pure: unit-tested under node.
 */

/** Same caps as packages/shared-types JOB_LIMITS (the API enforces them). */
export const ANSWER_LIMITS = { formAnswers: 50, question: 1_000, answer: 5_000, description: 20_000 } as const;

/** Outcomes a person may report (V1 `JobOutcome`). Never filled in automatically. */
export const JOB_OUTCOMES: readonly JobOutcome[] = ['accepted', 'declined', 'rejected', 'withdrawn', 'no_response'];

function slug(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

/** `YYYY-MM-DD` → that day and the next as `YYYYMMDD` (all-day DTEND is exclusive). */
function allDayRange(value: string): { start: string; end: string } | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim());
  if (!m) return null;
  const start = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  if (Number.isNaN(start.getTime()) || start.getUTCDate() !== Number(m[3])) return null;
  const fmt = (d: Date) => d.toISOString().slice(0, 10).replace(/-/g, '');
  return { start: fmt(start), end: fmt(new Date(start.getTime() + 86_400_000)) };
}

/**
 * The follow-up date as an all-day `.ics` event (website
 * `applicationCalendarFile(job, 'follow_up')`, same UID so a second download
 * updates the entry). Null without a valid YYYY-MM-DD follow-up date.
 */
export function followUpCalendarFile(
  job: Pick<JobApplication, 'id' | 'company' | 'position' | 'jobUrl' | 'followUpDate'>,
  now: Date = new Date(),
): { filename: string; content: string } | null {
  const range = allDayRange(job.followUpDate ?? '');
  if (!range) return null;
  const names = { position: job.position, company: job.company };
  const description = [t('jobs.workspace.calendar.follow_up.description', names), job.jobUrl].filter(Boolean).join('\n');
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//FlacronCV//Job Tracker//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:${job.id}-follow_up@flacroncv.com`,
    `DTSTAMP:${now.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '')}`,
    `DTSTART;VALUE=DATE:${range.start}`,
    `DTEND;VALUE=DATE:${range.end}`,
    `SUMMARY:${escapeIcsText(t('jobs.workspace.calendar.follow_up.summary', names))}`,
    `DESCRIPTION:${escapeIcsText(description)}`,
  ];
  if (job.jobUrl) lines.push(`URL:${job.jobUrl.replace(/[\r\n]+/g, '')}`);
  lines.push('END:VEVENT', 'END:VCALENDAR');
  const name = [slug(job.company ?? ''), slug(job.position ?? '')].filter(Boolean).join('-') || 'application';
  return { filename: safeIcsFilename(`follow-up-${name}.ics`), content: `${lines.map(foldIcsLine).join('\r\n')}\r\n` };
}

// ---------------------------------------------------------------------------
// Referral and thank-you drafts (career writing service)
// ---------------------------------------------------------------------------

export type ApplicationDraftType = Extract<WritingType, 'referral_request' | 'thank_you'>;
export type DraftProblem = 'quota' | 'upgrade' | 'unavailable' | 'unsupported' | 'missing' | 'missing_target' | 'ai_declined' | 'failed';

const clip = (value: string | null | undefined, max: number): string | undefined => {
  const text = (value ?? '').trim();
  return text ? text.slice(0, max) : undefined;
};

/**
 * What the person wrote on the application, sent as the draft's target when
 * there is no saved listing. Only their own words; empty fields are left out.
 */
export function draftContextOf(
  job: Pick<JobApplication, 'company' | 'position' | 'interviewDate' | 'contactName'> & { contacts?: JobApplication['contacts'] },
): WritingContextInput {
  const contact = job.contacts?.[0];
  const interview = typeof job.interviewDate === 'string' ? job.interviewDate.slice(0, 10) : '';
  const context: WritingContextInput = {
    organization: clip(job.company, 200),
    role: clip(job.position, 200),
    contactName: clip(contact?.name ?? job.contactName, 200),
    contactRole: clip(contact?.role, 200),
    interviewDate: /^\d{4}-\d{2}-\d{2}$/.test(interview) ? interview : undefined,
  };
  return Object.fromEntries(Object.entries(context).filter(([, v]) => v !== undefined)) as WritingContextInput;
}

/** A referral before or around applying; thanks after an interview. */
export function draftTypesFor(job: Pick<JobApplication, 'status' | 'interviewDate'>): ApplicationDraftType[] {
  const status = normalizeStatus(job.status);
  const types: ApplicationDraftType[] = [];
  if (status === JobStatus.SAVED || status === JobStatus.PREPARING || status === JobStatus.APPLIED) types.push('referral_request');
  if (status === JobStatus.INTERVIEWING || status === JobStatus.OFFERED || (job.interviewDate && status === JobStatus.APPLIED)) {
    types.push('thank_you');
  }
  return types;
}

/** Career API refusal → the honest state shown (nothing is claimed as sent or charged). */
export function draftProblemOf(error: unknown): DraftProblem {
  if (!(error instanceof ApiError)) return 'failed';
  if (error.code === 'ai_consent_declined') return 'ai_declined';
  if (error.code === 'quota_exhausted') return 'quota';
  if (error.code === 'plan_upgrade_required' || error.code === 'permission_denied') return 'upgrade';
  if (error.code === 'provider_unavailable') return 'unavailable';
  if (error.code === 'validation_error' && error.body?.reason === 'missing_target') return 'missing_target';
  if (error.code === 'validation_error') return 'unsupported';
  if (error.code === 'not_found') return 'missing';
  return 'failed';
}

/** A definite refusal ends the attempt (a new key next time); a lost response keeps the key so a retry is not charged twice. */
export function draftKeyIsSpent(error: unknown): boolean {
  if (!(error instanceof ApiError)) return false;
  return (error.status >= 400 && error.status < 500) || error.code === 'provider_unavailable';
}

/** Plain text of a frozen cover letter stored as HTML. Tags are dropped, never rendered. */
export function letterText(content: string): string {
  if (!/<[a-z][\s\S]*>/i.test(content)) return content;
  return content
    .replace(/<\/(p|div|li|h[1-6])>|<br\s*\/?>/gi, '\n')
    .replace(/<[^>]*>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

// ---------------------------------------------------------------------------
// Date entry without a native picker
// ---------------------------------------------------------------------------

/**
 * Typed digits shaped as `YYYY-MM-DD` while typing (number pad, no separators
 * needed). Anything that is not a digit is ignored; at most 8 digits.
 */
export function formatDateDigits(input: string): string {
  const digits = input.replace(/\D/g, '').slice(0, 8);
  if (digits.length <= 4) return digits;
  if (digits.length <= 6) return `${digits.slice(0, 4)}-${digits.slice(4)}`;
  return `${digits.slice(0, 4)}-${digits.slice(4, 6)}-${digits.slice(6)}`;
}

/** Typed digits shaped as `YYYY-MM-DDTHH:mm` (the interview field); at most 12 digits. */
export function formatDateTimeDigits(input: string): string {
  const digits = input.replace(/\D/g, '').slice(0, 12);
  const date = formatDateDigits(digits.slice(0, 8));
  if (digits.length <= 8) return date;
  const time = digits.slice(8);
  return `${date}T${time.length <= 2 ? time : `${time.slice(0, 2)}:${time.slice(2)}`}`;
}

/** Today (or `days` from today) as a local `YYYY-MM-DD`, for the quick-pick buttons. */
export function localDayFromToday(days: number, now: Date = new Date()): string {
  const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() + days);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
