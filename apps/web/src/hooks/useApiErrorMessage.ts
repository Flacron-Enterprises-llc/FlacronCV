'use client';

import { useLocale, useTranslations } from 'next-intl';
import { ApiError } from '@/lib/api';

/**
 * Turns any thrown error into copy for a toast or inline message, in the
 * user's language. Static `t()` keys so keys-resolve can see them;
 * `apiErrorMessage` in api.ts cannot (no binding).
 *
 * Precedence for an API (HTTP) error:
 * 1. A known machine `code` → its own translated message (most specific).
 * 2. 5xx → the caller's localized `fallback` (or the generic message). A 5xx
 *    body is never useful to the user — the API replaces internals with
 *    "Internal server error" — and it is English.
 * 3. 429 → the localized "too many attempts" message.
 * 4. Other 4xx → the server's sentence in an English UI (it is written in
 *    English and is usually specific, e.g. "Annual billing is not available
 *    yet."); in any other locale the caller's localized `fallback`, and only
 *    when there is none, the server's sentence rather than nothing useful.
 *
 * Non-API errors keep their own message: several callers throw an Error whose
 * message they already translated.
 */
export function useApiErrorMessage() {
  const t = useTranslations();
  const locale = useLocale();
  return (error: unknown, fallback?: string): string => {
    if (error instanceof ApiError) {
      if (error.kind === 'offline') return t('auth.errors.offline');
      if (error.kind === 'timeout') return t('auth.errors.timeout');
      if (error.kind === 'network') return t('auth.errors.network');

      if (error.kind === 'http') {
        const known = knownCodeMessage(error.code, t, error.details);
        if (known) return known;

        const status = typeof error.status === 'number' ? error.status : undefined;
        if (status !== undefined && status >= 500) return fallback ?? t('auth.errors.generic');
        if (status === 429) return t('auth.errors.too_many_attempts');

        // Client-built text for a body with no `message`: nothing specific to keep.
        if (/^Request failed \(HTTP \d+\)$/.test(error.message)) {
          if (fallback) return fallback;
          return status !== undefined ? t('auth.errors.http', { status }) : t('auth.errors.generic');
        }
        if (locale !== 'en' && fallback) return fallback;
      }
    }
    if (error instanceof Error && error.message) return error.message;
    return fallback ?? t('auth.errors.generic');
  };
}

/** Plan ids a server may name as the minimum for something (five-plan catalog). */
const PLAN_IDS = new Set(['free', 'starter', 'professional', 'career_pro', 'business']);

/**
 * API error codes with their own user-facing copy. The server's sentences are
 * English and, for billing, sometimes name things the UI words differently, so
 * every code a customer can meet in the five-plan model is translated here once
 * and every caller of this hook gets it.
 */
export function knownCodeMessage(
  code: string | undefined,
  t: ReturnType<typeof useTranslations>,
  details?: Record<string, unknown>,
): string | undefined {
  switch (code) {
    case 'NO_SUBSCRIPTION':
      return t('billing.errors.noSubscription');
    case 'PLAN_NOT_CONFIGURED':
      return t('plan_catalog.not_configured_error');
    case 'PLAN_NOT_AVAILABLE':
      return t('billing.errors.planNotAvailable');
    case 'ALREADY_SUBSCRIBED':
      return t('billing.errors.alreadySubscribed');
    case 'SAME_PLAN':
      return t('billing.errors.samePlan');
    case 'BILLING_UNAVAILABLE':
      return t('billing.errors.billingUnavailable');
    case 'TRIAL_NOT_ELIGIBLE':
      return t('billing.trial_not_eligible');
    case 'ADDON_NOT_ON_SALE':
      return t('billing.errors.addonNotOnSale');
    case 'ADDON_UNAVAILABLE':
      return t('billing.errors.addonUnavailable');
    case 'UPGRADE_REQUIRED': {
      const plan = details?.minimumPlan;
      return typeof plan === 'string' && PLAN_IDS.has(plan)
        ? t('billing.errors.upgradeRequiredPlan', { plan: t(`career.plans.plan.${plan}`) })
        : t('billing.errors.upgradeRequired');
    }
    case 'ADDON_PRICE_CHANGED':
      return t('billing.errors.addonPriceChanged');
    case 'ADDON_ALREADY_ACTIVE':
      return t('billing.errors.addonAlreadyActive');
    case 'CAREER_ADDON_RETIRED':
      return t('billing.errors.careerAddonRetired');
    case 'USAGE_METER_UNAVAILABLE':
      return t('billing.errors.usageMeterUnavailable');
    case 'ANALYSES_EXHAUSTED':
      return t('billing.errors.analysesExhausted');
    case 'JOB_CAPACITY_REACHED':
      return t('jobs.capacity_reached');
    case 'CV_LIMIT_REACHED':
      return t('billing.errors.cvLimitReached');
    default:
      return undefined;
  }
}
