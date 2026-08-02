import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Every locale must expose exactly the same key set as `en`.
 *
 * WHY THIS EXISTS. Translations live in six separate JSON files edited by hand.
 * A key added to `en` but missed in `ur` does not fail the build or the type
 * check — next-intl silently falls back to rendering the raw key path, so the
 * user sees literal text like `coverLetters.generating_title` on screen. That
 * has happened before (the support ticket-detail page shipped ~15 keys that
 * existed in no locale at all). Reviewing six diffs by eye does not catch it;
 * this does.
 *
 * A failure here means: add the missing key to the named locale, or remove the
 * stray one. Never "fix" it by deleting the key from `en`.
 */

const LOCALES = ['en', 'es', 'fr', 'de', 'ar', 'ur'] as const;
const LOCALES_DIR = join(__dirname, '..', '..', 'public', 'locales');

/** All leaf key paths, dot-joined (`support.statusLabels.open`). */
function flatten(value: unknown, prefix = '', out = new Set<string>()): Set<string> {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      flatten(v, prefix ? `${prefix}.${k}` : k, out);
    }
  } else if (prefix) {
    out.add(prefix);
  }
  return out;
}

function load(locale: string): Record<string, unknown> {
  return JSON.parse(readFileSync(join(LOCALES_DIR, locale, 'common.json'), 'utf8'));
}

const keysByLocale = Object.fromEntries(
  LOCALES.map((l) => [l, flatten(load(l))]),
) as Record<(typeof LOCALES)[number], Set<string>>;

describe('locale parity', () => {
  it('en is the reference and is non-trivial', () => {
    expect(keysByLocale.en.size).toBeGreaterThan(1000);
  });

  for (const locale of LOCALES.filter((l) => l !== 'en')) {
    // Reported as sorted arrays so a failure names the exact missing keys
    // rather than just a count.
    it(`${locale} has no missing keys`, () => {
      const missing = [...keysByLocale.en].filter((k) => !keysByLocale[locale].has(k)).sort();
      expect(missing).toEqual([]);
    });

    it(`${locale} has no keys that en does not`, () => {
      const extra = [...keysByLocale[locale]].filter((k) => !keysByLocale.en.has(k)).sort();
      expect(extra).toEqual([]);
    });
  }

  it('no locale leaves a value empty', () => {
    const empty: string[] = [];
    for (const locale of LOCALES) {
      const json = load(locale);
      for (const path of keysByLocale[locale]) {
        const value = path.split('.').reduce<unknown>((acc, k) => (acc as never)?.[k], json);
        if (typeof value === 'string' && value.trim() === '') empty.push(`${locale}:${path}`);
      }
    }
    expect(empty).toEqual([]);
  });

  it('ICU placeholders match en in every locale', () => {
    // A translation that drops `{date}` or renames it to `{fecha}` renders the
    // literal braces to the user — invisible to a key-set comparison.
    const mismatches: string[] = [];
    const placeholders = (s: string) =>
      [...s.matchAll(/\{(\w+)[^}]*\}/g)].map((m) => m[1]).sort();

    for (const locale of LOCALES.filter((l) => l !== 'en')) {
      const en = load('en');
      const other = load(locale);
      for (const path of keysByLocale.en) {
        const get = (o: unknown) => path.split('.').reduce<unknown>((a, k) => (a as never)?.[k], o);
        const a = get(en);
        const b = get(other);
        if (typeof a !== 'string' || typeof b !== 'string') continue;
        const pa = placeholders(a);
        const pb = placeholders(b);
        if (pa.join(',') !== pb.join(',')) {
          mismatches.push(`${locale}:${path} expected [${pa}] got [${pb}]`);
        }
      }
    }
    expect(mismatches).toEqual([]);
  });
});
