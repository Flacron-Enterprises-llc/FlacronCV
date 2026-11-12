import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { SUPPORTED_LOCALES } from './config';
import { messageArguments } from './format';
import { MESSAGES } from './messages';

/**
 * Gates for the message files in ./locales/<locale>/<namespace>.json.
 *
 * A failure names the locale, namespace and key. Fix the translation file —
 * never weaken a check or change `en` to make another locale pass.
 */

const LOCALES_DIR = join(__dirname, 'locales');
const NON_EN = SUPPORTED_LOCALES.filter((l) => l !== 'en');

/**
 * Values allowed to be identical to English. Key = `namespace.path` (all
 * locales) or `locale:namespace.path` (that locale only). Every entry needs a
 * reason a native reader would accept: a brand, a product/plan name, a word the
 * language really spells the same way.
 */
const SAME_AS_ENGLISH: Record<string, string> = {
  // Brands.
  'settings.profile.linkedin': 'brand',
  'settings.profile.github': 'brand',
  // Plan names are not localised in es/fr/de (website: common.pro / common.enterprise).
  'es:settings.plans.pro': 'plan name',
  'fr:settings.plans.pro': 'plan name',
  'de:settings.plans.pro': 'plan name',
  'es:settings.plans.enterprise': 'plan name',
  'fr:settings.plans.enterprise': 'plan name',
  'de:settings.plans.enterprise': 'plan name',
  // Words spelled the same in the target language.
  'fr:common.ok': 'French uses "OK" on buttons',
  'de:common.ok': 'German uses "OK" on buttons',
  'de:tabs.dashboard': 'German UI word (website dashboard.title)',
  'fr:settings.notifications.title': 'same word in French',
  'es:settings.billing.plan': 'same word in Spanish (website billing.plan)',
  'es:settings.billing.usage.cvs': 'Spanish uses "CVs" (website dashboard.my_cvs)',
  'de:settings.billing.status': 'same word in German',
  'de:settings.usage.credits': 'German UI uses "Credits"',
  'de:settings.billing.usage.credits': 'German UI uses "Credits"',
};

type Tree = Record<string, unknown>;

function flatten(value: unknown, prefix: string, out: Record<string, string> = {}): Record<string, string> {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    for (const [k, v] of Object.entries(value as Tree)) flatten(v, `${prefix}.${k}`, out);
  } else {
    out[prefix] = value as string;
  }
  return out;
}

function readNamespace(locale: string, ns: string): Record<string, string> {
  return flatten(JSON.parse(readFileSync(join(LOCALES_DIR, locale, `${ns}.json`), 'utf8')), ns);
}

const namespacesOnDisk = (locale: string) =>
  readdirSync(join(LOCALES_DIR, locale))
    .filter((f) => f.endsWith('.json'))
    .map((f) => f.slice(0, -5))
    .sort();

const NAMESPACES = namespacesOnDisk('en');

describe('message files', () => {
  it('every locale folder has exactly the en namespaces', () => {
    for (const locale of SUPPORTED_LOCALES) {
      expect(`${locale}: ${namespacesOnDisk(locale).join(',')}`).toBe(`${locale}: ${NAMESPACES.join(',')}`);
    }
  });

  it('messages.ts imports every file on disk (run `npm run i18n:index` if not)', () => {
    for (const locale of SUPPORTED_LOCALES) {
      expect(Object.keys(MESSAGES[locale]).sort()).toEqual(NAMESPACES);
      for (const ns of NAMESPACES) {
        expect((MESSAGES[locale] as Tree)[ns]).toEqual(
          JSON.parse(readFileSync(join(LOCALES_DIR, locale, `${ns}.json`), 'utf8')),
        );
      }
    }
  });

  it('namespace names are camelCase file names', () => {
    for (const ns of NAMESPACES) expect(ns).toMatch(/^[a-z][a-zA-Z0-9]*$/);
  });

  it.each(NAMESPACES)('%s: every value is a non-empty string', (ns) => {
    const bad: string[] = [];
    for (const locale of SUPPORTED_LOCALES) {
      for (const [key, value] of Object.entries(readNamespace(locale, ns))) {
        if (typeof value !== 'string' || value.trim() === '') bad.push(`${locale}:${key}`);
      }
    }
    expect(bad).toEqual([]);
  });

  it.each(NAMESPACES)('%s: every locale has exactly the en keys', (ns) => {
    const en = Object.keys(readNamespace('en', ns)).sort();
    for (const locale of NON_EN) {
      const keys = Object.keys(readNamespace(locale, ns)).sort();
      const missing = en.filter((k) => !keys.includes(k)).map((k) => `${locale} missing ${k}`);
      const extra = keys.filter((k) => !en.includes(k)).map((k) => `${locale} extra ${k}`);
      expect([...missing, ...extra]).toEqual([]);
    }
  });

  it.each(NAMESPACES)('%s: placeholders and plural arguments match en', (ns) => {
    const en = readNamespace('en', ns);
    const problems: string[] = [];
    for (const locale of NON_EN) {
      const target = readNamespace(locale, ns);
      for (const [key, value] of Object.entries(en)) {
        if (typeof target[key] !== 'string') continue;
        const want = messageArguments(value).join(' ');
        const got = messageArguments(target[key]).join(' ');
        if (want !== got) problems.push(`${locale}:${key} has [${got}], en has [${want}]`);
      }
    }
    expect(problems).toEqual([]);
  });

  it.each(NAMESPACES)('%s: no non-en value is left in English', (ns) => {
    const en = readNamespace('en', ns);
    const untranslated: string[] = [];
    for (const locale of NON_EN) {
      const target = readNamespace(locale, ns);
      for (const [key, value] of Object.entries(en)) {
        if (target[key] !== value) continue;
        if (key in SAME_AS_ENGLISH || `${locale}:${key}` in SAME_AS_ENGLISH) continue;
        untranslated.push(`${locale}:${key} = ${JSON.stringify(value)}`);
      }
    }
    expect(untranslated).toEqual([]);
  });

  it('the allow-list has no stale entries', () => {
    const stale = Object.keys(SAME_AS_ENGLISH).filter((entry) => {
      const [locale, key] = entry.includes(':') ? entry.split(':') : [null, entry];
      const ns = key.split('.')[0];
      if (!NAMESPACES.includes(ns)) return true;
      const en = readNamespace('en', ns)[key];
      if (en === undefined) return true;
      const locales = locale ? [locale] : NON_EN;
      return !locales.some((l) => readNamespace(l, ns)[key] === en);
    });
    expect(stale).toEqual([]);
  });
});
