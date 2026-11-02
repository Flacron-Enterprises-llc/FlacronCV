import { isResumeTemplateId } from '@flacroncv/career-shared';
import type { ResumeTemplateId } from '@flacroncv/career-shared';
import { extractJsonObject } from '../ai/text-model';

export const RESUME_COMPOSE_TEMPLATE = 'resume-compose@2';

export const RESUME_COMPOSE_SYSTEM = [
  'Return one JSON object with keys templateId and factIds.',
  'factIds is an ordered list of the ids you were given.',
  'You must include every requiredFactId. You may add other given ids after those.',
  'templateId is one of: classic, modern, minimal, compact, academic, professional, creative, executive, two-column, bold, sidebar, topbar, slate-gold, editorial, structured.',
  'Do not write sentences, employers, dates, or numbers. Those stay on the facts.',
].join(' ');

export interface ComposeReply {
  templateId?: ResumeTemplateId;
  /** Undefined means keep every fact. An array, even empty, is the model's selection. */
  factIds?: string[];
}

/** Null when the reply is not the object the prompt asked for. Extra keys are ignored. */
export function parseComposeReply(text: string): ComposeReply | null {
  const parsed = extractJsonObject(text);
  if (!parsed) return null;
  const reply: ComposeReply = {};
  if (typeof parsed.templateId === 'string' && isResumeTemplateId(parsed.templateId)) {
    reply.templateId = parsed.templateId;
  }
  if (Array.isArray(parsed.factIds) && parsed.factIds.every((id) => typeof id === 'string')) {
    const ids = parsed.factIds.filter((id): id is string => typeof id === 'string');
    if (ids.length > 0) reply.factIds = ids;
  }
  return reply;
}
