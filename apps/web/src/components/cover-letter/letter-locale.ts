/**
 * The language a cover letter is WRITTEN in, as opposed to the interface
 * language it is being viewed in.
 *
 * Someone browsing in Arabic may well be applying to an English-speaking
 * employer. The letter's salutation, closing, date and text direction must
 * follow the letter, otherwise an English letter opened in /ar comes out with
 * an Arabic "Dear", an Arabic date and a mirrored layout. The letter stores its
 * own `letterLocale`; this module holds the pure decisions around it so the
 * preview, the editor and the exporter all agree.
 */
import type { CoverLetter } from '@flacroncv/shared-types';
import type { CLLabels } from './templates/types';
import { coverLetterLabels, formatLetterDate as formatDateForLocale } from '@/lib/export-cv-cover-letter';

export const LETTER_LOCALES = ['en', 'es', 'fr', 'de', 'ar', 'ur'] as const;
export type LetterLocale = (typeof LETTER_LOCALES)[number];

/** `letterLocale` is not on the shared type yet; documents may carry it. */
export type CoverLetterWithLocale = CoverLetter & { letterLocale?: string | null };

/** Each language named in itself, so the picker needs no translation. */
export const LETTER_LOCALE_NAMES: Record<LetterLocale, string> = {
  en: 'English',
  es: 'Español',
  fr: 'Français',
  de: 'Deutsch',
  ar: 'العربية',
  ur: 'اردو',
};

/** English language names — the form the AI endpoints' `language` field expects. */
const AI_LANGUAGE_NAMES: Record<LetterLocale, string> = {
  en: 'English',
  es: 'Spanish',
  fr: 'French',
  de: 'German',
  ar: 'Arabic',
  ur: 'Urdu',
};

const RTL_LETTER_LOCALES: readonly LetterLocale[] = ['ar', 'ur'];
const LATIN_LETTER_LOCALES: readonly LetterLocale[] = ['en', 'es', 'fr', 'de'];

export function isLetterLocale(value: unknown): value is LetterLocale {
  return typeof value === 'string' && (LETTER_LOCALES as readonly string[]).includes(value);
}

export function isRtlLetterLocale(locale: LetterLocale): boolean {
  return RTL_LETTER_LOCALES.includes(locale);
}

export function aiLanguageName(locale: LetterLocale): string {
  return AI_LANGUAGE_NAMES[locale];
}

/** Arabic-script letters (covers Urdu); Latin letters incl. accented ones. */
const ARABIC_SCRIPT = /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF]/g;
const ARABIC_SCRIPT_ONE = /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF]/;
const LATIN_SCRIPT = /[A-Za-z\u00C0-\u024F]/g;

function plainText(html: string): string {
  return html.replace(/<[^>]*>/g, ' ').replace(/&[a-z#0-9]+;/gi, ' ');
}

/**
 * The language of a letter that predates `letterLocale`.
 *
 * Deliberately simple — it only has to pick the right SCRIPT, because that is
 * what goes visibly wrong (mirrored layout, Arabic labels on English text):
 *  - no body text yet        → the interface language (what the user would pick);
 *  - mostly Latin script     → the interface language if that is a Latin-script
 *                              one (an fr user's letter is most likely French),
 *                              otherwise English;
 *  - mostly Arabic script    → the interface language if that is ar/ur,
 *                              otherwise Arabic.
 */
export function inferLetterLocale(content: string | null | undefined, uiLocale: string): LetterLocale {
  const ui: LetterLocale = isLetterLocale(uiLocale) ? uiLocale : 'en';
  const text = plainText(content ?? '');
  const arabic = text.match(ARABIC_SCRIPT)?.length ?? 0;
  const latin = text.match(LATIN_SCRIPT)?.length ?? 0;
  if (arabic === 0 && latin === 0) return ui;
  if (latin >= arabic) return LATIN_LETTER_LOCALES.includes(ui) ? ui : 'en';
  return RTL_LETTER_LOCALES.includes(ui) ? ui : 'ar';
}

/** The stored letter language, or an inferred one for older letters. */
export function resolveLetterLocale(coverLetter: CoverLetterWithLocale, uiLocale: string): LetterLocale {
  return isLetterLocale(coverLetter.letterLocale)
    ? coverLetter.letterLocale
    : inferLetterLocale(coverLetter.content, uiLocale);
}

/**
 * The letter's labels from a locale's `coverLetters` message namespace (a
 * plain object, so it works for a locale other than the interface's).
 *
 * Built with the exporter's own key map (`coverLetterLabels`), and the preview
 * hands the result to the DOCX export, so the on-screen letter, its PDF and its
 * Word file never disagree about the letter's language.
 */
export function buildCoverLetterLabels(messages: Record<string, unknown>): CLLabels {
  return coverLetterLabels((key) => {
    const value = messages[key];
    return typeof value === 'string' ? value : '';
  });
}

/**
 * The comma that ends the salutation ("Dear Amara,").
 *
 * Arabic and Urdu write the Arabic comma "،", not the Latin ",". The labels
 * already say which language the letter is in — their own closings end in
 * "،" — so the choice keys off the script of the salutation word itself,
 * which keeps it correct wherever a CLLabels set comes from (the preview, or
 * the DOCX exporter given the same labels).
 */
export function salutationComma(labels: Pick<CLLabels, 'dear'>): string {
  return ARABIC_SCRIPT_ONE.test(labels.dear) ? '،' : ',';
}

/** The letter's date, written the way the letter's language writes dates. */
export function formatLetterDate(locale: LetterLocale, date: Date = new Date()): string {
  return formatDateForLocale(locale, date);
}
