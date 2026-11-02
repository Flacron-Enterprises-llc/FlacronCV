import { describe, expect, it } from 'vitest';
import { portfolioPath } from './portfolio';

describe('portfolio paths', () => {
  it('keeps the same path when only the display name would change', () => {
    const slug = 'ab12cd34ef56';
    expect(portfolioPath('en', slug)).toBe('/en/p/ab12cd34ef56');
    expect(portfolioPath('en', slug)).not.toContain('Ada');
    expect(portfolioPath('fr', slug, 'one-time-token')).toBe('/fr/p/ab12cd34ef56?token=one-time-token');
  });
});
