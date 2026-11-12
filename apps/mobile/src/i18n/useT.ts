import { useCallback, useSyncExternalStore } from 'react';
import type { AppLocale } from './config';
import { getLocale, subscribe, translate, type MessageParams } from './core';

export type TFunction = (key: string, params?: MessageParams) => string;

/** The current app language; the component re-renders when it changes. */
export function useLocale(): AppLocale {
  return useSyncExternalStore(subscribe, getLocale, getLocale);
}

/**
 * Translator for a component, like next-intl's `useTranslations`:
 *
 *   const t = useT('settings');   t('profile.title')  → settings.profile.title
 *   const tc = useT('common');    tc('cancel')
 *   const t = useT();             t('tabs.dashboard') (fully qualified)
 *
 * Keys must be string literals so the key-resolve test can check them.
 */
export function useT(namespace?: string): TFunction {
  const locale = useLocale();
  return useCallback(
    (key: string, params?: MessageParams) =>
      translate(locale, namespace ? `${namespace}.${key}` : key, params),
    [locale, namespace],
  );
}
