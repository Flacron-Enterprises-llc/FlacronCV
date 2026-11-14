import { describe, expect, it } from 'vitest';
import {
  checkStarResult,
  interviewFeedback,
  interviewQuestions,
  interviewReport,
  interviewSummary,
  isInterviewQuestionCount,
  numbersMissingFrom,
} from './interview';
import type { InterviewFeedback } from './interview';

const good: InterviewFeedback = { relevance: 'grounded', structure: 'clear', specificity: 'specific', evidence: 'cited' };
const weak: InterviewFeedback = { relevance: 'missing', structure: 'thin', specificity: 'general', evidence: 'unstated' };

describe('interview questions and stories', () => {
  it('asks from the confirmed line and drops a sentence the model wrote', () => {
    const questions = interviewQuestions({
      title: 'SQL analyst',
      stage: 'behavioral',
      facts: [{ id: 'fact-1', text: 'SQL' }],
      factIds: ['fact-1', 'missing'],
    });
    expect(questions).toHaveLength(10);
    expect(questions?.[0]?.prompt).toContain('SQL analyst');
    expect(questions?.[0]?.prompt).toContain('Confirmed line: SQL');
    expect(questions?.[0]?.factId).toBe('fact-1');
    expect(JSON.stringify(questions)).not.toContain('50 million');
    expect(JSON.stringify(questions)).not.toContain('hiring');
    expect(interviewQuestions({ title: 'SQL analyst', stage: 'behavioral', facts: [], factIds: [] })).toBeNull();
  });

  it('asks the number of questions the candidate chose, between three and ten', () => {
    const facts = [{ id: 'fact-1', text: 'SQL' }];
    expect(interviewQuestions({ title: 'Analyst', stage: 'recruiter', facts, count: 3 })).toHaveLength(3);
    expect(interviewQuestions({ title: 'Analyst', stage: 'recruiter', facts, count: 7 })?.map((q) => q.index)).toEqual([1, 2, 3, 4, 5, 6, 7]);
    // Out of range falls back to the full ten rather than inventing a count.
    expect(interviewQuestions({ title: 'Analyst', stage: 'recruiter', facts, count: 25 })).toHaveLength(10);
    expect(isInterviewQuestionCount(3)).toBe(true);
    expect(isInterviewQuestionCount(10)).toBe(true);
    expect(isInterviewQuestionCount(2)).toBe(false);
    expect(isInterviewQuestionCount(11)).toBe(false);
    expect(isInterviewQuestionCount(4.5)).toBe(false);
    expect(isInterviewQuestionCount('5')).toBe(false);
  });

  it('rejects a number the profile does not contain and labels the answer without a score', () => {
    expect(numbersMissingFrom('raised 50 million', 'SQL')).toEqual(['50']);
    expect(numbersMissingFrom('joined in 2020', 'Started 2020')).toEqual([]);
    const feedback = interviewFeedback('I used SQL.', 'SQL');
    expect(feedback).toEqual({ relevance: 'grounded', structure: 'thin', specificity: 'specific', evidence: 'cited' });
    expect(JSON.stringify(feedback)).not.toMatch(/\d/);
  });

  it('summarises strengths, gaps and the answers that lacked evidence', () => {
    expect(interviewSummary([], 5)).toBe('No answers yet.');
    const answers = [
      { index: 1, feedback: good },
      { index: 2, feedback: { ...good, evidence: 'unstated' as const, structure: 'thin' as const } },
      { index: 3, feedback: weak },
    ];
    const report = interviewReport(answers, 3);
    expect(report.complete).toBe(true);
    expect(report.lackingEvidence).toEqual([2, 3]);
    const byDimension = Object.fromEntries(report.dimensions.map((item) => [item.dimension, item]));
    expect(byDimension.relevance).toMatchObject({ met: 2, answered: 3, verdict: 'strength' });
    expect(byDimension.evidence).toMatchObject({ met: 1, answered: 3, verdict: 'gap' });
    expect(byDimension.structure.verdict).toBe('gap');
    const summary = interviewSummary(answers, 3);
    expect(summary).toContain('3 of 3 answered.');
    expect(summary).toContain('Strengths: relevance, specificity.');
    expect(summary).toContain('Work on: structure, evidence.');
    expect(summary).toContain('answer 2, 3');
    expect(summary).not.toMatch(/hiring|score/i);
    expect(interviewReport([{ index: 1, feedback: good }], 5).complete).toBe(false);
  });
});

describe('STAR result check', () => {
  const achievements = [
    { id: 'a1', text: 'Cut catalogue errors by 30% in one quarter' },
    { id: 'a2', text: 'Moved the archive index to PostgreSQL' },
  ];

  it('accepts a result taken from a confirmed achievement', () => {
    expect(checkStarResult('The catalogue errors were cut by 30% in one quarter.', achievements)).toEqual({ ok: true, achievementId: 'a1' });
    expect(checkStarResult('We moved the archive index to PostgreSQL.', achievements)).toEqual({ ok: true, achievementId: 'a2' });
  });

  it('refuses a result when nothing is confirmed, a number is new, or the outcome is named but absent', () => {
    expect(checkStarResult('Cut errors by 30%.', [])).toEqual({ ok: false, reason: 'no_confirmed_result' });
    expect(checkStarResult('Cut catalogue errors by 45% in one quarter.', achievements)).toEqual({ ok: false, reason: 'number_not_in_facts' });
    // A named outcome with no number: the old digit-only check let this through.
    expect(checkStarResult('Cut catalogue errors and won the Innovation Award.', achievements)).toEqual({ ok: false, reason: 'result_not_in_facts' });
    expect(checkStarResult('Catalogue errors were cut and I was promoted.', achievements)).toEqual({ ok: false, reason: 'result_not_in_facts' });
    expect(checkStarResult('Everyone loved the new dashboard design.', achievements)).toEqual({ ok: false, reason: 'result_not_in_facts' });
    expect(checkStarResult('Moved the archive index to PostgreSQL for Initech.', achievements)).toEqual({ ok: false, reason: 'result_not_in_facts' });
  });
});
