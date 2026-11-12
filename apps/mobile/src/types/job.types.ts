import { JobStatus } from './enums';

/** Mirrors packages/shared-types JobApplication. Dates may be ISO strings or Firestore timestamps. */
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
  contactName: string | null;
  contactEmail: string | null;
  interviewDate: string | null;
  followUpDate: string | null;
  archived: boolean;
  createdAt: unknown;
  updatedAt: unknown;
  deletedAt: unknown;
}

/** Create/update body (Nest CreateJobDto / UpdateJobDto). On edit, cleared optional fields are sent as `null`. */
export interface JobWritePayload {
  company: string;
  position: string;
  status: JobStatus;
  jobUrl?: string | null;
  location?: string | null;
  salaryRange?: string | null;
  contactName?: string | null;
  contactEmail?: string | null;
  appliedDate?: string | null;
  interviewDate?: string | null;
  followUpDate?: string | null;
  notes?: string | null;
  linkedCVId?: string | null;
  linkedCoverLetterId?: string | null;
}

/** PUT /jobs/:id partial body — archive/unarchive sends only `{ archived }` (as the website does). */
export type JobPatchPayload = Partial<JobWritePayload> & { archived?: boolean };

/** GET /jobs/duplicate-check?company=&position= */
export interface JobDuplicateCheck {
  duplicate: JobApplication | null;
}
