import { describe, expect, it } from 'vitest';
import { interviewFeedback, interviewQuestions, interviewSummary, numbersMissingFrom } from './interview';

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

  it('rejects a number the profile does not contain and labels the answer without a score', () => {
    expect(numbersMissingFrom('raised 50 million', 'SQL')).toEqual(['50']);
    expect(numbersMissingFrom('joined in 2020', 'Started 2020')).toEqual([]);
    const feedback = interviewFeedback('I used SQL.', 'SQL');
    expect(feedback).toEqual({ relevance: 'grounded', structure: 'thin', specificity: 'specific', evidence: 'cited' });
    expect(JSON.stringify(feedback)).not.toMatch(/\d/);
    const summary = interviewSummary(1, feedback);
    expect(summary).toContain('1 of 10');
    expect(summary).not.toContain('hiring');
    expect(interviewSummary(0, null)).toBe('No answers yet.');
  });
});