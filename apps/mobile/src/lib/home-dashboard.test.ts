import { describe, expect, it } from 'vitest';
import { documentStats, greetingKey, greetingName, isFirstVisit, jobPipelineCounts } from './home-dashboard';

const NOW = Date.parse('2026-11-14T12:00:00.000Z');

describe('home greeting (website first-visit.ts)', () => {
  it('greets an account created within the last day as a first visit', () => {
    expect(isFirstVisit({ createdAt: '2026-11-14T08:00:00.000Z' }, NOW)).toBe(true);
    expect(isFirstVisit({ createdAt: { _seconds: Date.parse('2026-11-14T08:00:00.000Z') / 1000 } }, NOW)).toBe(true);
    expect(isFirstVisit({ createdAt: '2026-11-01T08:00:00.000Z' }, NOW)).toBe(false);
  });

  it('falls back to the tours only when the creation date is unknown', () => {
    expect(isFirstVisit({ preferences: {} }, NOW)).toBe(true);
    expect(isFirstVisit({ preferences: { mobileAppTour: { status: 'completed' } } }, NOW)).toBe(false);
    expect(isFirstVisit({ preferences: { appTour: { status: 'skipped' } } }, NOW)).toBe(false);
    expect(isFirstVisit(null, NOW)).toBe(false);
  });

  it('picks the greeting and the first name', () => {
    expect(greetingKey(true, true)).toBe('firstNamed');
    expect(greetingKey(true, false)).toBe('first');
    expect(greetingKey(false, true)).toBe('named');
    expect(greetingKey(false, false)).toBe('plain');
    expect(greetingName({ profile: { firstName: ' Ada ' }, displayName: 'Ada Lovelace' })).toBe('Ada');
    expect(greetingName({ profile: { firstName: '' }, displayName: 'Grace Hopper' })).toBe('Grace');
    expect(greetingName(null)).toBe('');
  });
});

describe('home stats', () => {
  it('current plans show stored documents against capacity', () => {
    expect(documentStats('starter', { storedCvs: 3, cvsCreated: 7, storedCoverLetters: 1, coverLettersCreated: 4 })).toEqual({
      cvs: { used: 3, limit: 5 },
      coverLetters: { used: 1, limit: 5 },
    });
  });

  it('legacy plans show creations this month; unlimited has no limit', () => {
    expect(documentStats('pro', { storedCvs: 3, cvsCreated: 7, coverLettersCreated: 2 })).toEqual({
      cvs: { used: 7, limit: 10 },
      coverLetters: { used: 2, limit: 20 },
    });
    expect(documentStats('enterprise', { cvsCreated: 1 }).cvs.limit).toBeNull();
  });

  it('an older API without stored counts falls back to the creation counters', () => {
    expect(documentStats('free', { cvsCreated: 1 }).cvs).toEqual({ used: 1, limit: 1 });
    expect(documentStats('free', undefined).cvs).toEqual({ used: 0, limit: 1 });
  });

  it('counts active applications per stage', () => {
    const summary = jobPipelineCounts([
      { status: 'saved' },
      { status: 'applied' },
      { status: 'applied' },
      { status: 'offered', archived: true },
      { status: 'rejected' },
    ]);
    expect(summary.active).toBe(4);
    expect(summary.counts).toEqual({ saved: 1, applied: 2, interviewing: 0, offered: 0 });
    expect(jobPipelineCounts(undefined).active).toBe(0);
  });
});
