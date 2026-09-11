'use client';

import { useCallback } from 'react';
import { useLocale } from 'next-intl';
import { formatDateTime as formatDateTimeLocalized } from './format-date';
import { formatDate as formatDateShort } from './utils';

/** Calendar date in the active UI locale (not hardcoded en-US / en-GB). */
export function useFormatDate() {
  const locale = useLocale();
  return useCallback((value: unknown) => formatDateShort(value, locale), [locale]);
}

export function useFormatDateTime() {
  const locale = useLocale();
  return useCallback(
    (value: unknown, opts?: Intl.DateTimeFormatOptions) =>
      formatDateTimeLocalized(
        value,
        opts ?? { dateStyle: 'medium', timeStyle: 'short' },
        locale,
      ),
    [locale],
  );
}
