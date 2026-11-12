/**
 * The translation store and `t()` for code outside React components (lib
 * helpers, Alert text built after an await, notification bodies).
 *
 * Pure — no React Native imports — so lib files that call `t()` stay testable
 * under vitest, where the locale is always English unless a test sets it.
 * React components use `useT()` (useT.ts), which re-renders on a change.
 */
import { DEFAULT_LOCALE, isSupportedLocale, type AppLocale } from './config';
import { formatMessage, type MessageParams } from './format';
import { MESSAGES } from './messages';

export type { MessageParams } from './format';

type Listener = (locale: AppLocale) => void;

let currentLocale: AppLocale = DEFAULT_LOCALE;
const listeners = new Set<Listener>();

export function getLocale(): AppLocale {
  return currentLocale;
}

/** Switches the language for every `t()` / `useT()`. Unsupported values are ignored. */
export function setLocale(locale: AppLocale): void {
  if (!isSupportedLocale(locale) || locale === currentLocale) return;
  currentLocale = locale;
  listeners.forEach((listener) => listener(locale));
}

export function subscribe(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** `settings.profile.title` → the string in the `settings` namespace file, or undefined. */
function lookup(locale: AppLocale, key: string): string | undefined {
  const dot = key.indexOf('.');
  if (dot <= 0) return undefined;
  const namespaces = MESSAGES[locale] as Record<string, unknown>;
  let node: unknown = namespaces[key.slice(0, dot)];
  for (const part of key.slice(dot + 1).split('.')) {
    if (!node || typeof node !== 'object') return undefined;
    node = (node as Record<string, unknown>)[part];
  }
  return typeof node === 'string' ? node : undefined;
}

/** True when the key exists in English — for dynamic keys built at runtime. */
export function hasKey(key: string): boolean {
  return lookup(DEFAULT_LOCALE, key) !== undefined;
}

const warned = new Set<string>();

/**
 * Message for `key` in `locale`: that locale → English → the key itself.
 * Never throws.
 */
export function translate(locale: AppLocale, key: string, params?: MessageParams): string {
  const message = lookup(locale, key) ?? lookup(DEFAULT_LOCALE, key);
  if (message === undefined) {
    if (typeof __DEV__ !== 'undefined' && __DEV__ && !warned.has(key)) {
      warned.add(key);
      console.warn(`[i18n] missing key: ${key}`);
    }
    return key;
  }
  try {
    return formatMessage(message, locale, params);
  } catch {
    return message;
  }
}

/** Translate with the current locale. Keys are fully qualified: `t('settings.title')`. */
export function t(key: string, params?: MessageParams): string {
  return translate(currentLocale, key, params);
}
