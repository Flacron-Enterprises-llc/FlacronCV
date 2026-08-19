import { describe, it, expect } from 'vitest';
import { contrastRatio } from './design-tokens';

/**
 * Light-mode header/footer sit on `chrome` (`#1e3a5f`). Every pair below is an
 * acceptance criterion from the navy-chrome batch: WCAG AA (4.5:1) for body
 * text and links, not merely "looks fine".
 */
const CHROME = '#1e3a5f';

describe('chrome navy contrast (WCAG AA)', () => {
  it('white headings pass (measured 11.50:1)', () => {
    const ratio = contrastRatio('#ffffff', CHROME);
    expect(ratio).toBeGreaterThanOrEqual(4.5);
    expect(ratio).toBeCloseTo(11.50, 1);
  });

  it('stone-300 body and links pass (measured 7.72:1)', () => {
    const ratio = contrastRatio('#d6d3d1', CHROME);
    expect(ratio).toBeGreaterThanOrEqual(4.5);
    expect(ratio).toBeCloseTo(7.72, 1);
  });

  it('brand-400 link hover passes (measured 5.08:1)', () => {
    const ratio = contrastRatio('#fb923c', CHROME);
    expect(ratio).toBeGreaterThanOrEqual(4.5);
    expect(ratio).toBeCloseTo(5.08, 1);
  });

  it('stone-200 PoweredBy brand link passes (measured 9.16:1)', () => {
    const ratio = contrastRatio('#e7e5e4', CHROME);
    expect(ratio).toBeGreaterThanOrEqual(4.5);
    expect(ratio).toBeCloseTo(9.16, 1);
  });

  it('the colours we must not use on chrome fail AA', () => {
    expect(contrastRatio('#78716c', CHROME)).toBeLessThan(4.5); // stone-500
    expect(contrastRatio('#57534e', CHROME)).toBeLessThan(4.5); // stone-600
    expect(contrastRatio('#ea580c', CHROME)).toBeLessThan(4.5); // brand-600
  });
});
