import { afterEach, describe, expect, it } from 'vitest';
import {
  LANGUAGE_NAMES,
  SUPPORTED_LOCALES,
  isRTLLocale,
  matchLocale,
  resolveInitialLocale,
} from './config';
import { getLocale, hasKey, setLocale, subscribe, t, translate } from './core';
import { __builtinPluralCategory, formatMessage, messageArguments, pluralCategory } from './format';
import { formatCurrency, formatDate, formatNumber, intlLocale } from './intl';

afterEach(() => setLocale('en'));

describe('formatMessage', () => {
  it('fills {name} placeholders and keeps unknown ones visible', () => {
    expect(formatMessage('We sent a link to {email}', 'en', { email: 'a@b.co' })).toBe('We sent a link to a@b.co');
    expect(formatMessage('Hi {name}, {missing}', 'en', { name: 'Ana' })).toBe('Hi Ana, {missing}');
    expect(formatMessage('{n} / {m}', 'en', { n: 0, m: 5 })).toBe('0 / 5');
  });

  it('formats ICU plurals with # and exact matches', () => {
    const msg = '{count, plural, =0 {No CVs} one {# CV} other {# CVs}}';
    expect(formatMessage(msg, 'en', { count: 0 })).toBe('No CVs');
    expect(formatMessage(msg, 'en', { count: 1 })).toBe('1 CV');
    expect(formatMessage(msg, 'en', { count: 7 })).toBe('7 CVs');
  });

  it('uses the web strings shape (plural followed by text, nested placeholders)', () => {
    const web = '{count, plural, one {# minute} other {# minutes}} of voice practice a month';
    expect(formatMessage(web, 'en', { count: 30 })).toBe('30 minutes of voice practice a month');
    expect(formatMessage('{count, plural, one {{name} has # CV} other {{name} has # CVs}}', 'en', { count: 2, name: 'Ana' }))
      .toBe('Ana has 2 CVs');
  });

  it('picks Arabic zero/one/two/few/many/other', () => {
    const msg = '{count, plural, zero {z} one {o} two {t} few {f#} many {m#} other {x#}}';
    expect(formatMessage(msg, 'ar', { count: 0 })).toBe('z');
    expect(formatMessage(msg, 'ar', { count: 1 })).toBe('o');
    expect(formatMessage(msg, 'ar', { count: 2 })).toBe('t');
    expect(formatMessage(msg, 'ar', { count: 5 })).toBe('f5');
    expect(formatMessage(msg, 'ar', { count: 11 })).toBe('m11');
    expect(formatMessage(msg, 'ar', { count: 100 })).toBe('x100');
    // A missing category falls back to `other`.
    expect(formatMessage('{count, plural, one {o} other {x}}', 'ar', { count: 5 })).toBe('x');
  });

  it('supports select', () => {
    const msg = '{kind, select, cv {CV} letter {Letter} other {Document}}';
    expect(formatMessage(msg, 'en', { kind: 'cv' })).toBe('CV');
    expect(formatMessage(msg, 'en', { kind: 'zzz' })).toBe('Document');
  });

  it('never throws on malformed messages', () => {
    for (const bad of ['{', '}', '{count, plural, one {x}', '{count, plural}', '{a, b, c}', '{count, plural, one x}']) {
      expect(() => formatMessage(bad, 'en', { count: 1 })).not.toThrow();
    }
    expect(formatMessage('{count, plural, one {x} other {y}}', 'en', {})).toBe('{count, plural, one {x} other {y}}');
  });

  it('lists arguments for the parity test', () => {
    expect(messageArguments('{a} and {count, plural, one {# {b}} other {#}}')).toEqual(['{a}', '{b}', '{count, plural}']);
    expect(messageArguments('plain')).toEqual([]);
  });
});

describe('plural rules', () => {
  it('built-in table agrees with Intl.PluralRules for the shipped languages', () => {
    const samples = [0, 1, 2, 3, 5, 10, 11, 12, 25, 99, 100, 101, 102, 103, 111, 1000, 1.5];
    for (const locale of SUPPORTED_LOCALES) {
      const rules = new Intl.PluralRules(locale);
      for (const n of samples) {
        // Spanish/French "many" (1,000,000…) is not modelled; strings use one/other there.
        const expected = rules.select(n);
        if (expected === 'many' && locale !== 'ar') continue;
        expect(`${locale}:${n}:${__builtinPluralCategory(locale, n)}`).toBe(`${locale}:${n}:${expected}`);
      }
    }
  });

  it('pluralCategory works for every locale', () => {
    expect(pluralCategory('fr', 0)).toBe('one');
    expect(pluralCategory('en', 0)).toBe('other');
    expect(pluralCategory('ar', 3)).toBe('few');
  });
});

describe('translate / t', () => {
  it('resolves fully qualified keys in the current locale', () => {
    expect(t('tabs.settings')).toBe('Settings');
    setLocale('fr');
    expect(t('tabs.settings')).toBe('Paramètres');
    expect(getLocale()).toBe('fr');
  });

  it('fills params', () => {
    expect(t('settings.password.sentBody', { email: 'me@x.io' })).toBe('We sent a password reset link to me@x.io');
    expect(translate('de', 'settings.password.sentBody', { email: 'me@x.io' })).toBe('Wir haben einen Reset-Link an me@x.io gesendet');
  });

  it('missing key → English → the key itself, never a crash', () => {
    expect(translate('es', 'nope.missing')).toBe('nope.missing');
    expect(translate('es', 'settings')).toBe('settings');
    expect(translate('es', 'settings.profile')).toBe('settings.profile');
    expect(translate('es', '')).toBe('');
    expect(hasKey('settings.profile.title')).toBe(true);
    expect(hasKey('settings.profile')).toBe(false);
  });

  it('notifies subscribers once per change and ignores unsupported locales', () => {
    const seen: string[] = [];
    const off = subscribe((l) => seen.push(l));
    setLocale('ar');
    setLocale('ar');
    setLocale('xx' as never);
    setLocale('en');
    off();
    setLocale('de');
    expect(seen).toEqual(['ar', 'en']);
  });
});

describe('config', () => {
  it('matches BCP 47 tags to shipped languages', () => {
    expect(matchLocale('ar-EG')).toBe('ar');
    expect(matchLocale('fr_CA')).toBe('fr');
    expect(matchLocale('ur-Arab-PK')).toBe('ur');
    expect(matchLocale('EN')).toBe('en');
    expect(matchLocale('pt-BR')).toBeNull();
    expect(matchLocale(undefined)).toBeNull();
  });

  it('initial locale: persisted → device → en', () => {
    expect(resolveInitialLocale({ persisted: 'de', device: 'fr-FR' })).toBe('de');
    expect(resolveInitialLocale({ persisted: 'xx', device: 'fr-FR' })).toBe('fr');
    expect(resolveInitialLocale({ persisted: null, device: 'ja-JP' })).toBe('en');
    expect(resolveInitialLocale({})).toBe('en');
  });

  it('RTL is exactly Arabic and Urdu; every language has a native name', () => {
    expect(SUPPORTED_LOCALES.filter(isRTLLocale)).toEqual(['ar', 'ur']);
    for (const l of SUPPORTED_LOCALES) expect(LANGUAGE_NAMES[l]).toBeTruthy();
  });
});

describe('intl helpers', () => {
  it('English output matches the formats the app hard-coded (en-US)', () => {
    expect(intlLocale('en')).toBe('en-US');
    expect(formatDate(new Date(2026, 0, 5))).toBe('Jan 5, 2026');
    expect(formatCurrency(19.99, 'usd')).toBe('$19.99');
    expect(formatNumber(1234.5)).toBe('1,234.5');
  });

  it('follows the current locale', () => {
    setLocale('de');
    expect(formatNumber(1234.5)).toBe('1.234,5');
    expect(formatDate(new Date(2026, 0, 5))).toContain('2026');
  });

  it('degrades instead of throwing', () => {
    expect(formatDate('not a date')).toBe('—');
    expect(formatDate(null)).toBe('—');
    expect(formatCurrency(12.34, 'not-a-code')).toBe('12.34 NOT-A-CODE');
  });
});
