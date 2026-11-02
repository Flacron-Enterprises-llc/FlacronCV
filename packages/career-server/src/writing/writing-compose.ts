import { extractJsonObject } from '../ai/text-model';

export const WRITING_TEMPLATE = 'writing-compose@1';
export const COVER_LETTER_TEMPLATE = 'cover-letter-compose@2';

export const WRITING_SYSTEM = [
  'Return one JSON object with the key factIds.',
  'factIds is an ordered subset of the ids you were given.',
  'Do not write sentences, employers, dates, or numbers.',
  'If a fact has no number, do not add one.',
].join(' ');

export const COVER_LETTER_SYSTEM = [
  'Return one JSON object with keys opening, body, closing, and factIds.',
  'opening, body, and closing are paragraphs of a cover letter.',
  'Use only the facts and listing you were given. Do not invent employers, schools, dates, metrics, or achievements.',
  'Keep confirmed employer names, school names, and dates exactly as given.',
  'Experience facts include tenure. tenure ended means the role has an endDate: write it in the past tense and never say currently, current role, actuellement, or présentement.',
  'tenure current is true only when current is true and endDate is null. Only that role may be described as current work.',
  'tenure undated means dates are unknown: do not treat the role as current employment.',
  'listing.organization is the employer being applied to. It is not a past employer unless it is also a confirmed experience company.',
  'Do not substitute a similar employer name for a confirmed company.',
  'factIds must include every requiredFactId.',
  'opening states interest. body cites confirmed experience, education, and skills without repeating the same fact in every paragraph. closing is polite and brief.',
  'Do not return fact text alone as the letter.',
].join(' ');

export interface WritingReply {
  /** Undefined means keep every confirmed fact. An array, even empty, is the model's selection. */
  factIds?: string[];
}

export interface CoverLetterReply {
  opening: string;
  body: string;
  closing: string;
  factIds: string[];
}

/** Null when the reply is not the object the prompt asked for. Extra keys are ignored. */
export function parseWritingReply(text: string): WritingReply | null {
  const parsed = extractJsonObject(text);
  if (!parsed) return null;
  if (!('factIds' in parsed)) return {};
  if (!Array.isArray(parsed.factIds) || parsed.factIds.some((id) => typeof id !== 'string')) return null;
  return { factIds: parsed.factIds.filter((id): id is string => typeof id === 'string') };
}

export function parseCoverLetterReply(text: string): CoverLetterReply | null {
  const parsed = extractJsonObject(text);
  if (!parsed) return null;
  if (typeof parsed.opening !== 'string' || typeof parsed.body !== 'string' || typeof parsed.closing !== 'string') {
    return null;
  }
  const factIds = Array.isArray(parsed.factIds)
    ? parsed.factIds.filter((id): id is string => typeof id === 'string')
    : [];
  return {
    opening: parsed.opening,
    body: parsed.body,
    closing: parsed.closing,
    factIds,
  };
}
