import type { CoverLetter } from '@flacroncv/shared-types';

export interface CLTemplateProps {
  coverLetter: CoverLetter;
  senderName?: string;
  senderEmail?: string;
  today?: string;
}
