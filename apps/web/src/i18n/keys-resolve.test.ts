import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Every `t('...')` call must resolve to a real key.
 *
 * WHY THIS EXISTS, and why the other two i18n tests cannot replace it:
 *
 *   - `locale-parity.test.ts` compares the six locale files **to each other**. A
 *     key missing from ALL of them is perfectly consistent, so parity passes.
 *   - `no-hardcoded-english.test.ts` looks for English literals in JSX. A `t()`
 *     call is not a literal, so it sees nothing wrong.
 *
 * The result is a gap you can drive a feature through: the component compiles,
 * the type-check passes, both i18n tests are green — and the user sees the
 * literal string `public_templates.search_placeholder` on screen, because
 * next-intl falls back to the dotted path when a key is absent.
 *
 * That is not hypothetical. It happened three times in a row while building out
 * the review features: 40 keys, then 54 keys, then 11 of those on the very first
 * screen of CV creation. Each time every other gate was green. This test is the
 * one that catches it.
 */

const SRC = join(__dirname, '..');
const EN = join(__dirname, '..', '..', 'public', 'locales', 'en', 'common.json');

const SKIP_FILE = /\.(test|spec)\./;

const messages = JSON.parse(readFileSync(EN, 'utf8')) as Record<string, unknown>;

/** Resolve a dotted path against en/common.json. */
function has(path: string): boolean {
  return (
    path.split('.').reduce<unknown>((acc, k) => (acc as Record<string, unknown>)?.[k], messages) !==
    undefined
  );
}

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const p = join(dir, entry);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.tsx?$/.test(p) && !SKIP_FILE.test(p)) out.push(p);
  }
  return out;
}

interface Unresolved {
  file: string;
  line: number;
  key: string;
  namespaces: string[];
}

function findUnresolved(): Unresolved[] {
  const problems: Unresolved[] = [];

  for (const file of walk(SRC)) {
    const src = readFileSync(file, 'utf8');

    // Bind to the translator VARIABLES this file actually declares, rather than
    // matching any `t*(` call. Matching by shape caught `track('sign_in')` —
    // the analytics helper — and reported the funnel event names as missing
    // translations. Ten false positives is how a gate gets ignored.
    //
    //   const t       = useTranslations('crm')   → t(…)       against `crm`
    //   const tCommon = useTranslations('common')→ tCommon(…)  against `common`
    //   const t       = useTranslations()        → t(…)        fully qualified
    // varName → every namespace it is bound to anywhere in the file.
    //
    // A Set, not a single value: the same name is routinely declared in two
    // scopes — `cover-letters/page.tsx` has `const t = useTranslations()` in the
    // page and `const t = useTranslations('coverLetters')` in the card below it.
    // Keeping only the last binding made every key in the other scope look
    // missing. Scope analysis is more than a regex can honestly do, so a key
    // counts as resolved if ANY namespace that name is bound to contains it.
    // Slightly permissive, but it has no false positives — and the failure this
    // gate exists to catch is a key that exists in NO namespace at all.
    const translators = new Map<string, Set<string>>();
    for (const m of src.matchAll(
      /(?:const|let)\s+([A-Za-z_$][\w$]*)\s*=\s*useTranslations\(\s*(?:'([^']*)')?\s*\)/g,
    )) {
      const set = translators.get(m[1]) ?? new Set<string>();
      set.add(m[2] ?? '');
      translators.set(m[1], set);
    }
    if (!translators.size) continue;

    for (const [varName, namespaces] of translators) {
      // Only STATIC keys can be checked. `t(`status.${x}`)` and `t(someVar)` are
      // resolved at runtime and are deliberately out of scope — flagging them
      // would train people to ignore this test.
      const call = new RegExp(`\\b${varName}\\(\\s*'([a-zA-Z0-9_.]+)'`, 'g');
      for (const m of src.matchAll(call)) {
        const key = m[1];
        const resolves = [...namespaces].some((ns) => has(ns ? `${ns}.${key}` : key));
        if (resolves) continue;
        problems.push({
          file: file.replace(SRC, 'src').replace(/\\/g, '/'),
          line: src.slice(0, m.index).split('\n').length,
          key,
          namespaces: [...namespaces].map((n) => n || '(bare)'),
        });
      }
    }
  }

  return problems;
}

describe('translation keys resolve', () => {
  it('every static t() key exists in en/common.json', () => {
    // Rendered as readable strings so a failure names the file, line, key and
    // namespace — enough to fix it without re-deriving anything.
    const unresolved = findUnresolved().map(
      (p) => `${p.file}:${p.line}  t('${p.key}')  [namespace: ${p.namespaces.join(' | ')}]`,
    );
    expect(unresolved).toEqual([]);
  });

  it('the scan actually reaches the app (guards against a broken walk)', () => {
    // If the traversal or the regex silently stopped matching, the test above
    // would pass vacuously forever. Assert it is really looking at something.
    const files = walk(SRC).filter((f) => /useTranslations\(/.test(readFileSync(f, 'utf8')));
    expect(files.length).toBeGreaterThan(30);
  });
});
