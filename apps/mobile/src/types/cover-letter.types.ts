import { CoverLetterStatus } from './enums';

export interface CoverLetterStyling {
  fontFamily: string;
  fontSize: string;
  primaryColor: string;
  /** Letterhead sender, set in the editor (CoverLetterStylingDto, max 200). */
  senderName?: string;
  /** Letterhead sender email (CoverLetterStylingDto, max 320). */
  senderEmail?: string;
}

/** Exactly the keys CoverLetterStylingDto whitelists (forbidNonWhitelisted). */
export type CoverLetterStylingPayload = Partial<
  Pick<CoverLetterStyling, 'fontFamily' | 'fontSize' | 'primaryColor' | 'senderName' | 'senderEmail'>
>;

export type CoverLetterTone = 'professional' | 'friendly' | 'enthusiastic' | 'formal';

/** AIService COVER_LETTER_LENGTHS keys. */
export type CoverLetterLength = 'short' | 'medium' | 'long';

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
  tone: CoverLetterTone;
  linkedCVId?: string;
  language?: string;
}

/** Body of POST /ai/cover-letter (GenerateAiCoverLetterDto). Returns AIResponse; nothing is saved. */
export interface GenerateAiCoverLetterRequest {
  jobTitle: string;
  jobDescription: string;
  companyName: string;
  candidateSummary: string;
  tone: CoverLetterTone;
  length?: CoverLetterLength;
  language?: string;
}

/** Body of POST /ai/regenerate-paragraph (RegenerateParagraphDto). */
export interface RegenerateParagraphRequest {
  /** Whole letter as plain text, context only (max 20000). */
  letter: string;
  /** The one paragraph to rewrite (max 4000). */
  paragraph: string;
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
  tone?: CoverLetterTone;
  language?: string;
  /** Mobile-compat only; Nest allows, does not persist. */
  recipientTitle?: string;
  content?: string;
  status?: CoverLetterStatus;
  aiGenerated?: boolean;
  styling?: CoverLetterStylingPayload;
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
  styling?: CoverLetterStylingPayload;
  status?: CoverLetterStatus;
}
