import { describe, expect, it } from 'vitest';
import type { InterviewFeedback, InterviewSession } from '../../../../../packages/career-api-client/src/types';
import { reportLines, sessionReport, storyPrefill } from './interviews';

const good: InterviewFeedback = { relevance: 'grounded', structure: 'clear', specificity: 'specific', evidence: 'cited' };
const weak: InterviewFeedback = { relevance: 'grounded', structure: 'thin', specificity: 'general', evidence: 'unstated' };

/** Questions are numbered from 1, as the career server numbers them. */
function session(feedbacks: InterviewFeedback[], total = 3): InterviewSession {
  return {
    id: 's1',
    opportunityId: null,
    opportunityRevisionId: null,
    stage: 'behavioral',
    title: 'Data analyst',
    questions: Array.from({ length: total }, (_, i) => ({ index: i + 1, factId: `fact-${i + 1}`, prompt: `Question ${i + 1}` })),
    answers: feedbacks.map((feedback, i) => ({ id: `a${i + 1}`, index: i + 1, answer: `My answer ${i + 1}`, feedback, challenge: null })),
    summary: '',
    createdAt: '2026-11-01T00:00:00.000Z',
  };
}

describe('sessionReport', () => {
  it('rebuilds the report from the labels when the server sent none (older sessions)', () => {
    const report = sessionReport(session([good, weak, weak]));
    expect(report.complete).toBe(true);
    expect(report.lackingEvidence).toEqual([2, 3]);
    const byDimension = Object.fromEntries(report.dimensions.map((item) => [item.dimension, item.verdict]));
    expect(byDimension).toEqual({ relevance: 'strength', structure: 'gap', specificity: 'gap', evidence: 'gap' });
  });

  it("uses the server's report when present", () => {
    const withReport = { ...session([good]), report: { answered: 1, total: 3, complete: false, dimensions: [], lackingEvidence: [9] } };
    expect(sessionReport(withReport).lackingEvidence).toEqual([9]);
  });
});

describe('reportLines', () => {
  it('words strengths, gaps and missing evidence without a score', () => {
    const lines = reportLines(sessionReport(session([good, weak, weak])));
    expect(lines.strengths).toEqual(['Relevance: met in 3 of 3 answers']);
    expect(lines.gaps).toContain('Evidence: met in 1 of 3 answers');
    expect(lines.evidence).toBe('Answers 2, 3 did not cite confirmed evidence.');
    expect(JSON.stringify(lines)).not.toMatch(/score|probability|%/i);
  });

  it('says so when every answer cited evidence, and uses the singular for one', () => {
    expect(reportLines(sessionReport(session([good, good, good]))).evidence).toBe('Every answer cited confirmed evidence.');
    expect(reportLines(sessionReport(session([good, weak, good]))).evidence).toBe('Answer 2 did not cite confirmed evidence.');
  });
});

describe('storyPrefill', () => {
  it('starts a STAR story from the answer only: action = own words, the question fact, empty result', () => {
    const prefill = storyPrefill(session([good, weak]), 'a2');
    expect(prefill).toEqual({
      draft: { situation: '', task: '', action: 'My answer 2', result: '' },
      factIds: ['fact-2'],
      index: 2,
    });
  });

  it('returns null for an answer that is not in the session, and keeps within the story limit', () => {
    expect(storyPrefill(session([good]), 'nope')).toBeNull();
    const long = session([good]);
    long.answers[0] = { ...long.answers[0], answer: 'x'.repeat(5000) };
    expect(storyPrefill(long, 'a1')?.draft.action).toHaveLength(2000);
  });
});
