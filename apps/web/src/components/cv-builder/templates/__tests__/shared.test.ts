import { describe, it, expect } from 'vitest';
import {
  formatDegree, contrastRatio, readableOn, ensureDarkSurface,
  luminance, lighten, formatCVDate,
} from '../shared';

// The accent colours the template gallery actually offers, plus the two
// extremes a colour picker allows. Anything derived from the user's accent has
// to hold up across this whole row, not just the mid-tone navy the templates
// were designed around.
const ACCENTS = [
  '#1e3a5f', // navy      (default)
  '#2563eb', // blue
  '#0f766e', // teal
  '#7c3aed', // violet
  '#b91c1c', // red
  '#c9a84c', // gold
  '#e8c766', // pale gold  — the case that broke white-on-accent panels
  '#f5f5dc', // beige      — near-white
  '#1a1a1a', // near-black
  '#000000',
  '#ffffff',
];

const SLATE = '#1a2332'; // Slate & Gold sidebar
const WHITE = '#ffffff';

describe('formatDegree', () => {
  it('joins a bare degree and its field', () => {
    expect(formatDegree({ degree: 'Bachelor of Science', field: 'Computer Science' }))
      .toBe('Bachelor of Science in Computer Science');
  });

  // The regression this function exists for: both boxes filled, the degree box
  // already containing the field, rendering as "… in Computer Science in
  // Computer Science" on every layout and in the exported PDF.
  it('does not repeat a field the degree already states', () => {
    expect(formatDegree({ degree: 'Bachelor of Science in Computer Science', field: 'Computer Science' }))
      .toBe('Bachelor of Science in Computer Science');
  });

  it('ignores case and punctuation when deciding', () => {
    expect(formatDegree({ degree: 'B.Sc. in COMPUTER SCIENCE', field: 'Computer Science' }))
      .toBe('B.Sc. in COMPUTER SCIENCE');
  });

  // Whole-word matching: "Bachelor of Arts" must not be read as already
  // containing "Liberal Arts" just because the substring "Arts" appears.
  it('matches on whole words, not substrings', () => {
    expect(formatDegree({ degree: 'Bachelor of Arts', field: 'Liberal Arts' }))
      .toBe('Bachelor of Arts in Liberal Arts');
  });

  it('handles either box being empty', () => {
    expect(formatDegree({ degree: 'MBA', field: '' })).toBe('MBA');
    expect(formatDegree({ degree: '', field: 'Economics' })).toBe('Economics');
    expect(formatDegree({ degree: '  ', field: '  ' })).toBe('');
    expect(formatDegree({})).toBe('');
    expect(formatDegree({ degree: null, field: null })).toBe('');
  });
});

describe('contrastRatio', () => {
  it('anchors at the known endpoints', () => {
    expect(contrastRatio('#000000', '#ffffff')).toBeCloseTo(21, 1);
    expect(contrastRatio('#ffffff', '#ffffff')).toBeCloseTo(1, 5);
  });

  it('is symmetric', () => {
    expect(contrastRatio('#1e3a5f', WHITE)).toBeCloseTo(contrastRatio(WHITE, '#1e3a5f'), 10);
  });

  it('falls back to the default accent for malformed input rather than NaN', () => {
    expect(Number.isFinite(contrastRatio('not-a-colour', WHITE))).toBe(true);
    expect(Number.isFinite(luminance('#xyz'))).toBe(true);
  });
});

describe('readableOn', () => {
  it('returns an already-legible accent untouched', () => {
    // Navy on white passes comfortably — the common case must be a no-op so
    // existing CVs render byte-identically.
    expect(readableOn('#1e3a5f', WHITE, 4.0)).toBe('#1e3a5f');
  });

  it.each(ACCENTS)('lifts %s to the requested ratio on the slate sidebar', (accent) => {
    expect(contrastRatio(readableOn(accent, SLATE, 4.5), SLATE)).toBeGreaterThanOrEqual(4.5);
  });

  it.each(ACCENTS)('darkens %s to the requested ratio on white', (accent) => {
    expect(contrastRatio(readableOn(accent, WHITE, 4.0), WHITE)).toBeGreaterThanOrEqual(4.0);
  });

  it('moves toward white on a dark ground and toward black on a light one', () => {
    expect(luminance(readableOn('#1a1a1a', SLATE, 4.5))).toBeGreaterThan(luminance('#1a1a1a'));
    expect(luminance(readableOn('#e8c766', WHITE, 4.0))).toBeLessThan(luminance('#e8c766'));
  });
});

describe('ensureDarkSurface', () => {
  // Every mark on the Corporate sidebar and the Creative header band is white.
  it.each(ACCENTS)('makes %s dark enough to carry white text', (accent) => {
    expect(contrastRatio(WHITE, ensureDarkSurface(accent))).toBeGreaterThanOrEqual(5);
  });

  it('leaves an already-dark accent alone', () => {
    expect(ensureDarkSurface('#1e3a5f')).toBe('#1e3a5f');
  });
});

describe('lighten', () => {
  it('mixes toward white and saturates at it', () => {
    expect(lighten('#000000', 0)).toBe('#000000');
    expect(lighten('#000000', 1)).toBe('#ffffff');
    expect(lighten('#808080', 0.5)).toBe('#c0c0c0');
  });
});

// Guarding the existing formatter alongside the new helpers — the date column
// is the other place where a CV silently renders raw stored values.
describe('formatCVDate', () => {
  it('humanises a stored year-month', () => {
    expect(formatCVDate('2021-01')).toBe('Jan 2021');
    expect(formatCVDate('2020-12')).toBe('Dec 2020');
  });

  it('passes through year-only and freeform values', () => {
    expect(formatCVDate('2024')).toBe('2024');
    expect(formatCVDate('Summer 2019')).toBe('Summer 2019');
  });

  it('rejects an out-of-range month rather than indexing past the array', () => {
    expect(formatCVDate('2021-13')).toBe('2021-13');
    expect(formatCVDate('2021-00')).toBe('2021-00');
  });

  it('is empty for empty input', () => {
    expect(formatCVDate('')).toBe('');
    expect(formatCVDate(null)).toBe('');
    expect(formatCVDate(undefined)).toBe('');
  });
});
