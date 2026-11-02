import { describe, expect, it } from 'vitest';
import { channelAllowed, digestAllowed, inQuietHours, quietWindow, scheduleDue, scheduleWithinPlan } from './alerts';

describe('alerts', () => {
  it('keeps Free on a weekly email and lets Professional use push', () => {
    expect(digestAllowed('weekly_email', 'weekly')).toBe(true);
    expect(digestAllowed('weekly_email', 'daily')).toBe(false);
    expect(digestAllowed('weekly_email', 'immediate')).toBe(false);
    expect(digestAllowed('daily_email', 'daily')).toBe(true);
    expect(digestAllowed('immediate_optional', 'immediate')).toBe(true);
    expect(channelAllowed('weekly_email', 'push')).toBe(false);
    expect(channelAllowed('weekly_email', 'telegram')).toBe(false);
    expect(channelAllowed('immediate_optional', 'push')).toBe(true);
    expect(scheduleWithinPlan('weekly', 'daily')).toBe(false);
    expect(scheduleWithinPlan('daily', 'daily')).toBe(true);
  });

  it('treats a window that passes midnight as quiet, and an equal pair as invalid', () => {
    expect(quietWindow('22:00', '07:00')).toEqual({ ok: true, start: '22:00', end: '07:00' });
    expect(quietWindow(null, null)).toEqual({ ok: true, start: null, end: null });
    expect(quietWindow('09:00', '09:00').ok).toBe(false);
    expect(quietWindow('09:00', null).ok).toBe(false);
    const night = new Date('2026-10-16T23:30:00Z');
    const morning = new Date('2026-10-16T06:00:00Z');
    const noon = new Date('2026-10-16T12:00:00Z');
    expect(inQuietHours(night, '22:00', '07:00')).toBe(true);
    expect(inQuietHours(morning, '22:00', '07:00')).toBe(true);
    expect(inQuietHours(noon, '22:00', '07:00')).toBe(false);
    expect(inQuietHours(noon, null, null)).toBe(false);
  });

  it('is due when a match has never run, and not due inside a week', () => {
    const now = new Date('2026-10-16T09:00:00Z');
    expect(scheduleDue(null, 'weekly', now)).toBe(true);
    expect(scheduleDue(new Date('2026-10-16T05:00:00Z'), 'weekly', now)).toBe(false);
    expect(scheduleDue(new Date('2026-10-08T09:00:00Z'), 'weekly', now)).toBe(true);
  });
});
