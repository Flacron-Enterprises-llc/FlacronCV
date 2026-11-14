import { JobStatus } from './enums';

/** Mirrors packages/shared-types JOB_LIMITS (the API enforces them). */
export const JOB_LIMITS = {
  descriptionChars: 20_000,
  contacts: 20,
  contactName: 200,
  contactRole: 200,
  contactEmail: 320,
  contactPhone: 50,
  contactNotes: 2_000,
  checklistItems: 50,
  checklistLabel: 300,
} as const;

export type JobOutcome = 'accepted' | 'declined' | 'rejected' | 'withdrawn' | 'no_response';
export type JobOutcomeOrigin = 'user_reported' | 'imported';
export type JobChecklistKind = 'document' | 'task';

export interface JobContact {
  id: string;
  name: string;
  role: string | null;
  email: string | null;
  phone: string | null;
  notes: string | null;
}

export interface JobChecklistItem {
  id: string;
  label: string;
  kind: JobChecklistKind;
  done: boolean;
}

export interface JobFormAnswer {
  id: string;
  question: string;
  answer: string;
}

export interface JobCvSnapshot {
  documentId: string;
  title: string;
  versionId: string;
  versionNumber: number | null;
  frozenAt: string;
}

export interface JobCoverLetterSnapshot {
  documentId: string;
  title: string;
  content: string;
  truncated: boolean;
  frozenAt: string;
}

/**
 * Mirrors packages/shared-types JobApplication. Dates may be ISO strings or
 * Firestore timestamps. The workspace fields are optional here because a
 * response from an older API (or older cached data) does not carry them.
 */
export interface JobApplication {
  id: string;
  userId: string;
  company: string;
  position: string;
  jobUrl: string | null;
  location: string | null;
  status: JobStatus;
  appliedDate: string | null;
  notes: string | null;
  linkedCVId: string | null;
  linkedCoverLetterId: string | null;
  salaryRange: string | null;
  /** @deprecated Mirror of contacts[0].name. */
  contactName: string | null;
  /** @deprecated Mirror of contacts[0].email. */
  contactEmail: string | null;
  interviewDate: string | null;
  followUpDate: string | null;
  deadline?: string | null;
  jobDescription?: string | null;
  jobDescriptionSource?: 'pasted' | 'opportunity' | null;
  contacts?: JobContact[];
  checklist?: JobChecklistItem[];
  formAnswers?: JobFormAnswer[];
  cvSnapshot?: JobCvSnapshot | null;
  coverLetterSnapshot?: JobCoverLetterSnapshot | null;
  outcome?: JobOutcome | null;
  outcomeOrigin?: JobOutcomeOrigin | null;
  opportunityId?: string | null;
  archived: boolean;
  createdAt: unknown;
  updatedAt: unknown;
  deletedAt: unknown;
}

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

/** Create/update body (Nest CreateJobDto / UpdateJobDto). On edit, cleared optional fields are sent as `null`. */
export interface JobWritePayload {
  company: string;
  position: string;
  status: JobStatus;
  jobUrl?: string | null;
  location?: string | null;
  salaryRange?: string | null;
  appliedDate?: string | null;
  interviewDate?: string | null;
  followUpDate?: string | null;
  deadline?: string | null;
  notes?: string | null;
  linkedCVId?: string | null;
  linkedCoverLetterId?: string | null;
  /** Sent whole; replaces the single contactName/contactEmail pair of older app versions. */
  contacts?: JobContactInput[];
  checklist?: JobChecklistItemInput[];
}

/** PUT /jobs/:id partial body — archive/unarchive sends only `{ archived }` (as the website does). */
export type JobPatchPayload = Partial<JobWritePayload> & { archived?: boolean };

/** GET /jobs/duplicate-check?company=&position= */
export interface JobDuplicateCheck {
  duplicate: JobApplication | null;
}
