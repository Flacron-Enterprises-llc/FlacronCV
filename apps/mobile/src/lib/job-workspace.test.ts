import { describe, expect, it } from 'vitest';
import { ApiError } from '../../../../packages/career-api-client/src/client';
import { JobStatus } from '../types/enums';
import {
  draftContextOf,
  draftKeyIsSpent,
  draftProblemOf,
  draftTypesFor,
  followUpCalendarFile,
  formatDateDigits,
  formatDateTimeDigits,
  letterText,
  localDayFromToday,
} from './job-workspace';

const base = { id: 'j1', company: 'Acme', position: 'Designer', jobUrl: 'https://acme.example/jobs/1' };

describe('followUpCalendarFile', () => {
  it('is an all-day event with a stable UID, labelled as a follow-up', () => {
    const file = followUpCalendarFile({ ...base, followUpDate: '2026-12-31' }, new Date('2026-11-01T00:00:00Z'));
    expect(file?.filename).toBe('follow-up-acme-designer.ics');
    expect(file?.content).toContain('UID:j1-follow_up@flacroncv.com');
    expect(file?.content).toContain('DTSTART;VALUE=DATE:20261231');
    expect(file?.content).toContain('DTEND;VALUE=DATE:20270101');
    expect(file?.content).toContain('SUMMARY:Follow up: Designer at Acme');
    expect(file?.content).not.toMatch(/deadline/i);
  });

  it('is null without a real date', () => {
    expect(followUpCalendarFile({ ...base, followUpDate: null })).toBeNull();
    expect(followUpCalendarFile({ ...base, followUpDate: '2026-02-30' })).toBeNull();
  });
});

describe('drafts', () => {
  it('sends only what the person entered', () => {
    expect(
      draftContextOf({
        company: ' Acme ',
        position: 'Designer',
        interviewDate: '2026-12-03T10:00',
        contactName: 'Old',
        contacts: [{ id: 'c', name: 'Sam', role: 'Recruiter', email: null, phone: null, notes: null }],
      }),
    ).toEqual({ organization: 'Acme', role: 'Designer', contactName: 'Sam', contactRole: 'Recruiter', interviewDate: '2026-12-03' });
    expect(draftContextOf({ company: '', position: 'Designer', interviewDate: null, contactName: null })).toEqual({ role: 'Designer' });
  });

  it('offers a referral before applying and thanks after an interview', () => {
    expect(draftTypesFor({ status: JobStatus.SAVED, interviewDate: null })).toEqual(['referral_request']);
    expect(draftTypesFor({ status: JobStatus.APPLIED, interviewDate: '2026-12-03T10:00' })).toEqual(['referral_request', 'thank_you']);
    expect(draftTypesFor({ status: JobStatus.INTERVIEWING, interviewDate: null })).toEqual(['thank_you']);
    expect(draftTypesFor({ status: JobStatus.REJECTED, interviewDate: null })).toEqual([]);
  });

  it('maps refusals to honest states and keeps the key after a lost response', () => {
    expect(draftProblemOf(new ApiError(403, 'ai_consent_declined', {} as never))).toBe('ai_declined');
    expect(draftProblemOf(new ApiError(429, 'quota_exhausted', {} as never))).toBe('quota');
    expect(draftProblemOf(new ApiError(503, 'provider_unavailable', {} as never))).toBe('unavailable');
    expect(draftProblemOf(new ApiError(400, 'validation_error', { reason: 'missing_target' } as never))).toBe('missing_target');
    expect(draftProblemOf(new ApiError(400, 'validation_error', {} as never))).toBe('unsupported');
    expect(draftProblemOf(new Error('network'))).toBe('failed');
    expect(draftKeyIsSpent(new ApiError(400, 'validation_error', {} as never))).toBe(true);
    expect(draftKeyIsSpent(new ApiError(0, 'network_error', {} as never))).toBe(false);
  });
});

describe('letterText', () => {
  it('shows a stored HTML letter as plain text', () => {
    expect(letterText('<p>Dear Sam,</p><p>Thanks &amp; regards</p><script>x</script>')).toBe('Dear Sam,\nThanks & regards\nx');
    expect(letterText('Plain')).toBe('Plain');
  });
});

describe('date entry', () => {
  it('shapes typed digits as a date or a date and time', () => {
    expect(formatDateDigits('2026')).toBe('2026');
    expect(formatDateDigits('20261')).toBe('2026-1');
    expect(formatDateDigits('2026-12-0x5')).toBe('2026-12-05');
    expect(formatDateDigits('2026120599')).toBe('2026-12-05');
    expect(formatDateTimeDigits('202612051')).toBe('2026-12-05T1');
    expect(formatDateTimeDigits('202612051430')).toBe('2026-12-05T14:30');
  });

  it('counts days from today in local time', () => {
    expect(localDayFromToday(0, new Date(2026, 11, 31, 23, 0))).toBe('2026-12-31');
    expect(localDayFromToday(1, new Date(2026, 11, 31, 23, 0))).toBe('2027-01-01');
  });
});
