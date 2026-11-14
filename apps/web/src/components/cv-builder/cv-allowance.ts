'use client';

import { PLAN_CONFIGS, resolveEffectivePlan } from '@flacroncv/shared-types';
import { ApiError } from '@/lib/api';
import { useAuth } from '@/providers/AuthProvider';

/**
 * The user's CV-creation allowance, read the same way the API enforces it
 * (cv.service.ts: usage.cvsCreated against the effective plan's `cvs` limit).
 *
 * `usage` lives on the auth user and is only as fresh as the last profile
 * fetch, so every create/duplicate/import path calls `refreshUser()` after it
 * succeeds (or is refused) — otherwise /cv kept offering "Create" after the
 * fifth CV and the user only found out from a generic error toast.
 */
export function useCvAllowance() {
  const { user, degraded, placeholderAccount, refreshUser } = useAuth();
  const config = PLAN_CONFIGS[resolveEffectivePlan(user?.subscription)];
  const limit = config.limits.cvs;
  const used = user?.usage?.cvsCreated ?? 0;
  // A degraded/placeholder profile claims Free; never block a paying user on it.
  const known = Boolean(user) && !degraded && !placeholderAccount;
  // Current plans limit STORED CVs (capacity), which this profile does not
  // carry: the API decides (CV_LIMIT_REACHED → upgrade prompt). Only legacy
  // plans, which count creations, are pre-checked here.
  const limited = known && limit !== 'unlimited' && config.legacy;
  const atLimit = limited && used >= (limit as number);
  return { limit, used, limited, atLimit, refreshUser };
}

/**
 * True for the API's "CV limit reached" refusal (POST /cvs, /cvs/:id/duplicate,
 * /cvs/import). Matched on the code the API now sends, and on the message for
 * an API build that predates the code.
 */
export function isCvLimitError(error: unknown): boolean {
  if (!(error instanceof ApiError) || error.status !== 403) return false;
  return error.code === 'CV_LIMIT_REACHED' || /cv limit/i.test(error.message);
}
