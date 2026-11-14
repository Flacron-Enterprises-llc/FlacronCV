import { JobStatus } from './enums';

/*
 * Application workspace (spec §1 "Application workspace", §16 "Applications",
 * §18 "Application" record, §24 "Application workspace and networking tracker").
 *
 * BACKWARD COMPATIBILITY — read this before changing anything here.
 *
 * `job_applications` documents written before the workspace existed have only
 * the first set of fields (single contact, status in the old six-value set) and
 * mobile apps already in the field keep writing that shape. The rules:
 *
 *  1. Old statuses are mapped, never rejected:
 *       wishlist → saved, offer → offered,
 *       accepted → offered + outcome "accepted" (origin user_reported).
 *     "Accepted" is not a stage on the spec's board; it is how an offer ended,
 *     so it becomes the application's outcome instead of an eighth column. The
 *     API accepts the old values on write (`JOB_STATUS_INPUTS`) and every read
 *     goes through `normalizeJobApplication`, so a document is upgraded the
 *     first time it is saved again; untouched documents are still read correctly.
 *  2. The old single contact (`contactName` / `contactEmail`) becomes the first
 *     entry of `contacts`. Both legacy fields are still WRITTEN as a mirror of
 *     the first contact, so old clients (and anything else reading the raw
 *     document) keep showing a contact.
 *  3. Every field added for the workspace is optional on read and defaults to
 *     empty, so an old document normalises to a complete `JobApplication`.
 */

/** Board order: the spec's seven stages, in pipeline order. */
export const JOB_STATUSES: readonly JobStatus[] = [
  JobStatus.SAVED,
  JobStatus.PREPARING,
  JobStatus.APPLIED,
  JobStatus.INTERVIEWING,
  JobStatus.OFFERED,
  JobStatus.REJECTED,
  JobStatus.WITHDRAWN,
];

/** Values written by clients and documents from before the seven-stage board. */
export type LegacyJobStatus = 'wishlist' | 'offer' | 'accepted';
export const LEGACY_JOB_STATUSES: readonly LegacyJobStatus[] = ['wishlist', 'offer', 'accepted'];

/** Every status value the API accepts on write (current + legacy). */
export const JOB_STATUS_INPUTS: readonly string[] = [...JOB_STATUSES, ...LEGACY_JOB_STATUSES];

/** How an application ended. Separate from the stage: an offer can be accepted or declined. */
export type JobOutcome = 'accepted' | 'declined' | 'rejected' | 'withdrawn' | 'no_response';
export const JOB_OUTCOMES: readonly JobOutcome[] = ['accepted', 'declined', 'rejected', 'withdrawn', 'no_response'];

/**
 * Where the outcome came from (spec §24 "outcome origin", §17 "Analytics
 * identify user-reported data"). Clients can only report `user_reported`;
 * `imported` is reserved for a server-side import the user authorised.
 */
export type JobOutcomeOrigin = 'user_reported' | 'imported';
export const JOB_OUTCOME_ORIGINS: readonly JobOutcomeOrigin[] = ['user_reported', 'imported'];

/** Where the job-description snapshot came from. */
export type JobDescriptionSource = 'pasted' | 'opportunity';

/** Size caps (characters / entries). One table so API, web and mobile agree. */
export const JOB_LIMITS = {
  /** A job description is a few thousand characters; this leaves room without bloating the document. */
  descriptionChars: 20_000,
  contacts: 20,
  contactName: 200,
  contactRole: 200,
  contactEmail: 320,
  contactPhone: 50,
  contactNotes: 2_000,
  checklistItems: 50,
  checklistLabel: 300,
  formAnswers: 50,
  question: 1_000,
  answer: 5_000,
  /** Cover-letter content frozen with the application. */
  letterSnapshotChars: 60_000,
  statusHistory: 100,
  itemId: 64,
  opportunityId: 200,
} as const;

export interface JobContact {
  /** Stable within the application, so edits and deletes target the right row. */
  id: string;
  name: string;
  role: string | null;
  email: string | null;
  phone: string | null;
  notes: string | null;
}

export type JobChecklistKind = 'document' | 'task';

/** A required document or a task (e.g. "Portfolio link", "Ask Sam for a referral"). */
export interface JobChecklistItem {
  id: string;
  label: string;
  kind: JobChecklistKind;
  done: boolean;
}

/** A question asked by the employer's form and the answer the user gave. */
export interface JobFormAnswer {
  id: string;
  question: string;
  answer: string;
}

/**
 * The CV version used for this application, frozen when the CV was linked.
 * Points at a V1 CV version (`cvs/{documentId}/versions/{versionId}`), so later
 * edits to the CV do not change what this application records as sent.
 */
export interface JobCvSnapshot {
  documentId: string;
  /** CV title when it was frozen (the CV may be renamed or deleted later). */
  title: string;
  versionId: string;
  versionNumber: number | null;
  /** ISO instant. */
  frozenAt: string;
}

/** The cover letter used, frozen as a copy of its content (letters have no version history). */
export interface JobCoverLetterSnapshot {
  documentId: string;
  title: string;
  content: string;
  /** True when the letter was longer than `JOB_LIMITS.letterSnapshotChars` and was cut. */
  truncated: boolean;
  frozenAt: string;
}

export interface JobStatusChange {
  status: JobStatus;
  /** ISO instant. */
  at: string;
}

export interface JobApplication {
  id: string;
  userId: string;
  company: string;
  position: string;
  /** The original vacancy link (the application's source link). */
  jobUrl: string | null;
  location: string | null;
  status: JobStatus;
  /** ISO date (YYYY-MM-DD) the application was submitted, or null. */
  appliedDate: string | null;
  notes: string | null;
  /** Optional link to one of the user's CVs used for this application. */
  linkedCVId: string | null;
  /** Optional link to one of the user's cover letters used for this application. */
  linkedCoverLetterId: string | null;
  /** Free-text salary range as the user recorded it, e.g. "£55k–£65k". */
  salaryRange: string | null;
  /**
   * @deprecated Mirror of `contacts[0].name`, kept for clients from before
   * multiple contacts. Read `contacts`.
   */
  contactName: string | null;
  /** @deprecated Mirror of `contacts[0].email`. Read `contacts`. */
  contactEmail: string | null;
  /** ISO date-time (YYYY-MM-DDTHH:mm) of a scheduled interview, or null. */
  interviewDate: string | null;
  /** ISO date (YYYY-MM-DD) to chase this application, or null. */
  followUpDate: string | null;
  /** ISO date (YYYY-MM-DD) the application closes, or null. */
  deadline: string | null;
  /** The job description as it was when saved (pasted, or from a saved opportunity). */
  jobDescription: string | null;
  jobDescriptionSource: JobDescriptionSource | null;
  contacts: JobContact[];
  checklist: JobChecklistItem[];
  formAnswers: JobFormAnswer[];
  cvSnapshot: JobCvSnapshot | null;
  coverLetterSnapshot: JobCoverLetterSnapshot | null;
  outcome: JobOutcome | null;
  outcomeOrigin: JobOutcomeOrigin | null;
  /** ISO instant the outcome was recorded. */
  outcomeRecordedAt: string | null;
  /** Career-service opportunity this application was created from, if any. */
  opportunityId: string | null;
  /** Stage changes, oldest first (capped at `JOB_LIMITS.statusHistory`). */
  statusHistory: JobStatusChange[];
  /**
   * Archived applications stay in the account but are hidden from the default
   * view — the client asked for archiving rather than deletion for roles that
   * are simply finished with.
   */
  archived: boolean;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
}

/** A contact as a client sends it; the server assigns an `id` when none is given. */
export interface JobContactInput {
  id?: string;
  name: string;
  role?: string | null;
  email?: string | null;
  phone?: string | null;
  notes?: string | null;
}

export interface JobChecklistItemInput {
  id?: string;
  label: string;
  kind?: JobChecklistKind;
  done?: boolean;
}

export interface JobFormAnswerInput {
  id?: string;
  question: string;
  answer: string;
}

/**
 * Fields a user may supply when creating or editing an application.
 *
 * Optional text fields accept `null` as well as `string`: on an edit, `null`
 * means "the user cleared this", which the server must persist. Omitting the
 * key (`undefined`) means "leave it alone" — the update whitelist only copies
 * keys that are `!== undefined`, so the two are meaningfully different.
 */
export interface JobFields {
  company: string;
  position: string;
  jobUrl?: string | null;
  location?: string | null;
  /** Current or legacy value (`JOB_STATUS_INPUTS`); the server normalises it. */
  status?: JobStatus | LegacyJobStatus;
  appliedDate?: string | null;
  notes?: string | null;
  linkedCVId?: string | null;
  linkedCoverLetterId?: string | null;
  salaryRange?: string | null;
  /** @deprecated Old single contact; used only when `contacts` is not sent. */
  contactName?: string | null;
  /** @deprecated Old single contact; used only when `contacts` is not sent. */
  contactEmail?: string | null;
  interviewDate?: string | null;
  followUpDate?: string | null;
  deadline?: string | null;
  jobDescription?: string | null;
  jobDescriptionSource?: JobDescriptionSource | null;
  contacts?: JobContactInput[];
  checklist?: JobChecklistItemInput[];
  formAnswers?: JobFormAnswerInput[];
  /** Reported by the user; the server records the origin and time. */
  outcome?: JobOutcome | null;
  opportunityId?: string | null;
  archived?: boolean;
}

export type CreateJobData = JobFields;
export type UpdateJobData = Partial<JobFields>;

/** Tracked-application usage against the plan capacity; `limit` null = not limited here. */
export interface JobCapacity {
  used: number;
  limit: number | null;
}

// ---------------------------------------------------------------------------
// Normalisation (pure — used by the API on every read/write, and by clients)
// ---------------------------------------------------------------------------

const CURRENT = new Set<string>(JOB_STATUSES);

/**
 * Map a current or legacy status to the current set. `acceptedOffer` is true
 * only for the legacy `accepted`, whose meaning moves into the outcome.
 * Returns null for anything else (the caller decides how to treat garbage).
 */
export function normalizeJobStatus(value: unknown): { status: JobStatus; acceptedOffer: boolean } | null {
  if (typeof value !== 'string') return null;
  if (CURRENT.has(value)) return { status: value as JobStatus, acceptedOffer: false };
  if (value === 'wishlist') return { status: JobStatus.SAVED, acceptedOffer: false };
  if (value === 'offer') return { status: JobStatus.OFFERED, acceptedOffer: false };
  if (value === 'accepted') return { status: JobStatus.OFFERED, acceptedOffer: true };
  return null;
}

/**
 * Whether the application still needs action: not archived, not rejected or
 * withdrawn, and no outcome recorded. Follow-up reminders only matter then.
 */
export function isJobOpen(job: Pick<JobApplication, 'archived' | 'status' | 'outcome'>): boolean {
  return (
    !job.archived &&
    job.status !== JobStatus.REJECTED &&
    job.status !== JobStatus.WITHDRAWN &&
    (job.outcome ?? null) === null
  );
}

/** Id given to the contact migrated from the old single-contact fields (stable across reads). */
export const LEGACY_CONTACT_ID = 'legacy-contact';

type Raw = Record<string, unknown>;

function isRecord(value: unknown): value is Raw {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function str(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value : null;
}

function oneOf<T extends string>(value: unknown, allowed: readonly T[]): T | null {
  return typeof value === 'string' && (allowed as readonly string[]).includes(value) ? (value as T) : null;
}

function rows<T>(value: unknown, max: number, map: (row: Raw, index: number) => T | null): T[] {
  if (!Array.isArray(value)) return [];
  const out: T[] = [];
  for (const [index, row] of value.entries()) {
    if (out.length >= max) break;
    if (!isRecord(row)) continue;
    const mapped = map(row, index);
    if (mapped) out.push(mapped);
  }
  return out;
}

function readContacts(raw: Raw): JobContact[] {
  if (Array.isArray(raw.contacts)) {
    return rows(raw.contacts, JOB_LIMITS.contacts, (row, index) => {
      const name = str(row.name);
      const email = str(row.email);
      if (!name && !email) return null;
      return {
        id: str(row.id) ?? `contact-${index}`,
        name: name ?? '',
        role: str(row.role),
        email,
        phone: str(row.phone),
        notes: str(row.notes),
      };
    });
  }
  // Pre-workspace document: the single contact becomes the first entry.
  const name = str(raw.contactName);
  const email = str(raw.contactEmail);
  if (!name && !email) return [];
  return [{ id: LEGACY_CONTACT_ID, name: name ?? '', role: null, email, phone: null, notes: null }];
}

/**
 * Read any stored `job_applications` document (old or new shape) as a complete
 * `JobApplication`. Never throws; unknown statuses (only possible in corrupt
 * documents) read as `saved` so the application stays visible and editable.
 */
export function normalizeJobApplication(input: unknown): JobApplication {
  const raw: Raw = isRecord(input) ? input : {};
  const status = normalizeJobStatus(raw.status);
  const contacts = readContacts(raw);
  const storedOutcome = oneOf(raw.outcome, JOB_OUTCOMES);
  const legacyAccepted = status?.acceptedOffer === true && storedOutcome === null;

  const cv = isRecord(raw.cvSnapshot) ? raw.cvSnapshot : null;
  const letter = isRecord(raw.coverLetterSnapshot) ? raw.coverLetterSnapshot : null;

  return {
    id: typeof raw.id === 'string' ? raw.id : '',
    userId: typeof raw.userId === 'string' ? raw.userId : '',
    company: typeof raw.company === 'string' ? raw.company : '',
    position: typeof raw.position === 'string' ? raw.position : '',
    jobUrl: str(raw.jobUrl),
    location: str(raw.location),
    status: status?.status ?? JobStatus.SAVED,
    appliedDate: str(raw.appliedDate),
    notes: str(raw.notes),
    linkedCVId: str(raw.linkedCVId),
    linkedCoverLetterId: str(raw.linkedCoverLetterId),
    salaryRange: str(raw.salaryRange),
    contactName: contacts[0]?.name || null,
    contactEmail: contacts[0]?.email ?? null,
    interviewDate: str(raw.interviewDate),
    followUpDate: str(raw.followUpDate),
    deadline: str(raw.deadline),
    jobDescription: str(raw.jobDescription),
    jobDescriptionSource: oneOf(raw.jobDescriptionSource, ['pasted', 'opportunity'] as const),
    contacts,
    checklist: rows(raw.checklist, JOB_LIMITS.checklistItems, (row, index) => {
      const label = str(row.label);
      if (!label) return null;
      return {
        id: str(row.id) ?? `item-${index}`,
        label,
        kind: oneOf(row.kind, ['document', 'task'] as const) ?? 'task',
        done: row.done === true,
      };
    }),
    formAnswers: rows(raw.formAnswers, JOB_LIMITS.formAnswers, (row, index) => {
      const question = str(row.question);
      if (!question) return null;
      return { id: str(row.id) ?? `answer-${index}`, question, answer: typeof row.answer === 'string' ? row.answer : '' };
    }),
    cvSnapshot:
      cv && str(cv.documentId) && str(cv.versionId)
        ? {
            documentId: cv.documentId as string,
            title: typeof cv.title === 'string' ? cv.title : '',
            versionId: cv.versionId as string,
            versionNumber: typeof cv.versionNumber === 'number' ? cv.versionNumber : null,
            frozenAt: typeof cv.frozenAt === 'string' ? cv.frozenAt : '',
          }
        : null,
    coverLetterSnapshot:
      letter && str(letter.documentId)
        ? {
            documentId: letter.documentId as string,
            title: typeof letter.title === 'string' ? letter.title : '',
            content: typeof letter.content === 'string' ? letter.content : '',
            truncated: letter.truncated === true,
            frozenAt: typeof letter.frozenAt === 'string' ? letter.frozenAt : '',
          }
        : null,
    outcome: storedOutcome ?? (legacyAccepted ? 'accepted' : null),
    outcomeOrigin: oneOf(raw.outcomeOrigin, JOB_OUTCOME_ORIGINS) ?? (legacyAccepted ? 'user_reported' : null),
    outcomeRecordedAt: str(raw.outcomeRecordedAt),
    opportunityId: str(raw.opportunityId),
    statusHistory: rows(raw.statusHistory, JOB_LIMITS.statusHistory, (row) => {
      const change = normalizeJobStatus(row.status);
      return change && typeof row.at === 'string' ? { status: change.status, at: row.at } : null;
    }),
    archived: raw.archived === true,
    createdAt: raw.createdAt as Date,
    updatedAt: raw.updatedAt as Date,
    deletedAt: (raw.deletedAt ?? null) as Date | null,
  };
}
