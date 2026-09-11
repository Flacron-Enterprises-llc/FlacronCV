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
    }
    if (error instanceof Error && error.message) return error.message;
    return fallback ?? t('auth.errors.generic');
  };
}
