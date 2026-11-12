import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { hasKey } from './core';

/**
 * Every static translation key used in app/ and src/ must exist in English.
 *
 * Mirrors apps/web/src/i18n/keys-resolve.test.ts. The parity tests compare
 * locales to each other, so a key missing from ALL of them passes there — and
 * the screen shows the raw key ("settings.profile.titel"). This catches it.
 *
 * Bound translator variables (anything else is ignored, so `track('x')` or a
 * local `t` from another library is never mistaken for a key):
 *   const t  = useT('settings')     → t('profile.title')   checks settings.profile.title
 *   const tc = useT('common')       → tc('cancel')         checks common.cancel
 *   const t  = useT()               → t('tabs.settings')   fully qualified
 *   import { t } from '…/i18n'      → t('settings.title')  fully qualified
 *   import { t as tr } from '…/i18n/core'
 *
 * Only string-literal keys in single quotes are checked. Template literals
 * (`t(\`status.${s}\`)`) are runtime keys — guard them with `hasKey()` and keep
 * every possible value in the en file.
 */

const MOBILE = join(__dirname, '..', '..');
const ROOTS = ['app', 'src'].map((d) => join(MOBILE, d));
const SKIP_FILE = /\.(test|spec)\.tsx?$/;

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const p = join(dir, entry);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.tsx?$/.test(p) && !SKIP_FILE.test(p)) out.push(p);
  }
  return out;
}

const FILES = ROOTS.flatMap((r) => walk(r));

/** `const t = useT('ns')` / `useT()`. Group 1 = variable, group 2 = namespace. */
const HOOK_BINDING = /(?:const|let)\s+([A-Za-z_$][\w$]*)\s*=\s*useT\(\s*(?:'([^']*)')?\s*\)/g;
/** `import { t, …, t as tr } from '…i18n…'`. Group 1 = the import list. */
const IMPORT_BINDING = /import\s*\{([^}]*)\}\s*from\s*'[^']*i18n(?:\/(?:index|core))?'/g;

function translatorsIn(src: string): Map<string, Set<string>> {
  const bound = new Map<string, Set<string>>();
  const add = (name: string, ns: string) => {
    const set = bound.get(name) ?? new Set<string>();
    set.add(ns);
    bound.set(name, set);
  };
  for (const m of src.matchAll(HOOK_BINDING)) add(m[1], m[2] ?? '');
  for (const m of src.matchAll(IMPORT_BINDING)) {
    for (const part of m[1].split(',')) {
      const spec = part.trim().match(/^t(?:\s+as\s+([A-Za-z_$][\w$]*))?$/);
      if (spec) add(spec[1] ?? 't', '');
    }
  }
  return bound;
}

function findUnresolved(): string[] {
  const problems: string[] = [];
  for (const file of FILES) {
    const src = readFileSync(file, 'utf8');
    for (const [name, namespaces] of translatorsIn(src)) {
      const call = new RegExp(`(?<![\\w$.])${name.replace(/\$/g, '\\$')}\\(\\s*'([^']*)'`, 'g');
      for (const m of src.matchAll(call)) {
        const key = m[1];
        if ([...namespaces].some((ns) => hasKey(ns ? `${ns}.${key}` : key))) continue;
        const line = src.slice(0, m.index).split('\n').length;
        const rel = file.slice(MOBILE.length + 1).replace(/\\/g, '/');
        problems.push(`${rel}:${line}  ${name}('${key}')  [namespace: ${[...namespaces].map((n) => n || '(bare)').join(' | ')}]`);
      }
    }
  }
  return problems;
}

describe('translation keys resolve', () => {
  it('every static key exists in the en message files', () => {
    expect(findUnresolved()).toEqual([]);
  });

  it('the scan reaches the converted screens (guards against a broken walk or regex)', () => {
    const files = FILES.filter((f) => translatorsIn(readFileSync(f, 'utf8')).size > 0)
      .map((f) => f.slice(MOBILE.length + 1).replace(/\\/g, '/'));
    for (const expected of [
      'app/(dashboard)/_layout.tsx',
      'app/(dashboard)/settings/index.tsx',
      'app/(dashboard)/settings/profile.tsx',
      'app/(dashboard)/settings/billing.tsx',
      'app/(dashboard)/settings/data.tsx',
      'src/lib/billing-history.ts',
    ]) {
      expect(files).toContain(expected);
    }
  });

  it('the binding rules match what they claim', () => {
    const map = translatorsIn(
      "const t = useT('settings');\nconst tc = useT('common');\nconst q = useT();\nimport { formatDate, t as tr } from '../i18n';",
    );
    expect([...map.entries()].map(([k, v]) => `${k}=${[...v].join('|')}`)).toEqual([
      't=settings',
      'tc=common',
      'q=',
      'tr=',
    ]);
  });
});
