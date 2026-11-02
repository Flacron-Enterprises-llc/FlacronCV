import { describe, expect, it } from 'vitest';
import { PLANS } from './catalog';
import { formatCount, formatUsd, monthlyEquivalentCents } from './money';

describe('formatUsd', () => {
  it('formats 208000 cents as $2,080.00', () => {
    expect(formatUsd(208000)).toBe('$2,080.00');
  });

  it('formats 0 cents as $0', () => {
    expect(formatUsd(0)).toBe('$0');
  });

  it('formats 3899 cents as $38.99', () => {
    expect(formatUsd(3899)).toBe('$38.99');
  });
});

describe('formatCount', () => {
  it('formats 2000 as 2,000', () => {
    expect(formatCount(2000)).toBe('2,000');
  });
});

describe('annual to monthly, rounded half up', () => {
  it('formats the catalog annual price divided by 12', () => {
    expect(formatUsd(monthlyEquivalentCents(PLANS.starter.annualCents))).toBe('$18.33');
    expect(formatUsd(monthlyEquivalentCents(PLANS.professional.annualCents))).toBe('$32.49');
    expect(formatUsd(monthlyEquivalentCents(PLANS.career_pro.annualCents))).toBe('$57.49');
    expect(formatUsd(monthlyEquivalentCents(PLANS.business.annualCents))).toBe('$173.33');
  });
});
