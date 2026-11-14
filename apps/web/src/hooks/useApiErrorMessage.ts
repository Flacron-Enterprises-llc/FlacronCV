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
        const known = knownCodeMessage(error.code, t);
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

/** API error codes with their own user-facing copy. */
function knownCodeMessage(
  code: string | undefined,
  t: ReturnType<typeof useTranslations>,
): string | undefined {
  switch (code) {
    case 'NO_SUBSCRIPTION':
      return t('billing.errors.noSubscription');
    default:
      return undefined;
  }
}
