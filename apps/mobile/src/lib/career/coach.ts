import { ApiError } from '../../../../../packages/career-api-client/src/client';
import type {
  AskCoachInput,
  CoachList,
  CoachLocale,
  CoachMessage,
  CoachThread,
} from '../../../../../packages/career-api-client/src/types';
import { t } from '../../i18n';
import { careerErrorMessage } from '../career-view';

/**
 * Pure view logic for the career coach (spec §26, tested in coach.test.ts).
 * Every coach reply spends one coaching response; the career API reserves,
 * charges and refuses. Nothing here grants or charges. Copy lives in the
 * `careerCoach` namespace.
 */

/** Mirrors the server limits (career-shared coaching limits); the server repeats every check. */
export const MAX_COACH_QUESTION = 2000;
export const MIN_COACH_QUESTION = 2;
export const MAX_COACH_THREADS = 50;
export const MAX_COACH_TURNS = 40;

/** Route segment for a conversation that does not exist yet. */
export const NEW_THREAD = 'new';

const COACH_LOCALES: readonly CoachLocale[] = ['en', 'fr', 'de', 'es', 'ar', 'ur'];

/** The reply language for the app language; anything unknown asks for English. */
export function coachLocale(locale: string | null | undefined): CoachLocale {
  const base = (locale ?? '').toLowerCase().split(/[-_]/)[0];
  return (COACH_LOCALES as readonly string[]).includes(base) ? (base as CoachLocale) : 'en';
}

/** Coaching replies left this month (included + packs), never negative. */
export function coachLeft(list: Pick<CoachList, 'coaching'> | undefined | null): number {
  if (!list) return 0;
  return Math.max(0, list.coaching.includedRemaining) + Math.max(0, list.coaching.packRemaining);
}

/** The balance line: included replies, plus pack replies when there are any. */
export function balanceLine(list: Pick<CoachList, 'coaching'>): string {
  const included = Math.max(0, list.coaching.includedRemaining);
  const packs = Math.max(0, list.coaching.packRemaining);
  return packs > 0 ? t('careerCoach.balanceWithPacks', { count: included, packs }) : t('careerCoach.balance', { count: included });
}

/** Characters typed out of the limit, for the composer counter. */
export function questionCounter(text: string): { used: number; max: number; over: boolean } {
  const used = text.length;
  return { used, max: MAX_COACH_QUESTION, over: used > MAX_COACH_QUESTION };
}

export type CoachTarget = { threadId: string } | { threadId: null; opportunityId: string | null };

/**
 * The request body for one question, or the reason it cannot be sent.
 * A new conversation may name a saved listing; a reply never does.
 */
export function askInput(
  text: string,
  target: CoachTarget,
  locale: string | null | undefined,
): { ok: true; input: AskCoachInput } | { ok: false; message: string } {
  const question = text.trim();
  if (question.length < MIN_COACH_QUESTION) return { ok: false, message: t('careerCoach.errors.tooShort') };
  if (question.length > MAX_COACH_QUESTION) return { ok: false, message: t('careerCoach.errors.tooLong', { max: MAX_COACH_QUESTION }) };
  const input: AskCoachInput = { question, locale: coachLocale(locale) };
  if (target.threadId !== null) input.threadId = target.threadId;
  else if (target.opportunityId) input.opportunityId = target.opportunityId;
  return { ok: true, input };
}

/** User questions asked in a thread so far. */
export function turnsUsed(thread: Pick<CoachThread, 'messages'>): number {
  return thread.messages.filter((message) => message.role === 'user').length;
}

/** Whether the thread has reached the per-conversation question limit. */
export function threadFull(thread: Pick<CoachThread, 'messages'>): boolean {
  return turnsUsed(thread) >= MAX_COACH_TURNS;
}

export type CoachRefusal = 'quota' | 'plan' | null;

/** A refusal an upgrade or a pack solves (shown with the plans prompt), else null. */
export function coachRefusal(error: unknown): CoachRefusal {
  if (!(error instanceof ApiError)) return null;
  if (error.code === 'quota_exhausted' || error.code === 'insufficient_balance') return 'quota';
  if (error.code === 'plan_upgrade_required' || error.code === 'UPGRADE_REQUIRED') return 'plan';
  return null;
}

export type CoachAction = 'load' | 'send' | 'delete';

const FALLBACK: Record<CoachAction, () => string> = {
  load: () => t('careerCoach.errors.load'),
  send: () => t('careerCoach.errors.send'),
  delete: () => t('careerCoach.errors.delete'),
};

/** What went wrong, in the current language. A failed send never claims a reply was charged. */
export function coachErrorMessage(error: unknown, action: CoachAction): string {
  if (error instanceof ApiError) {
    const reason = typeof error.body.reason === 'string' ? error.body.reason : null;
    if (error.code === 'provider_unavailable') return t('careerCoach.errors.provider');
    if (error.code === 'quota_exhausted' || error.code === 'insufficient_balance') return t('careerCoach.errors.quota');
    if (error.code === 'plan_upgrade_required' || error.code === 'UPGRADE_REQUIRED') return t('careerCoach.errors.plan');
    if (error.code === 'idempotency_mismatch') return t('careerCoach.errors.idempotency');
    if (error.code === 'not_found') return t('careerCoach.errors.notFound');
    if (error.code === 'validation_error') {
      if (reason === 'thread_limit') return t('careerCoach.errors.threadLimit', { max: MAX_COACH_THREADS });
      if (reason === 'turn_limit') return t('careerCoach.errors.turnLimit', { max: MAX_COACH_TURNS });
      if (error.body.field === 'question') return t('careerCoach.errors.tooShort');
      if (error.body.field === 'opportunityId') return t('careerCoach.errors.opportunity');
    }
  }
  return careerErrorMessage(error, FALLBACK[action]());
}

/** Whether the coach has any confirmed fact to ground its replies (it still answers without; it asks). */
export function hasConfirmedFacts(facts: readonly { confirmation: string }[] | undefined): boolean {
  return (facts ?? []).some((fact) => fact.confirmation === 'confirmed');
}

/** Suggested first questions for an empty conversation, in the current language. */
export function starterQuestions(): string[] {
  return [
    t('careerCoach.starters.nextStep'),
    t('careerCoach.starters.summary'),
    t('careerCoach.starters.interview'),
    t('careerCoach.starters.negotiate'),
  ];
}

export type MessageBlock = { kind: 'paragraph'; text: string } | { kind: 'bullet'; text: string };

const BULLET = /^\s*(?:[-*•]|\d+[.)])\s+/;

/**
 * Plain-text rendering of a message: paragraphs and simple bullet lines.
 * Nothing is interpreted as markup; blank lines separate paragraphs and
 * single line breaks inside a paragraph are kept.
 */
export function messageBlocks(content: string): MessageBlock[] {
  const blocks: MessageBlock[] = [];
  let paragraph: string[] = [];
  const flush = () => {
    if (paragraph.length > 0) blocks.push({ kind: 'paragraph', text: paragraph.join('\n') });
    paragraph = [];
  };
  for (const raw of content.replace(/\r\n?/g, '\n').split('\n')) {
    const line = raw.trimEnd();
    if (line.trim() === '') {
      flush();
    } else if (BULLET.test(line)) {
      flush();
      blocks.push({ kind: 'bullet', text: line.replace(BULLET, '').trim() });
    } else {
      paragraph.push(line.trim());
    }
  }
  flush();
  return blocks;
}

/** The conversation with the question being sent shown at the end (not yet saved). */
export function withPending(messages: readonly CoachMessage[], pending: string | null): CoachMessage[] {
  if (!pending) return [...messages];
  return [...messages, { id: 'pending', role: 'user', content: pending, createdAt: new Date(0).toISOString() }];
}
