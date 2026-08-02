import { describe, it, expect } from 'vitest';
import { resolveFont, resolveFontSize, getCLTokens, A4_PAGE_PX } from '../shared';
import { contrastRatio } from '@/lib/design-tokens';

const WHITE = '#ffffff';

/** Every accent the editor can produce: eight swatches plus the extremes. */
const ACCENTS = [
  '#2563eb', '#0f766e', '#7c3aed', '#dc2626',
  '#1e3a5f', '#374151', '#c2410c', '#0c4a6e',
  '#e8c766', '#f5f5dc', '#ffffff', '#000000', '#0c0c0c',
];

describe('A4_PAGE_PX', () => {
  // The templates hardcoded 842 — A4 height in POINTS — inside a box whose
  // width is 794px, A4 width in PIXELS. Two DPI systems, one page.
  it('is A4 height in CSS px at the same dpi as the 794px capture width', () => {
    expect(A4_PAGE_PX).toBe(1122);
    // 794 x 1122 is A4's 1:√2 within a pixel.
    expect(A4_PAGE_PX / 794).toBeCloseTo(Math.SQRT2, 2);
  });
});

describe('resolveFont', () => {
  // The bug: next/font registers Inter under a generated name reachable only
  // through --font-inter, so the bare string "Inter" matched nothing and the
  // browser fell back to its standard font. Every default cover letter was
  // silently typeset in Times New Roman.
  it('routes webfonts through their CSS variable', () => {
    expect(resolveFont('Inter')).toContain('var(--font-inter)');
    expect(resolveFont('Roboto')).toContain('var(--font-roboto)');
    expect(resolveFont('Playfair Display')).toContain('var(--font-playfair)');
  });

  it('resolves the stacks the old templates defaulted to, not just bare names', () => {
    // These strings are sitting in real documents — the former per-template
    // defaults. Keying off the whole string would leave them unresolved.
    expect(resolveFont('Inter, sans-serif')).toContain('var(--font-inter)');
    expect(resolveFont('Roboto, sans-serif')).toContain('var(--font-roboto)');
    expect(resolveFont('Georgia, serif')).toContain('Georgia');
  });

  it('gives system families a real stack ending in a generic', () => {
    for (const f of ['Arial', 'Helvetica', 'Verdana', 'Calibri', 'Georgia', 'Times New Roman']) {
      const stack = resolveFont(f);
      expect(stack).toMatch(/(sans-serif|serif)$/);
      expect(stack.toLowerCase()).toContain(f.split(' ')[0].toLowerCase());
    }
  });

  it('always ends in a generic family, whatever it is given', () => {
    for (const f of ['Inter', 'Wingdings', 'Comic Sans MS', 'Not A Font', '', null, undefined]) {
      expect(resolveFont(f as string)).toMatch(/(sans-serif|serif)$/);
    }
  });

  it('quotes an unknown multi-word family and picks a matching generic', () => {
    expect(resolveFont('Comic Sans MS')).toBe('"Comic Sans MS", system-ui, sans-serif');
    expect(resolveFont('EB Garamond')).toBe('"EB Garamond", Georgia, serif');
    expect(resolveFont('Helvetica Neue')).toBe('"Helvetica Neue", system-ui, sans-serif');
  });

  it('falls back to the default family for blank input', () => {
    expect(resolveFont('')).toBe(resolveFont('Inter'));
    expect(resolveFont('   ')).toBe(resolveFont('Inter'));
  });
});

describe('resolveFontSize', () => {
  it('passes through the sizes the editor offers', () => {
    for (const s of ['12px', '14px', '16px', '18px', '20px']) {
      expect(resolveFontSize(s)).toBe(s);
    }
  });

  it('clamps to a range a letter can be read at', () => {
    expect(resolveFontSize('4px')).toBe('11px');
    expect(resolveFontSize('96px')).toBe('20px');
  });

  it('falls back rather than emitting NaNpx', () => {
    expect(resolveFontSize('')).toBe('14px');
    expect(resolveFontSize('large')).toBe('14px');
    expect(resolveFontSize(null)).toBe('14px');
    expect(resolveFontSize(undefined)).toBe('14px');
  });
});

describe('getCLTokens', () => {
  const at = (primaryColor: string) => getCLTokens({ styling: { primaryColor } } as never);

  it.each(ACCENTS)('gives %s an ink that is readable as text on white', (c) => {
    expect(contrastRatio(at(c).ink, WHITE)).toBeGreaterThanOrEqual(4.5);
  });

  // Modern's letterhead carries the sender's name in white on this surface.
  it.each(ACCENTS)('gives %s a band dark enough to carry white text', (c) => {
    expect(contrastRatio('#ffffff', at(c).band)).toBeGreaterThanOrEqual(5);
  });

  it('leaves an already-legible accent untouched, so existing letters do not shift', () => {
    const t = at('#1e3a5f');
    expect(t.ink).toBe('#1e3a5f');
    expect(t.band).toBe('#1e3a5f');
    expect(t.accent).toBe('#1e3a5f');
  });

  it('keeps the raw accent available for decorative rules', () => {
    // A 2px rule reads at any luminance; only text and panels need a floor.
    expect(at('#e8c766').accent).toBe('#e8c766');
    expect(at('#e8c766').ink).not.toBe('#e8c766');
  });

  it('falls back to the template default when no accent is stored', () => {
    expect(getCLTokens({ styling: {} } as never, '#0f766e').accent).toBe('#0f766e');
    expect(getCLTokens({} as never, '#0f766e').accent).toBe('#0f766e');
    expect(getCLTokens({ styling: { primaryColor: '  ' } } as never, '#0f766e').accent).toBe('#0f766e');
  });
});
