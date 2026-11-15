import { describe, expect, it } from 'vitest';
import { ApiError } from '../../../../../packages/career-api-client/src/client';
import type { CoachMessage } from '../../../../../packages/career-api-client/src/types';
import {
  MAX_COACH_QUESTION,
  MAX_COACH_TURNS,
  askInput,
  balanceLine,
  coachErrorMessage,
  coachLeft,
  coachLocale,
  coachRefusal,
  hasConfirmedFacts,
  messageBlocks,
  questionCounter,
  starterQuestions,
  threadFull,
  turnsUsed,
  withPending,
} from './coach';

const message = (role: CoachMessage['role'], content = 'x'): CoachMessage => ({
  id: `${role}-${Math.random()}`,
  role,
  content,
  createdAt: '2026-11-15T00:00:00.000Z',
});

describe('career coach view logic', () => {
  it('maps the app language to a reply language', () => {
    expect(coachLocale('ar')).toBe('ar');
    expect(coachLocale('fr-CA')).toBe('fr');
    expect(coachLocale('ur_PK')).toBe('ur');
    expect(coachLocale('ja')).toBe('en');
    expect(coachLocale(undefined)).toBe('en');
  });

  it('counts included and pack replies, never negative', () => {
    expect(coachLeft(undefined)).toBe(0);
    expect(coachLeft({ coaching: { includedRemaining: 3, packRemaining: 100, renewalDate: null } })).toBe(103);
    expect(coachLeft({ coaching: { includedRemaining: -1, packRemaining: 0, renewalDate: null } })).toBe(0);
    expect(balanceLine({ coaching: { includedRemaining: 5, packRemaining: 0, renewalDate: null } })).toMatch(/5/);
    expect(balanceLine({ coaching: { includedRemaining: 2, packRemaining: 40, renewalDate: null } })).toMatch(/40/);
  });

  it('builds a new-conversation request with the listing and language', () => {
    const result = askInput('  How do I follow up?  ', { threadId: null, opportunityId: 'opp-1' }, 'de');
    expect(result).toEqual({ ok: true, input: { question: 'How do I follow up?', locale: 'de', opportunityId: 'opp-1' } });
  });

  it('never sends a listing with a reply in an existing thread', () => {
    const result = askInput('Thanks, and then?', { threadId: 'thread-1' }, 'en');
    expect(result).toEqual({ ok: true, input: { question: 'Thanks, and then?', locale: 'en', threadId: 'thread-1' } });
  });

  it('refuses empty and over-long questions before sending', () => {
    expect(askInput(' ', { threadId: null, opportunityId: null }, 'en').ok).toBe(false);
    const long = askInput('a'.repeat(MAX_COACH_QUESTION + 1), { threadId: null, opportunityId: null }, 'en');
    expect(long.ok).toBe(false);
    if (!long.ok) expect(long.message).toContain(String(MAX_COACH_QUESTION));
    expect(questionCounter('abc')).toEqual({ used: 3, max: MAX_COACH_QUESTION, over: false });
    expect(questionCounter('a'.repeat(MAX_COACH_QUESTION + 1)).over).toBe(true);
  });

  it('counts questions per thread and stops at the limit', () => {
    const messages = Array.from({ length: MAX_COACH_TURNS }, () => [message('user'), message('assistant')]).flat();
    expect(turnsUsed({ messages })).toBe(MAX_COACH_TURNS);
    expect(threadFull({ messages })).toBe(true);
    expect(threadFull({ messages: messages.slice(2) })).toBe(false);
  });

  it('separates plan refusals from other errors', () => {
    expect(coachRefusal(new ApiError(402, 'quota_exhausted', { code: 'quota_exhausted' }))).toBe('quota');
    expect(coachRefusal(new ApiError(403, 'plan_upgrade_required', { code: 'plan_upgrade_required' }))).toBe('plan');
    expect(coachRefusal(new ApiError(503, 'provider_unavailable', { code: 'provider_unavailable' }))).toBeNull();
    expect(coachRefusal(new Error('x'))).toBeNull();
  });

  it('explains each refusal in plain words', () => {
    expect(coachErrorMessage(new ApiError(503, 'provider_unavailable', { code: 'provider_unavailable' }), 'send')).toMatch(/not charged/i);
    expect(coachErrorMessage(new ApiError(400, 'validation_error', { code: 'validation_error', reason: 'thread_limit' }), 'send')).toMatch(/50/);
    expect(coachErrorMessage(new ApiError(400, 'validation_error', { code: 'validation_error', reason: 'turn_limit' }), 'send')).toMatch(/40/);
    expect(coachErrorMessage(new ApiError(404, 'not_found', { code: 'not_found' }), 'load')).toMatch(/not found|deleted/i);
    expect(coachErrorMessage(new Error('boom'), 'delete')).toMatch(/delete/i);
  });

  it('knows when there are no confirmed facts to ground replies', () => {
    expect(hasConfirmedFacts(undefined)).toBe(false);
    expect(hasConfirmedFacts([{ confirmation: 'suggested' }])).toBe(false);
    expect(hasConfirmedFacts([{ confirmation: 'suggested' }, { confirmation: 'confirmed' }])).toBe(true);
  });

  it('offers translated starter questions', () => {
    const starters = starterQuestions();
    expect(starters).toHaveLength(4);
    for (const text of starters) expect(text).not.toContain('careerCoach');
  });

  it('renders messages as plain paragraphs and bullets', () => {
    expect(messageBlocks('Hello\nthere\n\n- one\n* two\n1. three\n\n<b>not markup</b>')).toEqual([
      { kind: 'paragraph', text: 'Hello\nthere' },
      { kind: 'bullet', text: 'one' },
      { kind: 'bullet', text: 'two' },
      { kind: 'bullet', text: 'three' },
      { kind: 'paragraph', text: '<b>not markup</b>' },
    ]);
    expect(messageBlocks('')).toEqual([]);
  });

  it('shows the question being sent at the end', () => {
    const base = [message('user', 'a'), message('assistant', 'b')];
    expect(withPending(base, null)).toHaveLength(2);
    const shown = withPending(base, 'next?');
    expect(shown).toHaveLength(3);
    expect(shown[2]).toMatchObject({ role: 'user', content: 'next?', id: 'pending' });
  });
});
