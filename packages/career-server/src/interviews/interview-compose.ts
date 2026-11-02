import { extractJsonObject } from '../ai/text-model';

export const INTERVIEW_TEMPLATE = 'interview-question@1';

export const INTERVIEW_SYSTEM = [
  'Return one JSON object with the key factIds.',
  'factIds is an ordered subset of the ids you were given.',
  'Do not write a question, a sentence, an employer, or a number.',
  'If a fact has no number, do not add one.',
].join(' ');

export interface InterviewReply {
  factIds?: string[];
}

/** Null when the reply is not the object the prompt asked for. Extra keys are ignored. */
export function parseInterviewReply(text: string): InterviewReply | null {
  const parsed = extractJsonObject(text);
  if (!parsed) return null;
  if (!('factIds' in parsed)) return {};
  if (!Array.isArray(parsed.factIds) || parsed.factIds.some((id) => typeof id !== 'string')) return null;
  return { factIds: parsed.factIds.filter((id): id is string => typeof id === 'string') };
}
