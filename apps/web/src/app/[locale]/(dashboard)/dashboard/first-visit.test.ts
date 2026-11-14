import { describe, expect, it } from 'vitest';
import type { User } from '@flacroncv/shared-types';
import { isFirstVisit } from './first-visit';

const NOW = Date.parse('2026-11-14T12:00:00Z');

function user(createdAt: unknown, appTour?: unknown): Pick<User, 'createdAt' | 'preferences'> {
  return {
    createdAt: createdAt as Date,
    preferences: (appTour ? { appTour } : {}) as User['preferences'],
  };
}

describe('isFirstVisit', () => {
  it('is true for an account created within the last day', () => {
    expect(isFirstVisit(user(new Date(NOW - 60 * 60 * 1000)), NOW)).toBe(true);
    // Firestore timestamps reach the client serialised, not as a Date.
    expect(isFirstVisit(user({ _seconds: (NOW - 3600_000) / 1000, _nanoseconds: 0 }), NOW)).toBe(true);
  });

  it('is false for an older account, even one that never saw the tour', () => {
    expect(isFirstVisit(user(new Date(NOW - 3 * 24 * 3600_000)), NOW)).toBe(false);
  });

  it('falls back to the tour record when the creation date is unknown', () => {
    expect(isFirstVisit(user(null), NOW)).toBe(true);
    expect(isFirstVisit(user(null, { status: 'completed' }), NOW)).toBe(false);
  });

  it('is false with no user', () => {
    expect(isFirstVisit(null, NOW)).toBe(false);
  });
});
