import { CoverLetterStatus } from './enums';

/** Languages a cover letter can be written in (the site's six locales). */
export type CoverLetterLocale = 'en' | 'es' | 'fr' | 'de' | 'ar' | 'ur';

export interface CoverLetterStyling {
  fontFamily: string;
  fontSize: string;
  primaryColor: string;
  senderName?: string;
  senderEmail?: string;
}

export interface CoverLetter {
  /** Language the letter is written in (labels, date, direction). Absent on older letters: clients infer it. */
  letterLocale?: CoverLetterLocale;
  id: string;
  userId: string;
  title: string;
  recipientName: string;
  recipientTitle: string;
  companyName: string;
  companyAddress: string;
  jobTitle: string;
  jobDescription: string;
  content: string;
  templateId: string;
  styling: CoverLetterStyling;
  aiGenerated: boolean;
  aiProvider: string | null;
  linkedCVId: string | null;
  status: CoverLetterStatus;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
}

export interface CreateCoverLetterData {
  /** Language the letter is written in (labels, date, direction). Absent on older letters: clients infer it. */
  letterLocale?: CoverLetterLocale;
  title: string;
  templateId?: string;
  linkedCVId?: string;
  recipientName?: string;
  companyName?: string;
  jobTitle?: string;
  jobDescription?: string;
  generateWithAI?: boolean;
  tone?: 'professional' | 'friendly' | 'enthusiastic' | 'formal';
  /** Human-readable language name (e.g. "French") for AI-on-create generation. */
  language?: string;
}

export interface UpdateCoverLetterData {
  /** Language the letter is written in (labels, date, direction). Absent on older letters: clients infer it. */
  letterLocale?: CoverLetterLocale;
  title?: string;
  recipientName?: string;
  recipientTitle?: string;
  companyName?: string;
  companyAddress?: string;
  jobTitle?: string;
  jobDescription?: string;
  content?: string;
  templateId?: string;
  styling?: Partial<CoverLetterStyling>;
  status?: CoverLetterStatus;
}

export interface GenerateCoverLetterData {
  jobTitle: string;
  jobDescription: string;
  companyName: string;
  tone: 'professional' | 'friendly' | 'enthusiastic' | 'formal';
  linkedCVId?: string;
  language?: string;
}
