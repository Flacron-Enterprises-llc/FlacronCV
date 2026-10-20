import { describe, expect, it } from 'vitest';
import { APP_TOUR_VERSION, AppTourPreference } from '@flacroncv/shared-types';
import {
  effectiveResumeStepId,
  isAutoStartEligible,
  nextTourRecord,
  pathsMatch,
  placeTooltip,
  readTourCache,
  resumeIndex,
  resolveTourCvId,
  selectTourSteps,
  stepRoute,
  tourCacheKey,
  writeTourCache,
  findVisibleTourTarget,
  findLaidOutTourTarget,
  TOUR_STEPS,
} from './app-tour';

const NOW = '2026-10-20T12:00:00.000Z';

function tour(status: AppTourPreference['status'], extra: Partial<AppTourPreference> = {}): AppTourPreference {
  return {
    version: APP_TOUR_VERSION,
    status,
    stepId: null,
    completedAt: null,
    skippedAt: null,
    updatedAt: null,
    ...extra,
  };
}

const base = {
  role: 'user',
  emailVerified: true,
  placeholderAccount: false,
  degraded: false,
};

describe('app tour eligibility', () => {
  it('starts automatically only for a verified end user with unseen or in-progress state', () => {
    expect(isAutoStartEligible({ ...base, appTour: tour('unseen') })).toBe(true);
    expect(isAutoStartEligible({ ...base, appTour: tour('in_progress', { stepId: 'jobs' }) })).toBe(true);
  });

  it('does not treat a missing record as a new account', () => {
    expect(isAutoStartEligible({ ...base, appTour: undefined })).toBe(false);
    expect(isAutoStartEligible({ ...base, appTour: null })).toBe(false);
  });

  it('does not auto-start after skip or completion, regardless of tour version', () => {
    expect(isAutoStartEligible({ ...base, appTour: tour('completed', { version: 99 }) })).toBe(false);
    expect(isAutoStartEligible({ ...base, appTour: tour('skipped', { version: 1 }) })).toBe(false);
    expect(isAutoStartEligible({ ...base, appTour: tour('completed', { version: APP_TOUR_VERSION + 5 }) })).toBe(false);
  });

  it('does not auto-start staff, unverified, placeholder, or degraded sessions', () => {
    expect(isAutoStartEligible({ ...base, role: 'admin', appTour: tour('unseen') })).toBe(false);
    expect(isAutoStartEligible({ ...base, role: 'super_admin', appTour: tour('unseen') })).toBe(false);
    expect(isAutoStartEligible({ ...base, emailVerified: false, appTour: tour('unseen') })).toBe(false);
    expect(isAutoStartEligible({ ...base, placeholderAccount: true, appTour: tour('unseen') })).toBe(false);
    expect(isAutoStartEligible({ ...base, degraded: true, appTour: tour('unseen') })).toBe(false);
  });
});

describe('app tour steps', () => {
  it('uses one end-user sequence and adds editor steps only when a CV already exists', () => {
    const empty = selectTourSteps({ role: 'user', hasCv: false }).map((step) => step.id);
    const withCv = selectTourSteps({ role: 'user', hasCv: true }).map((step) => step.id);
    const staff = selectTourSteps({ role: 'admin', hasCv: true }).map((step) => step.id);

    expect(empty).toEqual([
      'welcome',
      'usage',
      'create-cv',
      'my-cvs',
      'cover-letters',
      'jobs',
      'templates',
      'settings',
    ]);
    expect(withCv).toContain('editor-ai');
    expect(withCv).toContain('editor-export');
    expect(withCv).not.toContain('admin');
    expect(staff).toEqual(withCv);
    expect(new Set(TOUR_STEPS.map((step) => step.target)).size).toBe(TOUR_STEPS.length);
  });

  it('resumes a known step and falls back to the start when that step is gone', () => {
    const steps = selectTourSteps({ hasCv: false });
    expect(resumeIndex(steps, 'jobs')).toBe(steps.findIndex((step) => step.id === 'jobs'));
    expect(resumeIndex(steps, 'editor-ai')).toBe(0);
    expect(resumeIndex(steps, null)).toBe(0);
  });

  it('follows an openable CV and ignores a counter that disagrees with the documents', () => {
    expect(resolveTourCvId([{ id: 'cv-1' }], 'cv-1')).toBe('cv-1');
    expect(resolveTourCvId([], 'cv-1')).toBeNull();
    expect(resolveTourCvId(null, 'cv-1')).toBeNull();
    expect(resolveTourCvId([{ id: 'cv-1' }], null)).toBeNull();
    expect(resolveTourCvId([{ id: 'cv-1' }], 'deleted')).toBeNull();
    expect(selectTourSteps({ hasCv: false }).some((step) => step.requiresCv)).toBe(false);
    expect(selectTourSteps({ hasCv: true }).some((step) => step.id === 'editor-sections')).toBe(true);
  });

  it('opens an existing CV id and does not invent a route without one', () => {
    const editor = selectTourSteps({ hasCv: true }).find((step) => step.id === 'editor-sections')!;
    expect(stepRoute(editor, 'cv-1')).toBe('/cv/cv-1');
    expect(stepRoute(editor, null)).toBeNull();
    expect(pathsMatch('/cv/cv-1/', '/cv/cv-1')).toBe(true);
    expect(pathsMatch('/cv', '/cv/cv-1')).toBe(false);
  });
});

describe('app tour persistence', () => {
  it('records progress, skip, and completion for a first-run account', () => {
    const progress = nextTourRecord(tour('unseen'), 'progress', 'welcome', false, NOW);
    expect(progress).toMatchObject({ status: 'in_progress', stepId: 'welcome', updatedAt: NOW });

    const skipped = nextTourRecord(progress, 'skip', null, false, NOW);
    expect(skipped).toMatchObject({ status: 'skipped', skippedAt: NOW, stepId: null });

    const done = nextTourRecord(tour('in_progress', { stepId: 'jobs' }), 'complete', null, false, NOW);
    expect(done).toMatchObject({ status: 'completed', completedAt: NOW, stepId: null });
  });

  it('does not let a replay of a finished or legacy account become in-progress again', () => {
    expect(nextTourRecord(tour('completed'), 'progress', 'welcome', true, NOW)).toBeNull();
    expect(nextTourRecord(tour('skipped'), 'skip', null, true, NOW)).toBeNull();
    expect(nextTourRecord(tour('completed'), 'skip', null, true, NOW)).toBeNull();
    expect(nextTourRecord(null, 'progress', 'welcome', true, NOW)).toBeNull();
    expect(nextTourRecord(undefined, 'skip', null, true, NOW)).toBeNull();
  });

  it('records completion when a replay is finished, including after a previous skip', () => {
    const fromSkipped = nextTourRecord(tour('skipped', { skippedAt: '2026-10-01T00:00:00.000Z' }), 'complete', null, true, NOW);
    expect(fromSkipped).toMatchObject({
      status: 'completed',
      completedAt: NOW,
      skippedAt: '2026-10-01T00:00:00.000Z',
    });
    const fromLegacy = nextTourRecord(undefined, 'complete', null, true, NOW);
    expect(fromLegacy?.status).toBe('completed');
  });

  it('keeps the server record authoritative over the cache', () => {
    const memory = new Map<string, string>();
    const storage = {
      getItem: (key: string) => memory.get(key) ?? null,
      setItem: (key: string, value: string) => {
        memory.set(key, value);
      },
    };
    const server = tour('in_progress', { stepId: 'jobs', updatedAt: '2026-10-20T00:00:00.000Z' });
    const newer = tour('in_progress', { stepId: 'settings', updatedAt: '2026-10-20T06:00:00.000Z' });
    writeTourCache('user-a', newer, storage, false);
    expect(readTourCache('user-a', storage)).toBeNull();
    writeTourCache('user-a', newer, storage, true);
    expect(effectiveResumeStepId(server, readTourCache('user-a', storage))).toBe('settings');
    expect(effectiveResumeStepId(tour('completed'), readTourCache('user-a', storage))).toBeNull();
    expect(effectiveResumeStepId(undefined, newer)).toBeNull();
    expect(tourCacheKey('user-a')).not.toBe(tourCacheKey('user-b'));
    expect(readTourCache('user-b', storage)).toBeNull();
  });
});

describe('app tour placement', () => {
  it('puts the tooltip below the target when there is room and keeps it on screen', () => {
    const placed = placeTooltip(
      { top: 40, left: 40, width: 80, height: 30 },
      { width: 200, height: 120 },
      { width: 800, height: 600 },
    );
    expect(placed.top).toBeGreaterThanOrEqual(70);
    expect(placed.left).toBeGreaterThanOrEqual(8);
    expect(placed.left + 200).toBeLessThanOrEqual(800);
  });

  it('moves above a target that sits on the bottom edge', () => {
    const placed = placeTooltip(
      { top: 520, left: 20, width: 100, height: 40 },
      { width: 200, height: 100 },
      { width: 400, height: 600 },
    );
    expect(placed.top + 100).toBeLessThanOrEqual(520);
  });

  it('clamps a tooltip that would otherwise leave the viewport', () => {
    const placed = placeTooltip(
      { top: 8, left: 360, width: 40, height: 20 },
      { width: 220, height: 80 },
      { width: 400, height: 300 },
      { top: 8, right: 8, bottom: 8, left: 8 },
    );
    expect(placed.left).toBeGreaterThanOrEqual(8);
    expect(placed.left + 220).toBeLessThanOrEqual(400);
    expect(placed.top).toBeGreaterThanOrEqual(8);
  });

  it('ignores targets that are off-screen or have no box', () => {
    const visible = document.createElement('button');
    visible.setAttribute('data-tour', 'jobs');
    visible.getBoundingClientRect = () =>
      ({ top: 20, left: 20, width: 40, height: 20, bottom: 40, right: 60, x: 20, y: 20, toJSON() { return {}; } });
    const hidden = document.createElement('button');
    hidden.setAttribute('data-tour', 'jobs');
    hidden.getBoundingClientRect = () =>
      ({ top: 0, left: -300, width: 40, height: 20, bottom: 20, right: -260, x: -300, y: 0, toJSON() { return {}; } });
    const root = document.createElement('div');
    root.append(hidden, visible);
    expect(findVisibleTourTarget('jobs', root)).toBe(visible);
    expect(findLaidOutTourTarget('jobs', root)).toBe(visible);
  });

  it('can still find a laid-out target that is below the fold', () => {
    const below = document.createElement('button');
    below.setAttribute('data-tour', 'cv-ai');
    below.getBoundingClientRect = () =>
      ({ top: 1400, left: 20, width: 80, height: 24, bottom: 1424, right: 100, x: 20, y: 1400, toJSON() { return {}; } });
    const root = document.createElement('div');
    root.append(below);
    expect(findVisibleTourTarget('cv-ai', root)).toBeNull();
    expect(findLaidOutTourTarget('cv-ai', root)).toBe(below);
  });
});
