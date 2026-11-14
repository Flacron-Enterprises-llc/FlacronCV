import { describe, it, expect, vi } from 'vitest';
// api.ts (ApiError) imports the Firebase client; the pure helpers under test need none of it.
vi.mock('@/lib/firebase', () => ({ auth: {}, db: {}, storage: {}, app: {}, isConfigured: false, googleProvider: {} }));
vi.mock('@/providers/AuthProvider', () => ({ useAuth: () => ({}) }));

import { SubscriptionPlan } from '@flacroncv/shared-types';
import { ApiError } from '@/lib/api';
import { coverLetterAllowance, isCoverLetterLimitError } from './letter-allowance';

describe('coverLetterAllowance', () => {
  it('a Free user who has used the allowance is at the limit', () => {
    expect(coverLetterAllowance(SubscriptionPlan.FREE, 1, true).atLimit).toBe(true);
    expect(coverLetterAllowance(SubscriptionPlan.FREE, 0, true).atLimit).toBe(false);
  });

  it('never blocks on a degraded/placeholder profile (it may be a paying user)', () => {
    expect(coverLetterAllowance(SubscriptionPlan.FREE, 5, false).atLimit).toBe(false);
  });

  it('an unlimited plan is never at the limit', () => {
    const enterprise = coverLetterAllowance(SubscriptionPlan.ENTERPRISE, 10_000, true);
    expect(enterprise.atLimit).toBe(false);
  });
});

describe('isCoverLetterLimitError', () => {
  it('matches the API refusal and nothing else', () => {
    expect(isCoverLetterLimitError(new ApiError('Cover letter limit reached. Please upgrade.', { kind: 'http', status: 403 }))).toBe(true);
    expect(isCoverLetterLimitError(new ApiError('Template "corporate" requires a higher plan.', { kind: 'http', status: 403 }))).toBe(false);
    expect(isCoverLetterLimitError(new ApiError('Cover letter limit reached.', { kind: 'http', status: 500 }))).toBe(false);
    expect(isCoverLetterLimitError(new Error('Cover letter limit reached'))).toBe(false);
  });
});
