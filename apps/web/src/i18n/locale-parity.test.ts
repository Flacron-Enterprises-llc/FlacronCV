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

/**
 * Argument names used in an ICU message: `{name}`, `{n, number}`, and the
 * selector plus every argument inside the branches of `{n, plural, one {…} …}`
 * / `select` / `selectordinal`. Branch text itself is message text, not a name.
 * Apostrophe quoting is honoured ('{' is a literal brace).
 */
function icuArgumentNames(message: string): Set<string> {
  const names = new Set<string>();
  let i = 0;

  // Message text until an unmatched `}` (end of a branch) or the end.
  const parseText = (): void => {
    while (i < message.length) {
      const ch = message[i];
      if (ch === "'" && message[i + 1] === "'") {
        i += 2;
      } else if (ch === "'" && (message[i + 1] === '{' || message[i + 1] === '}')) {
        const close = message.indexOf("'", i + 1);
        i = close === -1 ? message.length : close + 1;
      } else if (ch === '{') {
        i++;
        parseArgument();
      } else if (ch === '}') {
        return;
      } else {
        i++;
      }
    }
  };

  // After `{`: name [, type [, style | branches]] `}`.
  const parseArgument = (): void => {
    const nameMatch = /^\s*([\w.]+)\s*/.exec(message.slice(i));
    if (!nameMatch) return;
    names.add(nameMatch[1]);
    i += nameMatch[0].length;
    if (message[i] === '}') {
      i++;
      return;
    }
    if (message[i] !== ',') return;
    i++;
    const typeMatch = /^\s*(\w+)\s*/.exec(message.slice(i));
    const type = typeMatch?.[1] ?? '';
    i += typeMatch?.[0].length ?? 0;
    if (type === 'plural' || type === 'select' || type === 'selectordinal') {
      if (message[i] === ',') i++;
      // Branches: (offset:n)? (selector {text})+ then `}`.
      while (i < message.length) {
        const sel = /^\s*(offset:\d+\s*)?(=?[\w-]+)\s*/.exec(message.slice(i));
        if (!sel || message[i + sel[0].length] !== '{') break;
        i += sel[0].length + 1;
        parseText();
        i++; // the branch's closing `}`
      }
      while (i < message.length && message[i] !== '}') i++;
      i++;
    } else {
      // number/date/time with an optional style: skip to the closing brace.
      while (i < message.length && message[i] !== '}') i++;
      i++;
    }
  };

  parseText();
  return names;
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

  it('reads ICU argument names, not branch text', () => {
    const names = (s: string) => [...icuArgumentNames(s)].sort();
    expect(names('Hello {name}, {n, number}')).toEqual(['n', 'name']);
    expect(names('{count, plural, one {Add # item at {place}} other {Add # items}}')).toEqual(['count', 'place']);
    expect(names("{g, select, female {Elle} other {Il}} a dit '{'not an arg'}'")).toEqual(['g']);
    expect(names('{count, plural, offset:1 =0 {none} other {# more}}')).toEqual(['count']);
    // A dropped argument is still a difference.
    expect(names('Saved on {date}')).not.toEqual(names('Saved on'));
  });

  it('ICU placeholders match en in every locale', () => {
    // A translation that drops `{date}` or renames it to `{fecha}` renders the
    // literal braces to the user — invisible to a key-set comparison.
    const mismatches: string[] = [];
    // The SET of argument names, read with a small ICU parser. A regex over
    // `{word…}` also matched the first word of every plural/select branch
    // (`one {Add evidence…}` → "Add"), so any natural translation that starts a
    // branch differently "failed", and an argument used twice in en but once in
    // a translation counted as a mismatch although nothing renders wrongly.
    const placeholders = (s: string) => [...icuArgumentNames(s)].sort();

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
