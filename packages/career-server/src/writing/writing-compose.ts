import { extractJsonObject } from '../ai/text-model';

export const COVER_LETTER_TEMPLATE = 'cover-letter-compose@2';

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

export interface CoverLetterReply {
  opening: string;
  body: string;
  closing: string;
  factIds: string[];
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

export const WRITING_PROSE_TEMPLATE = 'writing-prose@1';

export const WRITING_PROSE_SYSTEM = [
  'Return one JSON object with keys body and factIds.',
  'body is the finished text in plain prose (no headings, no bullet list, no placeholders in brackets).',
  'type bio: a short third-person professional bio. type linkedin: a first-person LinkedIn About section.',
  'type outreach: a short first-person message asking a professional contact for a conversation.',
  'type referral_request: a short first-person message asking the contact to refer the person for the target role.',
  'type thank_you: a short first-person thank-you note after an interview for the target role.',
  'Use only the facts and target you were given. Do not invent employers, schools, dates, numbers, metrics, achievements, people, or events.',
  'Keep confirmed employer names, school names, and dates exactly as given.',
  'Experience facts include tenure. Only tenure current may be described as current work; ended or undated roles are past.',
  'target.organization is the organization being contacted or applied to. It is never a past employer unless it is also a confirmed experience company.',
  'Greet target.contactName by name only when it is given; otherwise use a neutral greeting such as "Hello," with no name.',
  'For thank_you, mention target.interviewDate only when it is given, and do not describe what was discussed in the interview.',
  'Write in the language given by language.',
  'factIds lists the ids of the facts the text relies on.',
].join(' ');

export interface ProseReply {
  body: string;
  factIds: string[];
}

export function parseProseReply(text: string): ProseReply | null {
  const parsed = extractJsonObject(text);
  if (!parsed || typeof parsed.body !== 'string') return null;
  const factIds = Array.isArray(parsed.factIds)
    ? parsed.factIds.filter((id): id is string => typeof id === 'string')
    : [];
  return { body: parsed.body, factIds };
}
