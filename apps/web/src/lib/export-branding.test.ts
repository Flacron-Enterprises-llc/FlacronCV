import { describe, it, expect, vi } from 'vitest';
import { __testables, EXPORT_BRANDING_TEXT } from './export-cv';

/** Free exports carry a small "Made with FlacronCV" mark on every page. */
describe('export branding mark', () => {
  it('writes the mark once per page, centred in the bottom margin', () => {
    const text = vi.fn();
    const pdf = {
      internal: { pageSize: { getWidth: () => 210, getHeight: () => 297 } },
      setPage: vi.fn(),
      setFont: vi.fn(),
      setFontSize: vi.fn(),
      setTextColor: vi.fn(),
      text,
    };
    __testables.addBrandingMark(pdf as never, 3);
    expect(text).toHaveBeenCalledTimes(3);
    expect(text).toHaveBeenCalledWith(EXPORT_BRANDING_TEXT, 105, 294.5, { align: 'center' });
    expect(pdf.setPage.mock.calls.map((c) => c[0])).toEqual([1, 2, 3]);
    expect(EXPORT_BRANDING_TEXT).toBe('Made with FlacronCV');
  });
});
