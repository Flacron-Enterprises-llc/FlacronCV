/**
 * React Native side of i18n: the device copy of the language (AsyncStorage),
 * the layout direction (I18nManager) and adopting the signed-in profile's
 * `preferences.language`. Kept out of core.ts so the core stays testable in
 * node; import this file only from app/ screens and layouts.
 *
 * Layout direction (RTL for ar/ur):
 *   - React Native reads the direction once, when the JS bundle starts. A
 *     change made with I18nManager.forceRTL is stored natively and only takes
 *     effect after the app restarts. Text in the new language shows at once;
 *     only mirroring (row order, start/end) waits for the restart.
 *   - allowRTL(rtl) AND forceRTL(rtl) are both set. allowRTL(true) alone would
 *     let an Arabic-language phone mirror an English app, so LTR languages
 *     disallow RTL explicitly.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useEffect } from 'react';
import { DevSettings, I18nManager } from 'react-native';
import {
  deviceLocaleTag,
  isRTLLocale,
  isSupportedLocale,
  resolveInitialLocale,
  type AppLocale,
} from './config';
import { getLocale, setLocale } from './core';

export const LANGUAGE_STORAGE_KEY = 'flacroncv.language';

/** Set once anything chose a language this run, so a late bootstrap cannot override it. */
let chosenThisRun = false;

/**
 * Asks React Native for the direction of `locale`. Returns true when the UI
 * currently running has the other direction, i.e. a restart is needed to see it.
 */
export function applyLayoutDirection(locale: AppLocale): boolean {
  const rtl = isRTLLocale(locale);
  try {
    I18nManager.allowRTL(rtl);
    I18nManager.forceRTL(rtl);
    return I18nManager.isRTL !== rtl;
  } catch {
    return false;
  }
}

async function persist(locale: AppLocale): Promise<void> {
  try {
    await AsyncStorage.setItem(LANGUAGE_STORAGE_KEY, locale);
  } catch {
    /* the in-memory language still applies; it is just not remembered */
  }
}

/**
 * Startup (root layout, module scope): language last chosen on this device →
 * device language if shipped → English, and the matching layout direction for
 * the next launch. Never throws.
 */
export async function bootstrapI18n(): Promise<void> {
  let persisted: string | null = null;
  try {
    persisted = await AsyncStorage.getItem(LANGUAGE_STORAGE_KEY);
  } catch {
    persisted = null;
  }
  if (chosenThisRun) return;
  const locale = resolveInitialLocale({ persisted, device: deviceLocaleTag() });
  setLocale(locale);
  applyLayoutDirection(locale);
}

/**
 * The user picked a language: switch now, remember it on the device and set the
 * direction. `needsRestart` is true when the layout direction changes (LTR ↔
 * RTL) — tell the user it applies after restarting the app. Saving to the
 * profile (`PATCH /users/me/preferences {language}`) is the caller's job.
 */
export async function changeLanguage(locale: AppLocale): Promise<{ needsRestart: boolean }> {
  chosenThisRun = true;
  setLocale(locale);
  const needsRestart = applyLayoutDirection(locale);
  await persist(locale);
  return { needsRestart };
}

/**
 * The signed-in profile's `preferences.language` is the source of truth, as on
 * the website. Adopts it when it differs from the language on screen (e.g.
 * changed on the website or another device). No prompt: if the direction
 * changes, it applies on the next launch.
 */
export function adoptProfileLanguage(language: unknown): void {
  if (!isSupportedLocale(language)) return;
  chosenThisRun = true;
  if (language === getLocale()) return;
  setLocale(language);
  applyLayoutDirection(language);
  void persist(language);
}

/** Runs adoptProfileLanguage whenever the profile's language value changes. */
export function useProfileLanguageSync(language: unknown): void {
  useEffect(() => {
    adoptProfileLanguage(language);
  }, [language]);
}

/**
 * Style for icons that point a direction (chevron-forward, arrow-back, …):
 * mirrors them when the running layout is RTL. `<Ionicons name="chevron-forward" style={RTL_FLIP} />`.
 * I18nManager.isRTL is fixed for the life of the JS bundle, so a constant is enough.
 */
export const RTL_FLIP = I18nManager.isRTL ? { transform: [{ scaleX: -1 }] } : undefined;

/** Development builds only: reload the JS bundle so a direction change shows at once. */
export const canReloadForDirection = typeof __DEV__ !== 'undefined' && __DEV__;

export function reloadForDirection(): void {
  if (canReloadForDirection) DevSettings.reload();
}
