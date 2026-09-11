import { describe, it, expect } from 'vitest';
import { localizedTemplateField, templateSearchHaystack } from './localized-template';

const nameLocalized = {
  en: 'Classic',
  es: 'Clásico',
  fr: 'Classique',
  de: 'Klassisch',
  ar: 'كلاسيكي',
  ur: 'کلاسک',
};

describe('localizedTemplateField', () => {
  it('prefers the active locale, then en, then the English fallback field', () => {
    expect(localizedTemplateField(nameLocalized, 'Classic', 'es')).toBe('Clásico');
    expect(localizedTemplateField({ en: 'Classic' }, 'Classic', 'es')).toBe('Classic');
    expect(localizedTemplateField({}, 'Classic', 'es')).toBe('Classic');
    expect(localizedTemplateField(undefined, 'Classic', 'es')).toBe('Classic');
  });
});

describe('templateSearchHaystack', () => {
  const tmpl = {
    name: 'Classic',
    description: 'A clean two-column layout',
    nameLocalized,
    descriptionLocalized: {},
  };

  it('matches the localized name and the English name from any locale', () => {
    const es = templateSearchHaystack(tmpl, 'es');
    expect(es).toContain('clásico');
    expect(es).toContain('classic');
    expect(es).toContain('a clean two-column layout');
  });
});
