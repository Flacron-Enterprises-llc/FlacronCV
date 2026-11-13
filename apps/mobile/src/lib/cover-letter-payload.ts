import { t } from '../i18n';
import type {
  CoverLetter,
  CoverLetterStyling,
  CoverLetterStylingPayload,
  CreateCoverLetterPayload,
  UpdateCoverLetterPayload,
} from '../types/cover-letter.types';

/** MaxLength of the matching Create/UpdateCoverLetterDto and CoverLetterStylingDto fields. */
export const COVER_LETTER_MAX = {
  title: 200,
  recipientName: 200,
  recipientTitle: 200,
  companyName: 200,
  companyAddress: 500,
  jobTitle: 200,
  jobDescription: 20000,
  senderName: 200,
  senderEmail: 320,
} as const;

const STYLING_KEYS = ['fontFamily', 'fontSize', 'primaryColor', 'senderName', 'senderEmail'] as const;

/**
 * Only the styling keys CoverLetterStylingDto whitelists, and only string
 * values. The API runs forbidNonWhitelisted, so echoing back an unknown key a
 * stored document happens to carry would 400 the whole save.
 */
export function pickStyling(styling: Partial<CoverLetterStyling> | null | undefined): CoverLetterStylingPayload {
  const out: CoverLetterStylingPayload = {};
  if (!styling) return out;
  for (const key of STYLING_KEYS) {
    const value = (styling as Record<string, unknown>)[key];
    if (typeof value === 'string') out[key] = value;
  }
  return out;
}

const TEXT_FIELDS = [
  'title',
  'recipientName',
  'recipientTitle',
  'companyName',
  'companyAddress',
  'jobTitle',
  'jobDescription',
  'templateId',
] as const;

/**
 * Editor save body: the same fields the website's autosave sends (title,
 * template, letter details, styling), never the whole document. `content` is
 * added only when the caller has decided it changed (see contentToSave), and
 * `status` is not included — it has its own Mark as final / Revert to draft PUT.
 */
export function buildEditorUpdate(
  letter: Pick<CoverLetter, (typeof TEXT_FIELDS)[number] | 'styling'>,
  content?: string,
): UpdateCoverLetterPayload {
  const body: UpdateCoverLetterPayload = {};
  for (const key of TEXT_FIELDS) {
    const value = letter[key];
    if (typeof value === 'string') body[key] = value;
  }
  body.styling = pickStyling(letter.styling);
  if (content !== undefined) body.content = content;
  return body;
}

export interface NewLetterForm {
  title: string;
  recipientName: string;
  companyName: string;
  jobTitle: string;
  jobDescription: string;
  linkedCVId: string;
}

function optional(value: string): string | undefined {
  const trimmed = value.trim();
  return trimmed ? trimmed : undefined;
}

/** POST /cover-letters body, as the website's create page builds it (trimmed, blanks omitted). */
export function buildCreatePayload(form: NewLetterForm): CreateCoverLetterPayload {
  const payload: CreateCoverLetterPayload = { title: form.title.trim() };
  const fields = {
    recipientName: optional(form.recipientName),
    companyName: optional(form.companyName),
    jobTitle: optional(form.jobTitle),
    jobDescription: optional(form.jobDescription),
    linkedCVId: optional(form.linkedCVId),
  };
  for (const [key, value] of Object.entries(fields)) {
    if (value !== undefined) (payload as unknown as Record<string, string>)[key] = value;
  }
  return payload;
}

/** Website validation copy (coverLetters.title_required / ai_fields_required). */
export function validateNewLetter(form: NewLetterForm, mode: 'blank' | 'ai'): string | null {
  if (!form.title.trim()) return t('coverLetters.validation.titleRequired');
  if (mode === 'ai' && (!form.jobTitle.trim() || !form.companyName.trim())) {
    return t('coverLetters.validation.aiFieldsRequired');
  }
  return null;
}

/** "Letter details" summary line on the collapsed row (web `addressedTo`). */
export function addressedTo(letter: Pick<CoverLetter, 'recipientName' | 'companyName'> | null | undefined): string {
  if (!letter) return '';
  return [letter.recipientName, letter.companyName]
    .map((s) => (typeof s === 'string' ? s.trim() : ''))
    .filter(Boolean)
    .join(' · ');
}
