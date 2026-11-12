/**
 * Number / date / currency formatting in the current app language.
 *
 * The app runs on Hermes (Expo SDK 54 default; app.json sets no jsEngine), which
 * ships Intl.NumberFormat and Intl.DateTimeFormat on Android and iOS. Every call
 * is still wrapped: if the engine lacks a locale or option it falls back to
 * English instead of throwing.
 *
 * English uses `en-US`, the tag the app hard-coded before translation, so
 * English output is unchanged ("Jan 5, 2026", "$19.99").
 */
import type { AppLocale } from './config';
import { getLocale } from './core';

const FALLBACK = 'en-US';

/** BCP 47 tag handed to Intl for an app locale. */
export function intlLocale(locale: AppLocale = getLocale()): string {
  return locale === 'en' ? FALLBACK : locale;
}

function withFallback<T>(run: (tag: string) => T, locale?: AppLocale): T {
  try {
    return run(intlLocale(locale));
  } catch {
    return run(FALLBACK);
  }
}

export function formatNumber(value: number, options?: Intl.NumberFormatOptions, locale?: AppLocale): string {
  try {
    return withFallback((tag) => new Intl.NumberFormat(tag, options).format(value), locale);
  } catch {
    return String(value);
  }
}

/** `amount` in major units (19.99). An unknown currency code prints "19.99 XYZ". */
export function formatCurrency(amount: number, currency: string, locale?: AppLocale): string {
  const code = currency.toUpperCase();
  try {
    return withFallback(
      (tag) => new Intl.NumberFormat(tag, { style: 'currency', currency: code }).format(amount),
      locale,
    );
  } catch {
    return `${amount.toFixed(2)} ${code}`;
  }
}

const DEFAULT_DATE: Intl.DateTimeFormatOptions = { year: 'numeric', month: 'short', day: 'numeric' };

/**
 * A date as "Jan 5, 2026" (en) / "5 janv. 2026" (fr). Accepts a Date, epoch ms
 * or an ISO string; anything unparseable gives "—". For Firestore timestamps,
 * convert with `toDate` from src/lib/utils first.
 */
export function formatDate(
  value: Date | number | string | null | undefined,
  options: Intl.DateTimeFormatOptions = DEFAULT_DATE,
  locale?: AppLocale,
): string {
  if (value === null || value === undefined || value === '') return '—';
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  try {
    return withFallback((tag) => date.toLocaleDateString(tag, options), locale);
  } catch {
    return date.toDateString();
  }
}
