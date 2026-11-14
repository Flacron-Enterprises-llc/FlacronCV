import { describe, expect, it } from 'vitest';
import { formatUsd } from './format-price';

describe('formatUsd', () => {
  it('prints exactly one dollar sign in English', () => {
    expect(formatUsd(59.89, 'en')).toBe('$59.89');
    expect(formatUsd(59.89, 'en').match(/\$/g)).toHaveLength(1);
  });

  it('drops the cents on whole amounts', () => {
    expect(formatUsd(0, 'en')).toBe('$0');
    expect(formatUsd(10, 'en')).toBe('$10');
  });

  it('keeps two decimals once there are cents', () => {
    expect(formatUsd(4.5, 'en')).toBe('$4.50');
  });

  it('follows the locale for separators and symbol placement', () => {
    const fr = formatUsd(59.89, 'fr');
    expect(fr).toContain('59,89');
    expect(fr).toContain('$');
    expect(fr.match(/\$/g)).toHaveLength(1);
  });

  it('keeps Latin digits in Arabic and Urdu', () => {
    expect(formatUsd(59.89, 'ar')).toMatch(/59/);
    expect(formatUsd(59.89, 'ur')).toMatch(/59/);
  });
});
