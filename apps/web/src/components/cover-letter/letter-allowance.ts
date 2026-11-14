'use client';

import { useEffect } from 'react';
import { PLAN_CONFIGS, resolveEffectivePlan, type SubscriptionPlan } from '@flacroncv/shared-types';
import { ApiError } from '@/lib/api';
import { useAuth } from '@/providers/AuthProvider';

/**
 * Pure allowance decision, the same rule the API enforces
 * (cover-letter.service.ts: usage.coverLettersCreated against the effective
 * plan's `coverLetters` limit). `known` is false for a degraded/placeholder
 * profile, which claims Free — a paying user must never be blocked on it.
 */
export function coverLetterAllowance(plan: SubscriptionPlan, used: number, known: boolean) {
  const limit = PLAN_CONFIGS[plan].limits.coverLetters;
  // Current plans limit STORED letters (capacity): the API decides. Only
  // legacy plans, which count creations, are pre-checked from the profile.
  const limited = known && limit !== 'unlimited' && PLAN_CONFIGS[plan].legacy;
  const atLimit = limited && used >= (limit as number);
  return { limit, used, limited, atLimit };
}

/**
 * The user's cover-letter allowance (cover-letter twin of `useCvAllowance`).
 *
 * `usage` lives on the auth user and is only as fresh as the last profile
 * fetch — a letter created in another tab, or the dashboard having been open
 * for a while, leaves it stale. With `refreshOnMount` the profile is re-read
 * once when the page opens, so the up-front gate reflects the real count.
 */
export function useCoverLetterAllowance({ refreshOnMount = false }: { refreshOnMount?: boolean } = {}) {
  const { user, degraded, placeholderAccount, refreshUser } = useAuth();
  const known = Boolean(user) && !degraded && !placeholderAccount;

  useEffect(() => {
    if (refreshOnMount) void refreshUser();
    // Once per mount: refreshUser's identity may change as the user updates.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshOnMount]);

  return {
    ...coverLetterAllowance(
      resolveEffectivePlan(user?.subscription),
      user?.usage?.coverLettersCreated ?? 0,
      known,
    ),
    refreshUser,
  };
}

/** True for the API's "Cover letter limit reached" refusal (create / duplicate). */
export function isCoverLetterLimitError(error: unknown): boolean {
  if (!(error instanceof ApiError) || error.status !== 403) return false;
  return error.code === 'COVER_LETTER_LIMIT_REACHED' || /cover letter limit/i.test(error.message);
}
