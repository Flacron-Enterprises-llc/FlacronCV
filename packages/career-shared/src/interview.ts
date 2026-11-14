export const INTERVIEW_STAGES = ['recruiter', 'behavioral', 'technical', 'panel', 'presentation'] as const;
export type InterviewStage = (typeof INTERVIEW_STAGES)[number];

/** A session asks "up to ten" questions; the candidate picks how many (spec §28). */
export const MAX_INTERVIEW_QUESTIONS = 10;
export const MIN_INTERVIEW_QUESTIONS = 3;
/** Longest free-text target role for practice without a saved listing. */
export const MAX_INTERVIEW_ROLE = 120;

export function isInterviewStage(value: string): value is InterviewStage {
  return (INTERVIEW_STAGES as readonly string[]).includes(value);
}

/** True for a whole number of questions the candidate may choose. */
export function isInterviewQuestionCount(value: unknown): value is number {
  return (
    typeof value === 'number' &&
    Number.isInteger(value) &&
    value >= MIN_INTERVIEW_QUESTIONS &&
    value <= MAX_INTERVIEW_QUESTIONS
  );
}

export interface InterviewQuestion {
  index: number;
  factId: string;
  prompt: string;
}

export interface InterviewFeedback {
  relevance: 'grounded' | 'partial' | 'missing';
  structure: 'clear' | 'thin';
  specificity: 'specific' | 'general';
  evidence: 'cited' | 'unstated';
}

export const FEEDBACK_DIMENSIONS = ['relevance', 'structure', 'specificity', 'evidence'] as const;
export type FeedbackDimension = (typeof FEEDBACK_DIMENSIONS)[number];

const OPENINGS = [
  'Walk through this confirmed line for {title}.',
  'What did you do, using this confirmed line, for {title}?',
  'What was the situation around this confirmed line for {title}?',
  'What was your task, using this confirmed line, for {title}?',
  'What action did you take, using this confirmed line, for {title}?',
  'What outcome is already written in this confirmed line for {title}?',
  'How does this confirmed line fit the role {title}?',
  'What would you keep from this confirmed line for {title}?',
  'Which part of this confirmed line would you say first for {title}?',
  'What should the listener remember from this confirmed line for {title}?',
] as const;

/**
 * Up to ten questions (`count`, default ten). The model may only choose the
 * order of confirmed fact ids. Each prompt is one of these openings plus that
 * fact's own line. A sentence in the model reply is not used.
 */
export function interviewQuestions(input: {
  title: string;
  stage: InterviewStage;
  facts: Array<{ id: string; text: string }>;
  factIds?: string[];
  count?: number;
}): InterviewQuestion[] | null {
  const usable = input.facts.filter((fact) => fact.text.trim().length > 0);
  const byId = new Map(usable.map((fact) => [fact.id, fact]));
  const ordered = (input.factIds ?? usable.map((fact) => fact.id))
    .map((id) => byId.get(id))
    .filter((fact): fact is { id: string; text: string } => fact !== undefined);
  if (ordered.length === 0) return null;
  const count = isInterviewQuestionCount(input.count) ? input.count : MAX_INTERVIEW_QUESTIONS;
  const title = input.title.trim().length > 0 ? input.title.trim() : 'this role';
  return OPENINGS.slice(0, count).map((opening, index) => {
    const fact = ordered[index % ordered.length];
    return {
      index: index + 1,
      factId: fact.id,
      prompt: `${input.stage}: ${opening.replaceAll('{title}', title)} Confirmed line: ${fact.text.trim()}`,
    };
  });
}

/** Digit groups in `text` that do not appear in `allowed`, commas ignored. */
export function numbersMissingFrom(text: string, allowed: string): string[] {
  const haystack = allowed.replace(/,/g, '');
  const found = text.match(/\d[\d,]*/g) ?? [];
  const missing: string[] = [];
  for (const raw of found) {
    const digits = raw.replace(/,/g, '');
    if (digits.length === 0 || haystack.includes(digits) || missing.includes(digits)) continue;
    missing.push(digits);
  }
  return missing;
}

function tokens(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((token) => token.length >= 3);
}

/** Labels only. No number, and no claim the answer did not already make. */
export function interviewFeedback(answer: string, factText: string): InterviewFeedback {
  const answerFold = answer.toLowerCase();
  const factFold = factText.toLowerCase();
  const factTokens = tokens(factFold);
  const answerTokens = new Set(tokens(answerFold));
  const overlap = factTokens.filter((token) => answerTokens.has(token));
  const quotesFact = factFold.length > 0 && answerFold.includes(factFold);
  const relevance = quotesFact ? 'grounded' : overlap.length > 0 ? 'partial' : 'missing';
  const sentences = answer.split(/[.!?]/).filter((part) => part.trim().length > 0).length;
  const structure = answer.trim().length >= 40 || sentences >= 2 ? 'clear' : 'thin';
  const specificity = numbersMissingFrom(answer, factText).length === 0 && (quotesFact || overlap.length > 0) ? 'specific' : 'general';
  const evidence = quotesFact ? 'cited' : 'unstated';
  return { relevance, structure, specificity, evidence };
}

/** The label that counts as "met" on each rubric dimension. */
const MET: Record<FeedbackDimension, string> = {
  relevance: 'grounded',
  structure: 'clear',
  specificity: 'specific',
  evidence: 'cited',
};

export interface InterviewDimensionResult {
  dimension: FeedbackDimension;
  /** Answers that met this dimension. */
  met: number;
  answered: number;
  /** Strength when more than half of the answers met it; otherwise a gap. */
  verdict: 'strength' | 'gap';
}

export interface InterviewReport {
  answered: number;
  total: number;
  complete: boolean;
  dimensions: InterviewDimensionResult[];
  /** Question numbers whose answer did not cite the confirmed line. */
  lackingEvidence: number[];
}

/**
 * End-of-session report built only from the stored labels: counts per rubric
 * dimension and which answers lacked evidence. No score, no prediction.
 */
export function interviewReport(answers: Array<{ index: number; feedback: InterviewFeedback }>, total: number): InterviewReport {
  const answered = answers.length;
  const dimensions = FEEDBACK_DIMENSIONS.map((dimension): InterviewDimensionResult => {
    const met = answers.filter((answer) => answer.feedback[dimension] === MET[dimension]).length;
    return { dimension, met, answered, verdict: answered > 0 && met * 2 > answered ? 'strength' : 'gap' };
  });
  return {
    answered,
    total,
    complete: total > 0 && answered >= total,
    dimensions: answered > 0 ? dimensions : [],
    lackingEvidence: answers.filter((answer) => answer.feedback.evidence !== 'cited').map((answer) => answer.index),
  };
}

/** Plain-English summary stored with the session (exports and older clients read it). */
export function interviewSummary(answers: Array<{ index: number; feedback: InterviewFeedback }>, total: number = MAX_INTERVIEW_QUESTIONS): string {
  if (answers.length === 0) return 'No answers yet.';
  const report = interviewReport(answers, total);
  const named = (verdict: 'strength' | 'gap') =>
    report.dimensions.filter((item) => item.verdict === verdict).map((item) => item.dimension);
  const strengths = named('strength');
  const gaps = named('gap');
  const parts = [`${Math.min(report.answered, total)} of ${total} answered.`];
  parts.push(strengths.length > 0 ? `Strengths: ${strengths.join(', ')}.` : 'Strengths: none yet.');
  parts.push(gaps.length > 0 ? `Work on: ${gaps.join(', ')}.` : 'Work on: nothing flagged.');
  if (report.lackingEvidence.length > 0) parts.push(`No confirmed evidence cited in answer ${report.lackingEvidence.join(', ')}.`);
  return parts.join(' ');
}

// Words that carry no claim on their own. A STAR result may use them freely.
const RESULT_STOPWORDS = new Set([
  'the', 'and', 'for', 'with', 'that', 'this', 'from', 'into', 'onto', 'over', 'were', 'was', 'are', 'our', 'their',
  'which', 'what', 'when', 'where', 'while', 'then', 'than', 'also', 'more', 'most', 'some', 'each', 'very', 'they',
  'them', 'there', 'these', 'those', 'have', 'had', 'has', 'been', 'being', 'will', 'would', 'could', 'should',
  'result', 'results', 'resulted', 'outcome', 'meant', 'means', 'made', 'make', 'helped', 'help', 'team', 'work',
  'worked', 'able', 'after', 'before', 'about', 'because', 'during', 'through', 'other', 'such', 'its', 'his', 'her',
  'all', 'any', 'not', 'but', 'one', 'out', 'who', 'how', 'can', 'did', 'got', 'per', 'via', 'your', 'you', 'my',
]);

// Words that state an outcome. Any of them in a result must already be in the
// matched confirmed achievement, so a story cannot add an award or promotion.
const OUTCOME_WORDS = new Set([
  'award', 'awarded', 'awards', 'won', 'win', 'prize', 'promoted', 'promotion', 'record', 'patent', 'patented',
  'doubled', 'tripled', 'halved', 'increased', 'decreased', 'reduced', 'grew', 'growth', 'saved', 'savings',
  'revenue', 'profit', 'launched', 'certified', 'recognised', 'recognized', 'ranked', 'top', 'best', 'first',
  'million', 'billion', 'thousand', 'percent', 'zero',
]);

function words(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter((word) => word.length >= 3 && !/^\d+$/.test(word));
}

export type StarResultCheck =
  | { ok: true; achievementId: string }
  | { ok: false; reason: 'no_confirmed_result' | 'number_not_in_facts' | 'result_not_in_facts' };

/**
 * A STAR "result" is a claim, so it must come from a confirmed achievement
 * (spec §28: a saved story cannot introduce a result absent from the account).
 * Conservative on purpose: most of the result's words must be in one confirmed
 * achievement, any number must be there too, and any outcome word or name
 * (capitalised word after the first) that is not in that achievement refuses it.
 */
export function checkStarResult(result: string, achievements: Array<{ id: string; text: string }>): StarResultCheck {
  const usable = achievements.filter((item) => item.text.trim().length > 0);
  if (usable.length === 0) return { ok: false, reason: 'no_confirmed_result' };
  const resultWords = words(result).filter((word) => !RESULT_STOPWORDS.has(word));
  let best: { id: string; text: string; overlap: number } | null = null;
  for (const item of usable) {
    const known = new Set(words(item.text));
    const overlap = resultWords.filter((word) => known.has(word)).length;
    if (!best || overlap > best.overlap) best = { ...item, overlap };
  }
  if (!best) return { ok: false, reason: 'result_not_in_facts' };
  if (numbersMissingFrom(result, best.text).length > 0) return { ok: false, reason: 'number_not_in_facts' };
  if (resultWords.length === 0 || best.overlap * 5 < resultWords.length * 3) return { ok: false, reason: 'result_not_in_facts' };
  const known = new Set(words(best.text));
  if (resultWords.some((word) => OUTCOME_WORDS.has(word) && !known.has(word))) {
    return { ok: false, reason: 'result_not_in_facts' };
  }
  // A capitalised word that is not the first of its sentence is a name: an
  // employer, client, award or product. Names must be in the achievement.
  const sentences = result.split(/[.!?]\s+/);
  for (const sentence of sentences) {
    const raw = sentence.trim().split(/\s+/).slice(1);
    for (const token of raw) {
      const clean = token.replace(/[^\p{L}\p{N}]/gu, '');
      if (clean.length >= 2 && /^\p{Lu}/u.test(clean) && !known.has(clean.toLowerCase())) {
        return { ok: false, reason: 'result_not_in_facts' };
      }
    }
  }
  return { ok: true, achievementId: best.id };
}
