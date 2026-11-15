import { describe, expect, it } from 'vitest';
import { ApiError, type CoachThread } from '@flacroncv/career-api-client';
import {
  COACH_QUESTION_MAX,
  coachBlocks,
  coachLocale,
  coachNote,
  coachRemaining,
  questionReady,
  threadSummary,
  upsertThread,
} from './coach';

const refused = (code: string, extra: Record<string, unknown> = {}) => new ApiError(400, code, { code, ...extra });

describe('coach helpers', () => {
  it('splits a reply into paragraphs and lists without interpreting markup', () => {
    const blocks = coachBlocks('Start here.\nThen this.\n\n- Tailor your CV\n- Follow up\n\n1. Research\n2) Practise\n\n<b>not bold</b>');
    expect(blocks).toEqual([
      { kind: 'paragraph', lines: ['Start here.', 'Then this.'] },
      { kind: 'list', ordered: false, items: ['Tailor your CV', 'Follow up'] },
      { kind: 'list', ordered: true, items: ['Research', 'Practise'] },
      { kind: 'paragraph', lines: ['<b>not bold</b>'] },
    ]);
  });

  it('keeps a list that follows a paragraph line in the same chunk separate', () => {
    expect(coachBlocks('Try these:\r\n* One\r\n* Two')).toEqual([
      { kind: 'paragraph', lines: ['Try these:'] },
      { kind: 'list', ordered: false, items: ['One', 'Two'] },
    ]);
    expect(coachBlocks('  \n\n ')).toEqual([]);
  });

  it('adds the monthly allowance and packs, never below zero', () => {
    expect(coachRemaining({ includedRemaining: 3, packRemaining: 100, renewalDate: null })).toBe(103);
    expect(coachRemaining({ includedRemaining: -1, packRemaining: 0, renewalDate: null })).toBe(0);
  });

  it('accepts questions between the limits only', () => {
    expect(questionReady(' a ')).toBe(false);
    expect(questionReady('ok')).toBe(true);
    expect(questionReady('x'.repeat(COACH_QUESTION_MAX))).toBe(true);
    expect(questionReady('x'.repeat(COACH_QUESTION_MAX + 1))).toBe(false);
  });

  it('passes the interface language only when the coach supports it', () => {
    expect(coachLocale('ur')).toBe('ur');
    expect(coachLocale('pt')).toBeUndefined();
  });

  it('maps refusals to the right message', () => {
    expect(coachNote(refused('plan_upgrade_required'))).toBe('upgrade');
    expect(coachNote(refused('quota_exhausted'))).toBe('quota');
    expect(coachNote(refused('provider_unavailable'))).toBe('provider');
    expect(coachNote(refused('feature_unavailable'))).toBe('feature');
    expect(coachNote(refused('not_found'))).toBe('not_found');
    expect(coachNote(refused('validation_error', { reason: 'thread_limit' }))).toBe('thread_limit');
    expect(coachNote(refused('validation_error', { reason: 'turn_limit' }))).toBe('turn_limit');
    expect(coachNote(refused('validation_error', { field: 'question' }))).toBe('invalid');
    expect(coachNote(new Error('offline'))).toBe('failed');
  });

  it('moves the answered thread to the top of the list once', () => {
    const thread: CoachThread = {
      id: 't2',
      title: 'Offer',
      opportunityId: null,
      messageCount: 4,
      updatedAt: '2026-11-15T10:00:00.000Z',
      messages: [],
    };
    const older = { id: 't1', title: 'CV', opportunityId: null, messageCount: 2, updatedAt: '2026-11-14T10:00:00.000Z' };
    const stale = { ...threadSummary(thread), messageCount: 2 };
    expect(upsertThread([older, stale], threadSummary(thread))).toEqual([
      { id: 't2', title: 'Offer', opportunityId: null, messageCount: 4, updatedAt: '2026-11-15T10:00:00.000Z' },
      older,
    ]);
  });
});
