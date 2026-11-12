import { describe, expect, it } from 'vitest';
import { ApiError } from '../../../../../packages/career-api-client/src/client';
import type { LearningLoopView } from '../../../../../packages/career-api-client/src/types';
import { loopErrorKind, loopErrorMessage, loopViewModel } from './learning-loop';

const base: LearningLoopView = {
  sampleSize: 12,
  recordedApplications: 10,
  unrecorded: 2,
  noResponse: 6,
  interviews: 2,
  offers: 1,
  interviewRatePercent: 20,
  statement: '2 interviews from 10 recorded applications is a 20 percent observed interview rate in that sample, not a future hiring probability.',
  suggestion: 'Experiment: add missing evidence to the target-role resume. This is not a hiring probability.',
  level: 'trends',
};

describe('loopViewModel', () => {
  it('keeps the server statement and suggestion verbatim and lists the counts', () => {
    const view = loopViewModel(base);
    expect(view.statement).toBe(base.statement);
    expect(view.suggestion).toBe(base.suggestion);
    expect(view.stats.map((s) => [s.key, s.value])).toEqual([
      ['recorded', '10'],
      ['rate', '20%'],
      ['interviews', '2'],
      ['offers', '1'],
      ['noResponse', '6'],
      ['unrecorded', '2'],
    ]);
    expect(view.sampleNote).toBeNull();
    expect(view.empty).toBe(false);
  });

  it('shows no rate when the plan level gives counts only', () => {
    const view = loopViewModel({ ...base, interviewRatePercent: null, level: 'basic_counts', suggestion: null });
    expect(view.stats.some((s) => s.key === 'rate')).toBe(false);
    expect(view.suggestion).toBeNull();
  });

  it('adds sample-size caveats', () => {
    expect(loopViewModel({ ...base, recordedApplications: 3, interviews: 1, interviewRatePercent: 33 }).sampleNote).toContain('small sample (3 recorded)');
    expect(loopViewModel({ ...base, recordedApplications: 0, interviewRatePercent: null }).sampleNote).toContain('no rate');
    const empty = loopViewModel({ ...base, sampleSize: 0, recordedApplications: 0, unrecorded: 0, interviewRatePercent: null });
    expect(empty.empty).toBe(true);
    expect(empty.sampleNote).toContain('Job Tracker');
  });
});

describe('loop errors', () => {
  it('classifies switch-off and plan refusals', () => {
    expect(loopErrorKind(new ApiError(503, 'feature_unavailable', { code: 'feature_unavailable' }))).toBe('switched-off');
    expect(loopErrorKind(new ApiError(403, 'plan_upgrade_required', { code: 'plan_upgrade_required' }))).toBe('not-included');
    expect(loopErrorKind(new Error('x'))).toBe('other');
    expect(loopErrorMessage(new Error('x'))).toContain('could not be loaded');
  });
});
