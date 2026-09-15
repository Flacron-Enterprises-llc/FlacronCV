import { CoverLetterStatus } from './enums';

export interface CoverLetterStyling {
  fontFamily: string;
  fontSize: string;
  primaryColor: string;
}

export interface CoverLetter {
  id: string;
  userId: string;
  title: string;
  recipientName: string;
  recipientTitle?: string;
  companyName: string;
  companyAddress?: string;
  jobTitle: string;
  jobDescription?: string;
  content: string;
  templateId: string;
  styling: CoverLetterStyling;
  aiGenerated: boolean;
  aiProvider: string | null;
  linkedCVId: string | null;
  status: CoverLetterStatus;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
}

/** Matches Nest GenerateCoverLetterDto / shared-types GenerateCoverLetterData. */
export interface GenerateCoverLetterData {
  jobTitle: string;
  jobDescription: string;
  companyName: string;
  tone: 'professional' | 'friendly' | 'enthusiastic' | 'formal';
  linkedCVId?: string;
  language?: string;
}

/** Writable create body — not Partial<CoverLetter> (id/userId/etc would 400). */
export interface CreateCoverLetterPayload {
  title: string;
  templateId?: string;
  linkedCVId?: string;
  recipientName?: string;
  companyName?: string;
  jobTitle?: string;
  jobDescription?: string;
  generateWithAI?: boolean;
  tone?: 'professional' | 'friendly' | 'enthusiastic' | 'formal';
  language?: string;
  /** Mobile-compat only; Nest allows, does not persist. */
  recipientTitle?: string;
  content?: string;
  status?: CoverLetterStatus;
  aiGenerated?: boolean;
  styling?: CoverLetterStyling;
}

/** Writable update body — whitelist fields Nest accepts. */
export interface UpdateCoverLetterPayload {
  title?: string;
  recipientName?: string;
  recipientTitle?: string;
  companyName?: string;
  companyAddress?: string;
  jobTitle?: string;
  jobDescription?: string;
  content?: string;
  templateId?: string;
  styling?: CoverLetterStyling;
  status?: CoverLetterStatus;
}
