/**
 * Languages the app ships — the same six as the website
 * (apps/web/src/i18n/routing.ts) and the values the API accepts for
 * `preferences.language` (UpdatePreferencesDto: `@IsEnum(Locale)`).
 *
 * Pure: no React Native imports, so it runs under vitest.
 */

export const SUPPORTED_LOCALES = ['en', 'es', 'fr', 'de', 'ar', 'ur'] as const;

export type AppLocale = (typeof SUPPORTED_LOCALES)[number];

export const DEFAULT_LOCALE: AppLocale = 'en';

/** Right-to-left scripts. Layout direction follows these (see native.ts). */
export const RTL_LOCALES: readonly AppLocale[] = ['ar', 'ur'];

/**
 * Each language in its own language (endonym), exactly as the website's picker
 * (`settings.preferences.languages.*`). Never translated, so they live here and
 * not in the message files.
 */
export const LANGUAGE_NAMES: Record<AppLocale, string> = {
  en: 'English',
  es: 'Español',
  fr: 'Français',
  de: 'Deutsch',
  ar: 'العربية',
  ur: 'اردو',
};

export function isSupportedLocale(value: unknown): value is AppLocale {
  return typeof value === 'string' && (SUPPORTED_LOCALES as readonly string[]).includes(value);
}

export function isRTLLocale(locale: AppLocale): boolean {
  return RTL_LOCALES.includes(locale);
}

/**
 * Maps a BCP 47 tag ("ar-EG", "fr_CA", "ur-Arab-PK", "EN") to a supported
 * locale by its language subtag, or null when the language is not shipped.
 */
export function matchLocale(tag: unknown): AppLocale | null {
  if (typeof tag !== 'string') return null;
  const language = tag.trim().split(/[-_]/)[0]?.toLowerCase();
  return isSupportedLocale(language) ? language : null;
}

/**
 * The device's language from the JS engine's default locale. expo-localization
 * is not installed; Hermes and V8 both report the OS locale here. Any failure
 * (no Intl, odd tag) yields null, never a throw.
 */
export function deviceLocaleTag(): string | null {
  try {
    return Intl.DateTimeFormat().resolvedOptions().locale ?? null;
  } catch {
    return null;
  }
}

/**
 * Locale to use before the signed-in profile is known: the language last chosen
 * on this device → the device language if shipped → English. Once the profile
 * loads, its `preferences.language` wins (native.ts `adoptProfileLanguage`).
 */
export function resolveInitialLocale(input: { persisted?: unknown; device?: unknown }): AppLocale {
  if (isSupportedLocale(input.persisted)) return input.persisted;
  return matchLocale(input.device) ?? DEFAULT_LOCALE;
}
