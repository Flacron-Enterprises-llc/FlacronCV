import { describe, it, expect } from 'vitest';
import {
  resolveCVDocumentLocale, formatDocDate, formatDocDateRange, cvDocLabels, splitLegacyRange,
} from '../document-locale';
import { genericItemParts, toHref } from '../shared';

const cv = (personalInfo: Record<string, string>, styling: Record<string, unknown> = {}) =>
  ({ personalInfo: { firstName: '', lastName: '', headline: '', summary: '', ...personalInfo }, styling } as any);
const sec = (items: any[]) => [{ items }] as any;

describe('resolveCVDocumentLocale', () => {
  it('keeps an English CV left-to-right with English labels in the Arabic UI', () => {
    const r = resolveCVDocumentLocale(cv({ firstName: 'Amara', summary: 'Senior engineer who builds payment systems.' }), [], 'ar');
    expect(r).toEqual({ lang: 'en', dir: 'ltr' });
  });

  it('makes an Arabic CV right-to-left in the English UI', () => {
    const r = resolveCVDocumentLocale(cv({ firstName: 'سارة', summary: 'مهندسة برمجيات بخبرة ثماني سنوات' }), [], 'en');
    expect(r).toEqual({ lang: 'ar', dir: 'rtl' });
  });

  it('recognises Urdu by its letters, and follows an RTL UI within the script', () => {
    expect(resolveCVDocumentLocale(cv({ summary: 'میں ایک سافٹ ویئر انجینئر ہوں اور ٹیم کی قیادت کرتا ہوں' }), [], 'en').lang).toBe('ur');
    expect(resolveCVDocumentLocale(cv({ summary: 'مهندسة برمجيات بخبرة ثماني سنوات' }), [], 'ur').lang).toBe('ur');
  });

  it('lets the header decide over English example items', () => {
    const items = sec([{ institution: 'University of Technology', description: 'Graduated with honours in computer science' }]);
    const r = resolveCVDocumentLocale(cv({ firstName: 'سارة', summary: 'مهندسة برمجيات بخبرة ثماني سنوات' }), items, 'en');
    expect(r.dir).toBe('rtl');
  });

  it('follows a Latin UI language for Latin content, and the UI for an empty CV', () => {
    expect(resolveCVDocumentLocale(cv({ summary: 'Ingénieure logiciel spécialisée dans les paiements.' }), [], 'fr').lang).toBe('fr');
    expect(resolveCVDocumentLocale(cv({}), [], 'ar')).toEqual({ lang: 'ar', dir: 'rtl' });
  });

  it('honours an explicit document language', () => {
    expect(resolveCVDocumentLocale(cv({ summary: 'English text here please' }, { documentLanguage: 'de' }), [], 'en').lang).toBe('de');
    // 'auto' means detect.
    expect(resolveCVDocumentLocale(cv({ summary: 'English text here please' }, { documentLanguage: 'auto' }), [], 'en').lang).toBe('en');
  });
});

describe('formatDocDate', () => {
  it('is byte-identical to the old English output', () => {
    expect(formatDocDate('2021-01')).toBe('Jan 2021');
    expect(formatDocDate('2020-09', 'en')).toBe('Sep 2020');
    expect(formatDocDate('present')).toBe('Present');
    expect(formatDocDate('2024')).toBe('2024');
    expect(formatDocDate('Summer 2019')).toBe('Summer 2019');
    expect(formatDocDate('')).toBe('');
  });

  it('localises month names and "Present", with Latin digits for Arabic', () => {
    expect(formatDocDate('2021-01', 'fr')).toMatch(/janv\.? 2021/);
    expect(formatDocDate('2021-03', 'de')).toMatch(/März 2021/);
    expect(formatDocDate('Present', 'es')).toBe(cvDocLabels('es').present);
    const ar = formatDocDate('2021-01', 'ar');
    expect(ar).toContain('2021');
    expect(ar).not.toMatch(/[٠-٩]/);
  });

  it('builds ranges like the templates did', () => {
    expect(formatDocDateRange('2021-01', null, 'en', { openEndedIsPresent: true })).toBe('Jan 2021 – Present');
    expect(formatDocDateRange('2021-01', '2022-02', 'en', { current: true })).toBe('Jan 2021 – Present');
    expect(formatDocDateRange('2014-09', '2018-05', 'en')).toBe('Sep 2014 – May 2018');
    expect(formatDocDateRange('', '', 'en', { openEndedIsPresent: true })).toBe('Present');
    expect(formatDocDateRange('2019', '', 'en')).toBe('2019');
  });
});

describe('splitLegacyRange (old education "Years" field)', () => {
  it('splits a typed range and leaves real dates alone', () => {
    expect(splitLegacyRange('2019 - 2023')).toEqual({ start: '2019', end: '2023' });
    expect(splitLegacyRange('2019–2023')).toEqual({ start: '2019', end: '2023' });
    expect(splitLegacyRange('2019-2023')).toEqual({ start: '2019', end: '2023' });
    expect(splitLegacyRange('2019-12')).toBeNull();
    expect(splitLegacyRange('2019')).toBeNull();
    expect(splitLegacyRange(undefined)).toBeNull();
  });
});

describe('genericItemParts', () => {
  it('renders every project field the editor collects', () => {
    const p = genericItemParts({ name: 'Ledger', description: 'CLI', url: 'github.com/a/ledger', technologies: ['Rust', 'SQLite'], startDate: '2022-01', endDate: '2023-06' }, 'projects', 'en');
    expect(p.label).toBe('Ledger');
    expect(p.date).toBe('Jan 2022 – Jun 2023');
    expect(p.lines.map((l) => l.text)).toEqual(['CLI', 'Technologies: Rust, SQLite', 'github.com/a/ledger']);
    expect(p.lines[2].href).toBe('https://github.com/a/ledger');
  });

  it('renders certification issuer, expiry, credential ID and URL', () => {
    const p = genericItemParts({ name: 'AWS SA', issuer: 'Amazon', date: '2023-04', expiryDate: '2026-04', credentialId: 'X1', url: 'https://aws.example/v' }, 'certifications', 'en');
    expect(p.date).toBe('Apr 2023');
    expect(p.lines.map((l) => [l.kind, l.text])).toEqual([
      ['subtitle', 'Amazon'], ['meta', 'Expires Apr 2026 · Credential ID: X1'], ['link', 'https://aws.example/v'],
    ]);
  });
});

describe('toHref', () => {
  it('builds link targets only for values that look like links', () => {
    expect(toHref('email', 'a@b.co')).toBe('mailto:a@b.co');
    expect(toHref('email', 'not an email')).toBeUndefined();
    expect(toHref('phone', '+44 20 7946 0000')).toBe('tel:+442079460000');
    expect(toHref('url', 'linkedin.com/in/x')).toBe('https://linkedin.com/in/x');
    expect(toHref('url', 'https://x.dev')).toBe('https://x.dev');
    expect(toHref('url', 'my portfolio')).toBeUndefined();
  });
});
