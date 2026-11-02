import { describe, expect, it } from 'vitest';
import { isLaunchLocale, LEGAL_VERSIONS, needsLegalAcceptance } from './account';

const current = {
  termsVersion: LEGAL_VERSIONS.terms,
  privacyVersion: LEGAL_VERSIONS.privacy,
  disclaimerVersion: LEGAL_VERSIONS.disclaimer,
};

describe('legal acceptance', () => {
  it('keeps V1 version 2026-08-16, so a copied acceptance is current', () => {
    expect(LEGAL_VERSIONS).toEqual({ terms: '2026-08-16', privacy: '2026-08-16', disclaimer: '2026-08-16' });
    expect(needsLegalAcceptance(current, 'migrated')).toBe(false);
  });

  it('asks again when any one version moved', () => {
    expect(needsLegalAcceptance({ ...current, privacyVersion: '2019-01-01' }, 'v2')).toBe(true);
    expect(needsLegalAcceptance({ ...current, disclaimerVersion: '2019-01-01' }, 'migrated')).toBe(true);
  });

  it('grandfathers a copied V1 account with no row, and asks a new V2 account', () => {
    expect(needsLegalAcceptance(null, 'migrated')).toBe(false);
    expect(needsLegalAcceptance(null, 'v2')).toBe(true);
  });
});

describe('launch locales', () => {
  it('accepts en and fr only', () => {
    expect(isLaunchLocale('en')).toBe(true);
    expect(isLaunchLocale('fr')).toBe(true);
    expect(isLaunchLocale('es')).toBe(false);
    expect(isLaunchLocale(undefined)).toBe(false);
  });
});
