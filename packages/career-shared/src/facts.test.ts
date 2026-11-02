import { describe, expect, it } from 'vitest';
import {
  comparePartialDates,
  countFacts,
  importDay,
  isPartialDate,
  missingRequiredFields,
  validateFactValue,
  validatePreferences,
} from './facts';

describe('partial dates', () => {
  it('keeps the precision the source gave', () => {
    expect(isPartialDate('2020')).toBe(true);
    expect(isPartialDate('2020-03')).toBe(true);
    expect(isPartialDate('2024-02-29')).toBe(true);
  });

  it('refuses dates that do not exist or are not ISO', () => {
    expect(isPartialDate('2023-02-29')).toBe(false);
    expect(isPartialDate('2020-13')).toBe(false);
    expect(isPartialDate('03/2020')).toBe(false);
    expect(isPartialDate('Summer 2019')).toBe(false);
    expect(isPartialDate('1850')).toBe(false);
  });

  it('compares at the shared precision', () => {
    expect(comparePartialDates('2020', '2020-05')).toBe(0);
    expect(comparePartialDates('2021-01', '2020-12')).toBe(1);
    expect(comparePartialDates('2019-12-31', '2020')).toBe(-1);
  });
});

describe('validateFactValue', () => {
  it('lets a draft be incomplete and lists every field', () => {
    const result = validateFactValue('experience', { company: '  Acme  ' }, 'draft');
    expect(result).toEqual({
      ok: true,
      value: {
        position: null,
        company: 'Acme',
        location: null,
        startDate: null,
        endDate: null,
        current: null,
        responsibilities: null,
      },
    });
    if (result.ok) expect(missingRequiredFields('experience', result.value)).toEqual(['position']);
  });

  it('needs required fields to confirm', () => {
    expect(validateFactValue('experience', { company: 'Acme' }, 'confirmed')).toEqual({
      ok: false,
      errors: [{ field: 'position', reason: 'required' }],
    });
  });

  it('checks formats in a draft too, so a bad date is never stored', () => {
    const result = validateFactValue('experience', { startDate: 'March 2020' }, 'draft');
    expect(result).toEqual({ ok: false, errors: [{ field: 'startDate', reason: 'invalid_date' }] });
  });

  it('refuses an end before the start, and an end date on a current role', () => {
    const order = validateFactValue('education', { institution: 'U', startDate: '2020-09', endDate: '2019' }, 'draft');
    expect(order.ok).toBe(false);
    if (!order.ok) expect(order.errors).toEqual([{ field: 'endDate', reason: 'date_order' }]);
    const current = validateFactValue('experience', { current: true, endDate: '2022' }, 'draft');
    expect(current.ok).toBe(false);
    if (!current.ok) expect(current.errors).toEqual([{ field: 'endDate', reason: 'current_with_end_date' }]);
  });

  it('refuses unknown fields and wrong types', () => {
    const result = validateFactValue('skill', { name: 'SQL', level: 'expert' }, 'draft');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors).toEqual([{ field: 'level', reason: 'unknown_field' }]);
    expect(validateFactValue('skill', ['SQL'], 'draft').ok).toBe(false);
    const typed = validateFactValue('experience', { current: 'yes' }, 'draft');
    expect(typed.ok).toBe(false);
  });

  it('adds https to a bare url and refuses other schemes', () => {
    const result = validateFactValue('contact', { fullName: 'Ada', linkedin: 'linkedin.com/in/ada' }, 'confirmed');
    expect(result.ok && result.value.linkedin).toBe('https://linkedin.com/in/ada');
    expect(validateFactValue('contact', { website: 'javascript:alert(1)' }, 'draft').ok).toBe(false);
  });

  it('dedupes list items, drops blanks, and caps length', () => {
    const result = validateFactValue('project', { name: 'X', technologies: ['Go', ' Go ', '', 'SQL'] }, 'draft');
    expect(result.ok && result.value.technologies).toEqual(['Go', 'SQL']);
    const long = validateFactValue('summary', { text: 'x'.repeat(5001) }, 'draft');
    expect(long.ok).toBe(false);
  });

  it('keeps an achievement without a number empty, not filled', () => {
    const result = validateFactValue('achievement', { statement: 'Led the migration' }, 'confirmed');
    expect(result.ok && result.value.metric).toBeNull();
  });

  it('only takes a uuid as an experience link', () => {
    expect(validateFactValue('achievement', { experienceFactId: 'not-a-uuid' }, 'draft').ok).toBe(false);
  });
});

describe('countFacts', () => {
  it('counts confirmed facts and names core sections still unconfirmed', () => {
    const counts = countFacts([
      { factType: 'contact', confirmation: 'confirmed', uncertain: {} },
      { factType: 'experience', confirmation: 'draft', uncertain: { startDate: { reason: 'unparsed_date' } } },
      { factType: 'skill', confirmation: 'confirmed', uncertain: {} },
    ]);
    expect(counts).toEqual({
      confirmed: 2,
      draft: 1,
      uncertain: 1,
      missingCore: ['summary', 'experience', 'education'],
    });
  });
});

describe('validatePreferences', () => {
  it('fills missing keys with empty defaults', () => {
    expect(validatePreferences({ targetRoles: ['Data analyst', 'Data analyst '] })).toEqual({
      ok: true,
      value: {
        targetRoles: ['Data analyst'],
        locations: [],
        arrangements: [],
        schedules: [],
        seniority: null,
        minimumPay: null,
        learningHoursPerWeek: null,
        careerGoals: null,
      },
    });
  });

  it('refuses values outside the lists and malformed pay', () => {
    const result = validatePreferences({
      arrangements: ['remote', 'beach'],
      minimumPay: { amount: 50000.5, currency: 'usd', period: 'year' },
      learningHoursPerWeek: 200,
      extra: true,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.map((e) => e.field).sort()).toEqual([
        'arrangements',
        'extra',
        'learningHoursPerWeek',
        'minimumPay',
      ]);
    }
  });

  it('accepts whole-unit pay in an ISO currency', () => {
    const result = validatePreferences({ minimumPay: { amount: 55000, currency: 'EUR', period: 'year' } });
    expect(result.ok && result.value.minimumPay).toEqual({ amount: 55000, currency: 'EUR', period: 'year' });
  });
});

describe('importDay', () => {
  it('is the UTC day, reset at the next UTC midnight', () => {
    const { day, resetsAt } = importDay(new Date('2026-10-16T23:30:00-05:00'));
    expect(day).toBe('2026-10-17');
    expect(resetsAt.toISOString()).toBe('2026-10-18T00:00:00.000Z');
  });
});
