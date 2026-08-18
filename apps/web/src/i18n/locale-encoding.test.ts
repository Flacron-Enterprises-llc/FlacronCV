import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Locale files must be well-formed UTF-8 whose values are not mojibake or
 * HTML-entity leftovers.
 *
 * WHY THIS EXISTS. The other four i18n gates cannot see a corrupted character.
 * Parity compares key sets. keys-resolve checks that a key exists.
 * no-hardcoded-english scans JSX. locale-untranslated compares against English
 * — and a mojibake string is not identical to English, so it passes. A wrong
 * character is present, unique, and resolvable, so every gate is green while
 * the word is misspelt on screen. That shipped: French `footer.about` rendered
 * a mangled first letter in the navbar and the footer, both reading one key.
 *
 * WHAT THIS DOES NOT CATCH. A regex cannot distinguish "cree" from "crée".
 * Missing diacritics in an otherwise-correct script are silent spelling
 * mistakes, not encoding defects, and this file does not cover them. Do not
 * assume locale spelling is gated because this test is green.
 */

const LOCALES = ['en', 'es', 'fr', 'de', 'ar', 'ur'] as const;
const LOCALES_DIR = join(__dirname, '..', '..', 'public', 'locales');

/**
 * UTF-8 bytes that were decoded as Windows-1252/Latin-1. These sequences do
 * not occur in legitimate UI copy in any of the six languages we ship.
 */
const MOJIBAKE_MARKERS = [
  'Ã©',
  'Ã¨',
  'Ã¼',
  'Ã¤',
  'Ã¶',
  'ÃŸ',
  'Ã±',
  'Ã§',
  'Ã€',
  'Â\u00A0',
  'Â ',
  'â€™',
  'â€œ',
  'â€\u009D',
  'â€˜',
  'â€¦',
] as const;

const HTML_ENTITY = /&(?:[a-zA-Z][a-zA-Z0-9]+|#\d+|#x[0-9a-fA-F]+);/;
const REPLACEMENT = /\uFFFD/;
const C1_CONTROLS = /[\u0080-\u009F]/;

/**
 * At least one letter from the language's own alphabet must appear in the
 * file's *values*. A gate that can pass while matching nothing is not a gate
 * — the same non-vacuity reasoning as keys-resolve asserting a minimum file
 * count after it started binding getTranslations.
 */
const ALPHABET: Record<(typeof LOCALES)[number], RegExp> = {
  en: /[A-Za-z]/,
  es: /[áéíóúüñ¿¡ÁÉÍÓÚÜÑ]/,
  fr: /[àâäéèêëîïôùûüÿçœæÀÂÄÉÈÊËÎÏÔÙÛÜÇŒ]/,
  de: /[äöüßÄÖÜ]/,
  ar: /[\u0600-\u06FF]/,
  ur: /[\u0600-\u06FF]/,
};

function flattenValues(
  value: unknown,
  prefix = '',
  out: { key: string; value: string }[] = [],
): { key: string; value: string }[] {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      flattenValues(v, prefix ? `${prefix}.${k}` : k, out);
    }
  } else if (typeof value === 'string' && prefix) {
    out.push({ key: prefix, value });
  }
  return out;
}

function readStrictUtf8(locale: string): string {
  const buf = readFileSync(join(LOCALES_DIR, locale, 'common.json'));
  return new TextDecoder('utf-8', { fatal: true }).decode(buf);
}

const leavesByLocale = Object.fromEntries(
  LOCALES.map((locale) => {
    const text = readStrictUtf8(locale);
    return [locale, flattenValues(JSON.parse(text))];
  }),
) as Record<(typeof LOCALES)[number], { key: string; value: string }[]>;

describe('locale encoding', () => {
  it.each(LOCALES)('%s is strict UTF-8', (locale) => {
    expect(() => readStrictUtf8(locale)).not.toThrow();
  });

  it('no value contains HTML entities, replacement characters, C1 controls, or known mojibake', () => {
    const hits: string[] = [];
    for (const locale of LOCALES) {
      for (const { key, value } of leavesByLocale[locale]) {
        if (HTML_ENTITY.test(value)) hits.push(`${locale}:${key} HTML entity`);
        if (REPLACEMENT.test(value)) hits.push(`${locale}:${key} U+FFFD`);
        if (C1_CONTROLS.test(value)) hits.push(`${locale}:${key} C1 control`);
        for (const marker of MOJIBAKE_MARKERS) {
          if (value.includes(marker)) {
            hits.push(`${locale}:${key} mojibake ${JSON.stringify(marker)}`);
          }
        }
      }
    }
    expect(hits).toEqual([]);
  });

  it.each(LOCALES)('%s values contain at least one letter from its alphabet', (locale) => {
    const leaves = leavesByLocale[locale];
    // If flatten silently returned nothing, the alphabet regex would also match
    // nothing and this test would need a count to fail closed.
    expect(leaves.length).toBeGreaterThan(1000);
    const blob = leaves.map((l) => l.value).join('\n');
    expect(
      ALPHABET[locale].test(blob),
      `${locale}: no letter from its alphabet appeared in any value. ` +
        'The file is empty of that script, or flatten stopped matching.',
    ).toBe(true);
  });
});
