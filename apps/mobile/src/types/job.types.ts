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

export interface JobWritePayload {
  company: string;
  position: string;
  status: JobStatus;
  jobUrl?: string | null;
  appliedDate?: string | null;
  interviewDate?: string | null;
  followUpDate?: string | null;
  notes?: string | null;
  linkedCVId?: string | null;
  linkedCoverLetterId?: string | null;
}
