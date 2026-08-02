import { JobStatus } from './enums';

export interface JobApplication {
  id: string;
  userId: string;
  company: string;
  position: string;
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
  /** Recruiter / hiring-contact details. */
  contactName: string | null;
  contactEmail: string | null;
  /** ISO date-time (YYYY-MM-DDTHH:mm) of a scheduled interview, or null. */
  interviewDate: string | null;
  /** ISO date (YYYY-MM-DD) to chase this application, or null. */
  followUpDate: string | null;
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
  status?: JobStatus;
  appliedDate?: string | null;
  notes?: string | null;
  linkedCVId?: string | null;
  linkedCoverLetterId?: string | null;
  salaryRange?: string | null;
  contactName?: string | null;
  contactEmail?: string | null;
  interviewDate?: string | null;
  followUpDate?: string | null;
  archived?: boolean;
}

export type CreateJobData = JobFields;
export type UpdateJobData = Partial<JobFields>;
