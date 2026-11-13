import { getLocale, t } from '../i18n';
import { nestErrorCode } from './api-errors';
import type {
  CoverLetterLength,
  CoverLetterTone,
  GenerateAiCoverLetterRequest,
  RegenerateParagraphRequest,
} from '../types/cover-letter.types';
import { escapeHtml } from './letter-html';

/** Same shape as useAI.ts GenerateJobDescriptionRequest (GenerateJobDescriptionDto). */
export type JobDescriptionRequest = { jobTitle: string; companyName?: string; language?: string };

/** English name of the app language, as the website sends it (its LOCALE_LANGUAGE_NAMES). */
const LANGUAGE_NAMES: Record<string, string> = { en: 'English', es: 'Spanish', fr: 'French', de: 'German', ar: 'Arabic', ur: 'Urdu' };
export function aiLanguage(): string {
  return LANGUAGE_NAMES[getLocale()] ?? 'English';
}
/** The default (English app) value. */
export const AI_LANGUAGE = 'English';

/** DTO caps (GenerateAiCoverLetterDto, RegenerateParagraphDto, GenerateJobDescriptionDto). */
export const AI_LIMITS = {
  jobTitle: 200,
  companyName: 200,
  jobDescription: 20000,
  candidateSummary: 50000,
  letter: 20000,
  paragraph: 4000,
} as const;

function clamp(text: string | null | undefined, max: number): string {
  const trimmed = (text ?? '').trim();
  return trimmed.length <= max ? trimmed : trimmed.slice(0, max);
}

/** POST /ai/generate-job-description body. Same fields as the web "AI Generate" button. */
export function buildJobDescriptionRequest(
  jobTitle: string,
  companyName: string,
): JobDescriptionRequest {
  const company = clamp(companyName, AI_LIMITS.companyName);
  return {
    jobTitle: clamp(jobTitle, AI_LIMITS.jobTitle),
    ...(company ? { companyName: company } : {}),
    language: aiLanguage(),
  };
}

/**
 * POST /ai/cover-letter body — the website's "Generate with AI" on the create
 * page. Generates a draft only; nothing is created until the user saves it.
 */
export function buildDraftRequest(input: {
  jobTitle: string;
  jobDescription: string;
  companyName: string;
  candidateSummary: string;
  tone: CoverLetterTone;
  length: CoverLetterLength;
}): GenerateAiCoverLetterRequest {
  return {
    jobTitle: clamp(input.jobTitle, AI_LIMITS.jobTitle),
    jobDescription: clamp(input.jobDescription, AI_LIMITS.jobDescription),
    companyName: clamp(input.companyName, AI_LIMITS.companyName),
    candidateSummary: clamp(input.candidateSummary, AI_LIMITS.candidateSummary),
    tone: input.tone,
    length: input.length,
    language: aiLanguage(),
  };
}

/**
 * POST /ai/regenerate-paragraph body. The whole letter goes as context (plain
 * text, blank-line separated, like the web's `getText({ blockSeparator })`),
 * but only the one paragraph comes back.
 */
export function buildParagraphRequest(letterText: string, paragraph: string): RegenerateParagraphRequest {
  return {
    letter: clamp(letterText, AI_LIMITS.letter),
    paragraph: clamp(paragraph, AI_LIMITS.paragraph),
    language: aiLanguage(),
  };
}

/** `{ content }` of an AIResponse, trimmed. Throws when the server sent nothing usable. */
export function readAiContent(response: unknown): string {
  const content =
    response && typeof response === 'object'
      ? (response as { content?: unknown }).content
      : undefined;
  if (typeof content !== 'string' || !content.trim()) {
    throw new Error(t('coverLetters.ai.emptyResult'));
  }
  return content.trim();
}

/**
 * Reviewed draft (plain text) → `<p>` HTML, exactly the web create page's
 * `textToParagraphHtml`: ALWAYS escaped, because the model output echoes a
 * pasted job description and is not trusted markup (unlike `toLetterHtml`,
 * which passes text that already looks like HTML through).
 */
export function draftToHtml(text: string): string {
  return text
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) => `<p>${escapeHtml(p).replace(/\n/g, '<br>')}</p>`)
    .join('');
}

/**
 * Second line under an AI failure, same wording as the website: the API says
 * (code AI_CREDIT_NOT_REFUNDED) when it could not confirm the refund.
 */
export function aiChargeNote(err: unknown): string {
  return nestErrorCode(err) === 'AI_CREDIT_NOT_REFUNDED'
    ? t('coverLetters.ai.chargeUnconfirmed')
    : t('coverLetters.ai.noCharge');
}

/** Create-page wording (nothing is saved on failure). */
export function draftChargeNote(err: unknown): string {
  return nestErrorCode(err) === 'AI_CREDIT_NOT_REFUNDED'
    ? t('coverLetters.ai.draftChargeUnconfirmed')
    : t('coverLetters.ai.draftNoCharge');
}
