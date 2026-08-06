import { describe, it, expect } from 'vitest';
import { toDate, formatDate } from './format-date';

describe('toDate', () => {
  describe('date-only strings are read in LOCAL time', () => {
    /**
     * `new Date('2026-08-03')` is UTC midnight per spec. Formatting that for a
     * viewer west of UTC renders 2 August — so an "applied date" or an
     * interview reminder picked from an <input type="date"> displayed a day
     * early for every user in the Americas. These values carry no timezone;
     * the user means the calendar day they chose.
     */
    it('keeps the calendar day the user picked', () => {
      const d = toDate('2026-08-03')!;
      expect(d.getFullYear()).toBe(2026);
      expect(d.getMonth()).toBe(7); // 0-indexed August
      expect(d.getDate()).toBe(3);
    });

    it('formats to the same day it was given', () => {
      expect(formatDate('2026-08-03', { day: 'numeric', month: 'short', year: 'numeric' }, 'en-GB'))
        .toBe('3 Aug 2026');
    });

    it('handles a year boundary without slipping into the previous year', () => {
      const d = toDate('2026-01-01')!;
      expect(d.getFullYear()).toBe(2026);
      expect(d.getMonth()).toBe(0);
      expect(d.getDate()).toBe(1);
    });
  });

  describe('other shapes still parse', () => {
    it('full ISO timestamps keep their instant', () => {
      const d = toDate('2026-08-03T14:30:00.000Z')!;
      expect(d.toISOString()).toBe('2026-08-03T14:30:00.000Z');
    });

    it('datetime-local strings (no zone) parse as local', () => {
      const d = toDate('2026-08-03T14:30')!;
      expect(d.getHours()).toBe(14);
      expect(d.getMinutes()).toBe(30);
    });

    it("firebase-admin's _seconds timestamp shape", () => {
      // This is the shape that silently produced blank dates across 18 pages.
      const d = toDate({ _seconds: 1785312000, _nanoseconds: 0 })!;
      expect(d).toBeInstanceOf(Date);
      expect(Number.isNaN(d.getTime())).toBe(false);
    });

    it('the v9 seconds shape', () => {
      const d = toDate({ seconds: 1785312000, nanoseconds: 0 })!;
      expect(Number.isNaN(d.getTime())).toBe(false);
    });

    it('a live Timestamp with toDate()', () => {
      const when = new Date('2026-08-03T00:00:00.000Z');
      expect(toDate({ toDate: () => when })).toEqual(when);
    });

    it('a real Date passes through', () => {
      const when = new Date('2026-08-03T00:00:00.000Z');
      expect(toDate(when)).toBe(when);
    });
  });

  describe('absent and invalid values', () => {
    it.each([null, undefined, '', 'not a date', {}, NaN])('%p → null', (value) => {
      expect(toDate(value)).toBeNull();
    });

    it('formatDate renders an em dash rather than an empty string', () => {
      expect(formatDate(null)).toBe('—');
      expect(formatDate(undefined)).toBe('—');
    });
  });
});
