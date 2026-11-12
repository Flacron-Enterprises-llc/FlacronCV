import { describe, expect, it } from 'vitest';
import type { AppTourPreference } from '../types/user.types';
import {
  isAutoStartEligible,
  isDashboardHome,
  MOBILE_APP_TOUR_VERSION,
  MOBILE_TOUR_STEPS,
  newerTourRecord,
  nextTourRecord,
  progressLabel,
  resumeIndex,
  selectMobileTourSteps,
  startIndex,
  stepTitle,
  tourPreferencePatch,
} from './app-tour';

const NOW = '2026-11-13T12:00:00.000Z';

function rec(status: AppTourPreference['status'], extra: Partial<AppTourPreference> = {}): AppTourPreference {
  return {
    version: 1,
    status,
    stepId: null,
    completedAt: null,
    skippedAt: null,
    updatedAt: null,
    ...extra,
  };
}

describe('mobile tour steps', () => {
  it('uses ids the API accepts (lowercase, digits, hyphen, <= 64)', () => {
    for (const step of MOBILE_TOUR_STEPS) {
      expect(step.id).toMatch(/^[a-z0-9-]{1,64}$/);
      expect(step.route.startsWith('/(dashboard)')).toBe(true);
      expect(step.title.length).toBeGreaterThan(0);
      expect(step.body.length).toBeGreaterThan(0);
    }
    expect(new Set(MOBILE_TOUR_STEPS.map((s) => s.id)).size).toBe(MOBILE_TOUR_STEPS.length);
  });

  it('covers dashboard, CVs, cover letters, jobs, templates and settings; career only with the flag', () => {
    const off = selectMobileTourSteps({ careerEnabled: false }).map((s) => s.id);
    expect(off).toEqual(['welcome', 'usage', 'cvs', 'cover-letters', 'jobs', 'templates', 'settings']);
    const on = selectMobileTourSteps({ careerEnabled: true }).map((s) => s.id);
    expect(on).toEqual(['welcome', 'usage', 'cvs', 'cover-letters', 'jobs', 'templates', 'career', 'settings']);
    expect(selectMobileTourSteps({ careerEnabled: true }).find((s) => s.id === 'career')?.route).toBe(
      '/(dashboard)/career',
    );
  });

  it('ends on the replay hint, like the website', () => {
    const steps = selectMobileTourSteps({ careerEnabled: false });
    expect(steps[steps.length - 1].id).toBe('settings');
    expect(steps[steps.length - 1].body).toContain('Replay App Tour');
  });

  it('greets by first name, never by an email', () => {
    const welcome = MOBILE_TOUR_STEPS[0];
    expect(stepTitle(welcome, 'Ada')).toBe('Welcome, Ada');
    expect(stepTitle(welcome, '  ')).toBe('Welcome to FlacronCV');
    expect(stepTitle(welcome, 'a@b.com')).toBe('Welcome to FlacronCV');
    expect(stepTitle(welcome, null)).toBe('Welcome to FlacronCV');
    expect(stepTitle(MOBILE_TOUR_STEPS[2], 'Ada')).toBe('My CVs');
    expect(progressLabel(0, 7)).toBe('Step 1 of 7');
  });
});

describe('isAutoStartEligible', () => {
  const base = { role: 'user', emailVerified: true, degraded: false };

  it('starts only for unseen or in-progress records', () => {
    expect(isAutoStartEligible({ ...base, tour: rec('unseen') })).toBe(true);
    expect(isAutoStartEligible({ ...base, tour: rec('in_progress', { stepId: 'jobs' }) })).toBe(true);
    expect(isAutoStartEligible({ ...base, tour: rec('completed') })).toBe(false);
    expect(isAutoStartEligible({ ...base, tour: rec('skipped') })).toBe(false);
  });

  it('never starts for an existing account without the field', () => {
    expect(isAutoStartEligible({ ...base, tour: undefined })).toBe(false);
    expect(isAutoStartEligible({ ...base, tour: null })).toBe(false);
  });

  it('never starts for staff, unverified or degraded sessions', () => {
    expect(isAutoStartEligible({ ...base, role: 'admin', tour: rec('unseen') })).toBe(false);
    expect(isAutoStartEligible({ ...base, role: 'super_admin', tour: rec('unseen') })).toBe(false);
    expect(isAutoStartEligible({ ...base, emailVerified: false, tour: rec('unseen') })).toBe(false);
    expect(isAutoStartEligible({ ...base, degraded: true, tour: rec('unseen') })).toBe(false);
  });
});

describe('resume', () => {
  const steps = selectMobileTourSteps({ careerEnabled: false });

  it('resumes an in-progress tour at its step; otherwise from the start', () => {
    expect(startIndex(steps, rec('in_progress', { stepId: 'jobs' }), false)).toBe(4);
    expect(startIndex(steps, rec('in_progress', { stepId: 'jobs' }), true)).toBe(0);
    expect(startIndex(steps, rec('unseen'), false)).toBe(0);
    expect(startIndex(steps, undefined, false)).toBe(0);
  });

  it('falls back to the first step for an unknown or web-only step id', () => {
    expect(resumeIndex(steps, 'editor-ats')).toBe(0);
    expect(resumeIndex(steps, 'career')).toBe(0); // career step absent when the flag is off
    expect(resumeIndex(steps, null)).toBe(0);
  });

  it('prefers the newer of the session and stored records', () => {
    const stored = rec('unseen');
    const session = rec('completed', { updatedAt: NOW, completedAt: NOW });
    expect(newerTourRecord(session, stored)).toBe(session);
    expect(newerTourRecord(undefined, stored)).toBe(stored);
    expect(newerTourRecord(session, undefined)).toBe(session);
    expect(newerTourRecord(undefined, undefined)).toBeUndefined();
    const newerServer = rec('skipped', { updatedAt: '2026-11-14T00:00:00.000Z' });
    expect(newerTourRecord(session, newerServer)).toBe(newerServer);
  });
});

describe('nextTourRecord', () => {
  it('moves an unseen record to in-progress with the step id', () => {
    expect(nextTourRecord(rec('unseen'), 'progress', 'welcome', false, NOW)).toEqual({
      version: 1,
      status: 'in_progress',
      stepId: 'welcome',
      completedAt: null,
      skippedAt: null,
      updatedAt: NOW,
    });
  });

  it('skips and completes with timestamps and no step', () => {
    expect(nextTourRecord(rec('in_progress', { stepId: 'cvs' }), 'skip', null, false, NOW)).toEqual({
      version: 1,
      status: 'skipped',
      stepId: null,
      completedAt: null,
      skippedAt: NOW,
      updatedAt: NOW,
    });
    expect(nextTourRecord(rec('in_progress', { stepId: 'cvs' }), 'complete', null, false, NOW)).toEqual({
      version: 1,
      status: 'completed',
      stepId: null,
      completedAt: NOW,
      skippedAt: null,
      updatedAt: NOW,
    });
  });

  it('a replay never revives a completed, skipped or missing record', () => {
    for (const current of [rec('completed'), rec('skipped'), undefined]) {
      expect(nextTourRecord(current, 'progress', 'cvs', true, NOW)).toBeNull();
      expect(nextTourRecord(current, 'skip', null, true, NOW)).toBeNull();
      expect(nextTourRecord(current, 'progress', 'cvs', false, NOW)).toBeNull();
    }
  });

  it('finishing a replay records completion (keeps an earlier skip time)', () => {
    const skipped = rec('skipped', { skippedAt: '2026-11-01T00:00:00.000Z' });
    expect(nextTourRecord(skipped, 'complete', null, true, NOW)).toMatchObject({
      status: 'completed',
      completedAt: NOW,
      skippedAt: '2026-11-01T00:00:00.000Z',
    });
    expect(nextTourRecord(undefined, 'complete', null, true, NOW)).toMatchObject({
      version: MOBILE_APP_TOUR_VERSION,
      status: 'completed',
    });
  });

  it('keeps the stored version', () => {
    expect(nextTourRecord(rec('unseen', { version: 3 }), 'progress', 'jobs', false, NOW)?.version).toBe(3);
  });
});

describe('tourPreferencePatch', () => {
  it('writes only the mobile record, never the website appTour', () => {
    const body = tourPreferencePatch(rec('completed', { completedAt: NOW, updatedAt: NOW }));
    expect(Object.keys(body)).toEqual(['mobileAppTour']);
    expect('appTour' in body).toBe(false);
  });
});

describe('isDashboardHome', () => {
  it('matches only the dashboard tab root', () => {
    expect(isDashboardHome(['(dashboard)'])).toBe(true);
    expect(isDashboardHome(['(dashboard)', 'index'])).toBe(true);
    expect(isDashboardHome(['(dashboard)', 'cvs'])).toBe(false);
    expect(isDashboardHome(['(dashboard)', 'settings', 'billing'])).toBe(false);
    expect(isDashboardHome(['(auth)', 'login'])).toBe(false);
    expect(isDashboardHome([])).toBe(false);
  });
});
