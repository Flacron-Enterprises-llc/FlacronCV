'use client';

import { useTranslations } from 'next-intl';
import { ApiError } from '@/lib/api';

/**
 * Localized copy for ApiError transport kinds. Static `t()` keys so
 * keys-resolve can see them; `apiErrorMessage` in api.ts cannot (no binding).
 */
export function useApiErrorMessage() {
  const t = useTranslations();
  return (error: unknown, fallback?: string): string => {
    if (error instanceof ApiError) {
      if (error.kind === 'offline') return t('auth.errors.offline');
      if (error.kind === 'timeout') return t('auth.errors.timeout');
      if (error.kind === 'network') return t('auth.errors.network');
      // Client-built fallback when the API body had no `message`. A real
      // `body.message` (often English from the API) is left as-is — translating
      // that would need the API, which this slice does not touch.
      if (
        error.kind === 'http' &&
        typeof error.status === 'number' &&
        /^Request failed \(HTTP \d+\)$/.test(error.message)
      ) {
        return t('auth.errors.http', { status: error.status });
      }
    }
    if (error instanceof Error && error.message) return error.message;
    return fallback ?? t('auth.errors.generic');
  };
}
