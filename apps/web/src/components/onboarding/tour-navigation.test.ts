import { describe, expect, it } from 'vitest';
import { canAutoStartTourOn, userLeftTour } from './tour-navigation';

describe('tour navigation rules', () => {
  it('auto-starts only on the dashboard, never from a page the user chose', () => {
    expect(canAutoStartTourOn('/dashboard')).toBe(true);
    expect(canAutoStartTourOn('/dashboard/')).toBe(true);
    // A new user opening /cv directly used to be pushed back to /dashboard
    // by the tour's first step.
    expect(canAutoStartTourOn('/cv')).toBe(false);
    expect(canAutoStartTourOn('/jobs')).toBe(false);
  });

  it('treats a path the tour did not choose as the user leaving it', () => {
    expect(userLeftTour('/dashboard', '/cv')).toBe(true);
    expect(userLeftTour('/cv', '/cover-letters')).toBe(true);
  });

  it('does not react to the tour’s own navigation or when no tour runs', () => {
    expect(userLeftTour('/cv', '/cv')).toBe(false);
    expect(userLeftTour('/cv', '/cv?x=1')).toBe(false);
    expect(userLeftTour(null, '/cv')).toBe(false);
  });
});
