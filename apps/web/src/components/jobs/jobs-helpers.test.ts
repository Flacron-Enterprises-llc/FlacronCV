import { describe, it, expect } from 'vitest';
import { followUpState } from './follow-up';
import { documentOptionLabels } from './document-option-labels';

describe('followUpState', () => {
  const now = new Date(2026, 10, 14, 15, 30); // 14 Nov 2026, afternoon, local time

  it('classifies a bare YYYY-MM-DD date by LOCAL calendar day', () => {
    expect(followUpState('2026-11-13', now)).toBe('overdue');
    expect(followUpState('2026-11-14', now)).toBe('today');
    expect(followUpState('2026-11-15', now)).toBe('upcoming');
  });

  it('today stays "today" late at night (no UTC off-by-one)', () => {
    expect(followUpState('2026-11-14', new Date(2026, 10, 14, 23, 59))).toBe('today');
    expect(followUpState('2026-11-14', new Date(2026, 10, 14, 0, 1))).toBe('today');
  });

  it('accepts other date shapes and rejects junk', () => {
    expect(followUpState(new Date(2026, 9, 1), now)).toBe('overdue');
    expect(followUpState('not a date', now)).toBeNull();
    expect(followUpState(null, now)).toBeNull();
  });
});

describe('documentOptionLabels', () => {
  const format = {
    date: (v: unknown) => String(v).slice(0, 10),
    dateTime: (v: unknown) => String(v).replace('T', ' ').slice(0, 16),
    label: (title: string, when: string) => `${title} · ${when}`,
  };

  it('appends the updated date so identical titles can be told apart', () => {
    const labels = documentOptionLabels(
      [
        { id: 'a', title: 'Resume', updatedAt: '2026-11-01T09:00:00' },
        { id: 'b', title: 'Resume', updatedAt: '2026-11-10T09:00:00' },
      ],
      format,
    );
    expect(labels.get('a')).toBe('Resume · 2026-11-01');
    expect(labels.get('b')).toBe('Resume · 2026-11-10');
  });

  it('adds the time when same-titled documents were updated the same day', () => {
    const labels = documentOptionLabels(
      [
        { id: 'a', title: 'Resume', updatedAt: '2026-11-10T09:00:00' },
        { id: 'b', title: 'Resume', updatedAt: '2026-11-10T17:45:00' },
        { id: 'c', title: 'Other', updatedAt: '2026-11-10T08:00:00' },
      ],
      format,
    );
    expect(labels.get('a')).toBe('Resume · 2026-11-10 09:00');
    expect(labels.get('b')).toBe('Resume · 2026-11-10 17:45');
    expect(labels.get('c')).toBe('Other · 2026-11-10');
  });

  it('falls back to the id for an untitled document', () => {
    expect(documentOptionLabels([{ id: 'x1', title: '  ', updatedAt: '2026-11-10' }], format).get('x1')).toBe(
      'x1 · 2026-11-10',
    );
  });
});
