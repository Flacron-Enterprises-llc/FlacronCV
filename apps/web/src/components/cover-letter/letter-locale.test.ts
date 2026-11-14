import { describe, it, expect } from 'vitest';
import type { CoverLetter } from '@flacroncv/shared-types';
import en from '../../../public/locales/en/common.json';
import ar from '../../../public/locales/ar/common.json';
import ur from '../../../public/locales/ur/common.json';
import {
  aiLanguageName,
  buildCoverLetterLabels,
  formatLetterDate,
  inferLetterLocale,
  isRtlLetterLocale,
  resolveLetterLocale,
  salutationComma,
} from './letter-locale';
import { coverLetterTemplateFromParam } from './template-param';

const letter = (over: Partial<CoverLetter> & { letterLocale?: string } = {}) =>
  ({ content: '', ...over }) as CoverLetter & { letterLocale?: string };

describe('resolveLetterLocale', () => {
  it('uses the stored letter language whatever the interface language', () => {
    expect(resolveLetterLocale(letter({ letterLocale: 'en', content: '<p>مرحبا</p>' }), 'ar')).toBe('en');
    expect(resolveLetterLocale(letter({ letterLocale: 'ur' }), 'en')).toBe('ur');
  });

  it('ignores an unsupported stored value and infers instead', () => {
    expect(resolveLetterLocale(letter({ letterLocale: 'pt', content: '<p>Hello there</p>' }), 'en')).toBe('en');
  });
});

describe('inferLetterLocale (letters that predate the field)', () => {
  it('an English letter viewed in /ar is English, not Arabic', () => {
    expect(inferLetterLocale('<p>Dear team, I am applying for the role.</p>', 'ar')).toBe('en');
  });

  it('a Latin-script letter in a Latin-script UI keeps the UI language', () => {
    expect(inferLetterLocale('<p>Madame, Monsieur, je postule…</p>', 'fr')).toBe('fr');
  });

  it('an Arabic-script letter follows an RTL UI, or defaults to Arabic', () => {
    expect(inferLetterLocale('<p>محترم جناب، میں درخواست دیتا ہوں</p>', 'ur')).toBe('ur');
    expect(inferLetterLocale('<p>السيد المحترم، أتقدم بطلبي</p>', 'en')).toBe('ar');
  });

  it('an empty letter takes the interface language', () => {
    expect(inferLetterLocale('', 'de')).toBe('de');
    expect(inferLetterLocale('<p></p>', 'ar')).toBe('ar');
    expect(inferLetterLocale(null, 'xx')).toBe('en');
  });

  it('ignores markup and entities when counting script', () => {
    expect(inferLetterLocale('<p class="x">&nbsp;</p><p>سلام</p>', 'en')).toBe('ar');
  });
});

describe('labels and date in the letter language', () => {
  it('builds the English labels from English messages, regardless of UI', () => {
    const labels = buildCoverLetterLabels(en.coverLetters);
    expect(labels.dear).toBe(en.coverLetters.cl_dear);
    expect(labels.closingSincerely).toBe(en.coverLetters.closing_sincerely);
  });

  it('builds the Arabic labels from Arabic messages', () => {
    expect(buildCoverLetterLabels(ar.coverLetters).dear).toBe(ar.coverLetters.cl_dear);
  });

  it('a missing key yields an empty label rather than throwing', () => {
    expect(buildCoverLetterLabels({}).dear).toBe('');
  });

  it('formats the date the way the letter language does', () => {
    const d = new Date(2026, 10, 14);
    expect(formatLetterDate('en', d)).toBe('November 14, 2026');
    expect(formatLetterDate('de', d)).toBe('14. November 2026');
  });

  it('direction and AI language follow the letter', () => {
    expect(isRtlLetterLocale('ar')).toBe(true);
    expect(isRtlLetterLocale('en')).toBe(false);
    expect(aiLanguageName('ur')).toBe('Urdu');
  });
});

describe('coverLetterTemplateFromParam (/templates → /cover-letters/new)', () => {
  const ids = ['classic', 'modern', 'minimalist', 'creative', 'corporate', 'executive'];

  it('maps the gallery slug to the editor template id', () => {
    expect(coverLetterTemplateFromParam('cl-classic', ids)).toBe('classic');
    expect(coverLetterTemplateFromParam('cl-executive', ids)).toBe('executive');
    expect(coverLetterTemplateFromParam('modern', ids)).toBe('modern');
  });

  it('returns null (caller keeps its default) for unknown or missing values', () => {
    expect(coverLetterTemplateFromParam('cl-academic', ids)).toBeNull();
    expect(coverLetterTemplateFromParam('bold', ids)).toBeNull();
    expect(coverLetterTemplateFromParam('', ids)).toBeNull();
    expect(coverLetterTemplateFromParam(null, ids)).toBeNull();
  });
});

describe('salutationComma', () => {
  it('Arabic and Urdu salutations end in the Arabic comma, others in a Latin comma', () => {
    expect(salutationComma(buildCoverLetterLabels(ar.coverLetters))).toBe('،');
    expect(salutationComma(buildCoverLetterLabels(ur.coverLetters))).toBe('،');
    expect(salutationComma(buildCoverLetterLabels(en.coverLetters))).toBe(',');
    expect(salutationComma({ dear: 'Madame, Monsieur' })).toBe(',');
  });
});
