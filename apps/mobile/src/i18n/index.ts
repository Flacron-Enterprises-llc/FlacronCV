/**
 * Public, pure entry point (safe in lib code and vitest). React Native–specific
 * pieces — AsyncStorage persistence, I18nManager layout direction, profile
 * sync — live in ./native and are imported from there explicitly.
 * See ./README.md.
 */
export {
  DEFAULT_LOCALE,
  LANGUAGE_NAMES,
  SUPPORTED_LOCALES,
  isRTLLocale,
  isSupportedLocale,
  type AppLocale,
} from './config';
export { getLocale, hasKey, setLocale, subscribe, t, translate, type MessageParams } from './core';
export { formatCurrency, formatDate, formatNumber, intlLocale } from './intl';
export { useLocale, useT, type TFunction } from './useT';
