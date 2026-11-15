/**
 * Career coach (spec section 26, "AI career copilot / coaching responses").
 * Each assistant reply spends one `coaching_response`. These limits are
 * shared by the server, the web app and the mobile app.
 */

/** Longest question, in characters, after trimming. */
export const MAX_COACH_QUESTION = 2000;
/** Shortest question, in characters, after trimming. */
export const MIN_COACH_QUESTION = 2;
/** Conversations a person may keep; they delete old ones to start more. */
export const MAX_COACH_THREADS = 50;
/** Questions in one conversation. */
export const MAX_COACH_TURNS = 40;
/** Earlier messages sent to the model with each new question. */
export const COACH_HISTORY_MESSAGES = 10;
/** Longest stored reply, in characters. A longer reply is cut at a word boundary. */
export const MAX_COACH_REPLY = 6000;
/** Longest conversation title, in characters (taken from the first question). */
export const MAX_COACH_TITLE = 80;

export const COACH_LOCALES = ['en', 'fr', 'de', 'es', 'ar', 'ur'] as const;
export type CoachLocale = (typeof COACH_LOCALES)[number];

export function isCoachLocale(value: unknown): value is CoachLocale {
  return typeof value === 'string' && (COACH_LOCALES as readonly string[]).includes(value);
}

/** The question as stored, or null when it is too short or too long. */
export function normalizeCoachQuestion(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const text = value.replace(/\r\n/g, '\n').trim();
  if (text.length < MIN_COACH_QUESTION || text.length > MAX_COACH_QUESTION) return null;
  return text;
}

/** First line of the first question, collapsed and cut to MAX_COACH_TITLE. */
export function coachTitle(question: string): string {
  const oneLine = question.replace(/\s+/g, ' ').trim();
  if (oneLine.length <= MAX_COACH_TITLE) return oneLine;
  return `${oneLine.slice(0, MAX_COACH_TITLE - 1).trimEnd()}…`;
}

/**
 * The model's reply as stored: line endings normalised, outer space trimmed,
 * runs of blank lines collapsed, and cut at a word boundary when longer than
 * MAX_COACH_REPLY. Null when nothing usable is left.
 */
export function cleanCoachReply(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  let text = value.replace(/\r\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
  if (text.length === 0) return null;
  if (text.length > MAX_COACH_REPLY) {
    const cut = text.slice(0, MAX_COACH_REPLY);
    const space = cut.lastIndexOf(' ');
    text = `${(space > MAX_COACH_REPLY * 0.8 ? cut.slice(0, space) : cut).trimEnd()}…`;
  }
  return text;
}
