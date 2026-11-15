import { describe, expect, it } from 'vitest';
import {
  MAX_COACH_QUESTION,
  MAX_COACH_REPLY,
  MAX_COACH_TITLE,
  cleanCoachReply,
  coachTitle,
  isCoachLocale,
  normalizeCoachQuestion,
} from './coaching';

describe('career coach limits', () => {
  it('accepts a trimmed question within the limits', () => {
    expect(normalizeCoachQuestion('  How do I ask for a raise?  ')).toBe('How do I ask for a raise?');
    expect(normalizeCoachQuestion('a')).toBeNull();
    expect(normalizeCoachQuestion('   ')).toBeNull();
    expect(normalizeCoachQuestion(42)).toBeNull();
    expect(normalizeCoachQuestion('x'.repeat(MAX_COACH_QUESTION))).toHaveLength(MAX_COACH_QUESTION);
    expect(normalizeCoachQuestion('x'.repeat(MAX_COACH_QUESTION + 1))).toBeNull();
  });

  it('titles a conversation from its first question', () => {
    expect(coachTitle('Should I\n  change   careers?')).toBe('Should I change careers?');
    const long = coachTitle('word '.repeat(40));
    expect(long.length).toBeLessThanOrEqual(MAX_COACH_TITLE);
    expect(long.endsWith('…')).toBe(true);
  });

  it('cleans a reply and cuts a long one at a word', () => {
    expect(cleanCoachReply('  Hello\r\n\r\n\r\n\r\nthere  ')).toBe('Hello\n\nthere');
    expect(cleanCoachReply('   ')).toBeNull();
    expect(cleanCoachReply(null)).toBeNull();
    const cut = cleanCoachReply('abcde '.repeat(2000))!;
    expect(cut.length).toBeLessThanOrEqual(MAX_COACH_REPLY + 1);
    expect(cut.endsWith('abcde…')).toBe(true);
  });

  it('knows the six app languages', () => {
    for (const locale of ['en', 'fr', 'de', 'es', 'ar', 'ur']) expect(isCoachLocale(locale)).toBe(true);
    expect(isCoachLocale('it')).toBe(false);
  });
});
