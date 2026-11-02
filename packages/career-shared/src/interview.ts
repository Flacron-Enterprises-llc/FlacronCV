export const INTERVIEW_STAGES = ['recruiter', 'behavioral', 'technical', 'panel', 'presentation'] as const;
export type InterviewStage = (typeof INTERVIEW_STAGES)[number];

export const MAX_INTERVIEW_QUESTIONS = 10;

export function isInterviewStage(value: string): value is InterviewStage {
  return (INTERVIEW_STAGES as readonly string[]).includes(value);
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
 * Ten questions. The model may only choose the order of confirmed fact ids.
 * Each prompt is one of these openings plus that fact's own line. A sentence
 * in the model reply is not used.
 */
export function interviewQuestions(input: {
  title: string;
  stage: InterviewStage;
  facts: Array<{ id: string; text: string }>;
  factIds?: string[];
}): InterviewQuestion[] | null {
  const usable = input.facts.filter((fact) => fact.text.trim().length > 0);
  const byId = new Map(usable.map((fact) => [fact.id, fact]));
  const ordered = (input.factIds ?? usable.map((fact) => fact.id))
    .map((id) => byId.get(id))
    .filter((fact): fact is { id: string; text: string } => fact !== undefined);
  if (ordered.length === 0) return null;
  const title = input.title.trim().length > 0 ? input.title.trim() : 'this role';
  return OPENINGS.map((opening, index) => {
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

export function interviewSummary(answered: number, latest: InterviewFeedback | null): string {
  if (answered <= 0 || !latest) return 'No answers yet.';
  const count = Math.min(answered, MAX_INTERVIEW_QUESTIONS);
  return `${count} of ${MAX_INTERVIEW_QUESTIONS} answered. Relevance ${latest.relevance}. Structure ${latest.structure}. Specificity ${latest.specificity}. Evidence ${latest.evidence}.`;
}
