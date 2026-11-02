import { describe, expect, it } from 'vitest';
import { applicationCalendar, isApplicationStatus, isDateOnly } from './applications';

describe('applications', () => {
  it('accepts the seven stages and a real calendar day', () => {
    expect(isApplicationStatus('applied')).toBe(true);
    expect(isApplicationStatus('submitted')).toBe(false);
    expect(isDateOnly('2026-10-17')).toBe(true);
    expect(isDateOnly('2026-02-31')).toBe(false);
    expect(isDateOnly('2026-10')).toBe(false);
  });

  it('writes a calendar file from the reminder and does not call it a hire chance', () => {
    const body = applicationCalendar({
      applicationId: 'app-1',
      title: 'SQL analyst',
      deadline: '2026-11-01',
      reminders: [{ id: 'rem-1', remindAt: '2026-10-20T09:00:00Z' }],
    });
    expect(body).toContain('BEGIN:VCALENDAR');
    expect(body).toContain('SUMMARY:SQL analyst');
    expect(body).toContain('DTSTART:20261020T090000Z');
    expect(body).not.toContain('hiring');
  });
});
