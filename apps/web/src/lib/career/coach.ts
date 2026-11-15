import { isApiError, type CoachBalance, type CoachLocale, type CoachThread, type CoachThreadSummary } from '@flacroncv/career-api-client';
import { isCoachLocale, MAX_COACH_QUESTION, MIN_COACH_QUESTION } from '@flacroncv/career-shared';

/** The career service's limits (spec §26 career coach). The server enforces them; here they only guide the form. */
export const COACH_QUESTION_MIN = MIN_COACH_QUESTION;
export const COACH_QUESTION_MAX = MAX_COACH_QUESTION;

/** The interface language, when the coach can answer in it; otherwise the server default (English). */
export function coachLocale(uiLocale: string): CoachLocale | undefined {
  return isCoachLocale(uiLocale) ? uiLocale : undefined;
}

/** A question can be sent once it has real text and fits the limit. */
export function questionReady(question: string): boolean {
  const length = question.trim().length;
  return length >= COACH_QUESTION_MIN && length <= COACH_QUESTION_MAX;
}

/** Monthly allowance plus purchased packs: what the next reply can spend. */
export function coachRemaining(balance: CoachBalance): number {
  return Math.max(balance.includedRemaining, 0) + Math.max(balance.packRemaining, 0);
}

export type CoachBlock =
  | { kind: 'paragraph'; lines: string[] }
  | { kind: 'list'; ordered: boolean; items: string[] };

const BULLET = /^\s*[-*•]\s+(.*)$/;
const NUMBERED = /^\s*\d{1,3}[.)]\s+(.*)$/;

/**
 * Splits a reply into paragraphs and simple lists for plain-text rendering.
 * The text is never parsed as HTML or Markdown beyond "- item" and "1. item"
 * lines, so a reply cannot inject markup; line breaks are kept.
 */
export function coachBlocks(text: string): CoachBlock[] {
  const blocks: CoachBlock[] = [];
  for (const chunk of text.replace(/\r\n?/g, '\n').split(/\n\s*\n/)) {
    const lines = chunk.split('\n').filter((line) => line.trim().length > 0);
    let current: CoachBlock | null = null;
    for (const line of lines) {
      const bullet = BULLET.exec(line);
      const numbered = bullet ? null : NUMBERED.exec(line);
      if (bullet || numbered) {
        const ordered = numbered !== null;
        const item = (bullet ?? numbered)![1].trim();
        if (current?.kind === 'list' && current.ordered === ordered) current.items.push(item);
        else {
          current = { kind: 'list', ordered, items: [item] };
          blocks.push(current);
        }
      } else if (current?.kind === 'paragraph') {
        current.lines.push(line.trim());
      } else {
        current = { kind: 'paragraph', lines: [line.trim()] };
        blocks.push(current);
      }
    }
  }
  return blocks;
}

export type CoachNote =
  | 'upgrade'
  | 'quota'
  | 'provider'
  | 'feature'
  | 'thread_limit'
  | 'turn_limit'
  | 'not_found'
  | 'invalid'
  | 'failed';

/** Maps a refused or failed ask to the message the screen shows. Failed replies spend nothing on the server. */
export function coachNote(error: unknown): CoachNote {
  if (isApiError(error, 'plan_upgrade_required')) return 'upgrade';
  if (isApiError(error, 'quota_exhausted')) return 'quota';
  if (isApiError(error, 'provider_unavailable')) return 'provider';
  if (isApiError(error, 'feature_unavailable')) return 'feature';
  if (isApiError(error, 'not_found')) return 'not_found';
  if (isApiError(error, 'validation_error')) {
    if (error.body.reason === 'thread_limit') return 'thread_limit';
    if (error.body.reason === 'turn_limit') return 'turn_limit';
    return 'invalid';
  }
  return 'failed';
}

/** The list entry for a thread the server just returned. */
export function threadSummary(thread: CoachThread): CoachThreadSummary {
  return {
    id: thread.id,
    title: thread.title,
    opportunityId: thread.opportunityId,
    messageCount: thread.messageCount,
    updatedAt: thread.updatedAt,
  };
}

/** Puts the most recently answered thread first without duplicating it. */
export function upsertThread(items: CoachThreadSummary[], next: CoachThreadSummary): CoachThreadSummary[] {
  return [next, ...items.filter((item) => item.id !== next.id)];
}
