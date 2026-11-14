import { describe, expect, it } from 'vitest';
import { DEFAULT_PORTFOLIO_SECTIONS, portfolioPath, portfolioSections } from './portfolio';

describe('portfolio paths', () => {
  it('keeps the same path when only the display name would change', () => {
    const slug = 'ab12cd34ef56';
    expect(portfolioPath('en', slug)).toBe('/en/portfolio/ab12cd34ef56');
    expect(portfolioPath('en', slug)).not.toContain('Ada');
    expect(portfolioPath('fr', slug, 'one-time-token')).toBe('/fr/portfolio/ab12cd34ef56?token=one-time-token');
  });
});

describe('portfolio sections', () => {
  it('keeps defaults for anything missing or malformed', () => {
    expect(portfolioSections(undefined)).toEqual(DEFAULT_PORTFOLIO_SECTIONS);
    expect(portfolioSections({ contact: false, skills: 'no', extra: true })).toEqual({ ...DEFAULT_PORTFOLIO_SECTIONS, contact: false });
    expect(portfolioSections([false])).toEqual(DEFAULT_PORTFOLIO_SECTIONS);
  });
});
