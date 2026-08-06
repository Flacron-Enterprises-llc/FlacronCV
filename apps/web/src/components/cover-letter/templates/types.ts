import type { CoverLetter } from '@flacroncv/shared-types';

/** Localized letter-scaffolding strings, resolved once in CoverLetterPreview. */
export interface CLLabels {
  dear: string;
  hiringManager: string;
  placeholder: string;
  yourName: string;
  re: string;
  subjectApplication: string;
  position: string;
  closingSincerely: string;
  closingBestRegards: string;
  closingRegards: string;
  closingEnthusiasm: string;
  closingFaithfully: string;
  closingRespectfully: string;
}

export interface CLTemplateProps {
  coverLetter: CoverLetter;
  senderName?: string;
  senderEmail?: string;
  today?: string;
  labels: CLLabels;
}
