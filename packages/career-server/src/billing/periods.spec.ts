import { addMonthsUtc, periodContaining } from './periods';

const iso = (d: Date) => d.toISOString();

describe('addMonthsUtc', () => {
  it('clamps 31 January to the end of February and returns to the 31st in March', () => {
    const anchor = new Date('2026-01-31T09:30:00Z');
    expect(iso(addMonthsUtc(anchor, 1))).toBe('2026-02-28T09:30:00.000Z');
    expect(iso(addMonthsUtc(anchor, 2))).toBe('2026-03-31T09:30:00.000Z');
    expect(iso(addMonthsUtc(anchor, 13))).toBe('2027-02-28T09:30:00.000Z');
  });

  it('uses 29 February in a leap year', () => {
    expect(iso(addMonthsUtc(new Date('2028-01-31T00:00:00Z'), 1))).toBe('2028-02-29T00:00:00.000Z');
  });

  it('crosses a year and goes backwards', () => {
    const anchor = new Date('2026-11-15T00:00:00Z');
    expect(iso(addMonthsUtc(anchor, 3))).toBe('2027-02-15T00:00:00.000Z');
    expect(iso(addMonthsUtc(anchor, -11))).toBe('2025-12-15T00:00:00.000Z');
  });
});

describe('periodContaining', () => {
  it('starts on the anniversary, not on the 1st', () => {
    const p = periodContaining(new Date('2026-03-15T00:00:00Z'), new Date('2026-04-14T23:59:59Z'));
    expect(iso(p.start)).toBe('2026-03-15T00:00:00.000Z');
    expect(iso(p.end)).toBe('2026-04-15T00:00:00.000Z');
  });

  it('moves to the next period exactly at the anniversary instant', () => {
    const p = periodContaining(new Date('2026-03-15T00:00:00Z'), new Date('2026-04-15T00:00:00Z'));
    expect(iso(p.start)).toBe('2026-04-15T00:00:00.000Z');
    expect(iso(p.end)).toBe('2026-05-15T00:00:00.000Z');
  });

  it('handles an anchor on the 31st across short months', () => {
    const anchor = new Date('2025-03-31T10:00:00Z');
    const p = periodContaining(anchor, new Date('2026-10-16T00:00:00Z'));
    expect(iso(p.start)).toBe('2026-09-30T10:00:00.000Z');
    expect(iso(p.end)).toBe('2026-10-31T10:00:00.000Z');
  });
});
