import { CoverLetterStatus } from './enums';

export interface CoverLetterStyling {
  fontFamily: string;
  fontSize: string;
  primaryColor: string;
  senderName?: string;
  senderEmail?: string;
}

export interface CoverLetter {
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
  title: string;
  templateId?: string;
  linkedCVId?: string;
  recipientName?: string;
  companyName?: string;
  jobTitle?: string;
  jobDescription?: string;
  generateWithAI?: boolean;
  tone?: 'professional' | 'friendly' | 'enthusiastic' | 'formal';
}

export interface UpdateCoverLetterData {
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
