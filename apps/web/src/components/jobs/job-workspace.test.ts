import { describe, it, expect } from 'vitest';
import { ApiError } from '@flacroncv/career-api-client';
import { JobApplication, JobStatus, normalizeJobApplication } from '@flacroncv/shared-types';
import {
  STATUS_ORDER,
  applicationCalendarFile,
  boardStatus,
  buildAllDayIcsEvent,
  calendarKinds,
  checklistProgress,
  filterJobs,
  groupByStatus,
  letterText,
  statusCounts,
} from './job-workspace';
import { draftTypesFor, problemOf } from './application-drafts';

function job(overrides: Partial<JobApplication> & Record<string, unknown> = {}): JobApplication {
  return normalizeJobApplication({
    id: 'j1',
    userId: 'u1',
    company: 'Acme, Inc.',
    position: 'Engineer',
    status: 'saved',
    createdAt: '2026-11-01T00:00:00Z',
    updatedAt: '2026-11-01T00:00:00Z',
    deletedAt: null,
    ...overrides,
  });
}

describe('statuses', () => {
  it('uses the seven spec stages in pipeline order', () => {
    expect(STATUS_ORDER).toEqual(['saved', 'preparing', 'applied', 'interviewing', 'offered', 'rejected', 'withdrawn']);
  });

  it('places legacy values in the right column', () => {
    expect(boardStatus('wishlist')).toBe(JobStatus.SAVED);
    expect(boardStatus('offer')).toBe(JobStatus.OFFERED);
    expect(boardStatus('accepted')).toBe(JobStatus.OFFERED);
    expect(boardStatus('nonsense')).toBe(JobStatus.SAVED);
  });

  it('normalises a pre-workspace document (accepted → offered + outcome)', () => {
    const old = job({ status: 'accepted', contactName: 'Jane', contactEmail: 'jane@acme.com' });
    expect(old.status).toBe(JobStatus.OFFERED);
    expect(old.outcome).toBe('accepted');
    expect(old.contacts[0]).toMatchObject({ name: 'Jane', email: 'jane@acme.com' });
  });

  it('counts and groups every stage, including empty ones', () => {
    const jobs = [job({ id: 'a' }), job({ id: 'b', status: 'offer' }), job({ id: 'c', status: 'withdrawn' })];
    expect(statusCounts(jobs)).toMatchObject({ saved: 1, offered: 1, withdrawn: 1, applied: 0 });
    const groups = groupByStatus(jobs);
    expect(Object.keys(groups)).toEqual([...STATUS_ORDER]);
    expect(groups.offered.map((j) => j.id)).toEqual(['b']);
  });
});

describe('filterJobs', () => {
  it('searches every contact, not just the first', () => {
    const jobs = [
      job({ id: 'a', contacts: [{ id: 'c1', name: 'First' }, { id: 'c2', name: 'Priya Patel', role: 'Hiring manager' }] }),
      job({ id: 'b' }),
    ];
    expect(filterJobs(jobs, { status: 'all', search: 'priya', sort: 'updated' }).map((j) => j.id)).toEqual(['a']);
    expect(filterJobs(jobs, { status: 'all', search: 'hiring', sort: 'updated' }).map((j) => j.id)).toEqual(['a']);
  });

  it('sorts by soonest deadline with undated last', () => {
    const jobs = [
      job({ id: 'none' }),
      job({ id: 'late', deadline: '2026-12-20' }),
      job({ id: 'soon', deadline: '2026-11-20' }),
    ];
    expect(filterJobs(jobs, { status: 'all', search: '', sort: 'deadline' }).map((j) => j.id)).toEqual([
      'soon',
      'late',
      'none',
    ]);
  });

  it('filters by status including legacy values', () => {
    const jobs = [job({ id: 'a', status: 'offered' }), job({ id: 'b' })];
    expect(filterJobs(jobs, { status: JobStatus.OFFERED, search: '', sort: 'status' }).map((j) => j.id)).toEqual(['a']);
  });
});

describe('checklistProgress', () => {
  it('counts done items', () => {
    const j = job({ checklist: [{ id: '1', label: 'CV', done: true }, { id: '2', label: 'Portfolio' }] });
    expect(checklistProgress(j)).toEqual({ done: 1, total: 2 });
  });
});

describe('calendar', () => {
  const now = new Date('2026-11-14T10:00:00Z');

  it('lists the kinds with a usable date', () => {
    expect(calendarKinds(job({ interviewDate: '2026-12-01T14:30', followUpDate: 'junk', deadline: '2026-12-05' }))).toEqual([
      'interview',
      'deadline',
    ]);
  });

  it('builds an all-day deadline event (same day in every zone) with an escaped summary', () => {
    const file = applicationCalendarFile(
      job({ deadline: '2026-12-31', jobUrl: 'https://acme.com/jobs?a=1,b=2' }),
      'deadline',
      { title: 'Deadline: Engineer at Acme, Inc.', description: 'Apply before the deadline.' },
      now,
    );
    expect(file?.filename).toBe('deadline-acme-inc-engineer.ics');
    expect(file?.content).toContain('DTSTART;VALUE=DATE:20261231\r\n');
    expect(file?.content).toContain('DTEND;VALUE=DATE:20270101\r\n');
    expect(file?.content).toContain('SUMMARY:Deadline: Engineer at Acme\\, Inc.');
    expect(file?.content).toContain('UID:j1-deadline@flacroncv.com');
    // URL is a URI value: commas stay as they are.
    expect(file?.content).toContain('URL:https://acme.com/jobs?a=1,b=2');
    expect(file?.content.endsWith('END:VCALENDAR\r\n')).toBe(true);
  });

  it('builds a follow-up and an interview with stable per-application UIDs', () => {
    const j = job({ followUpDate: '2026-11-20', interviewDate: '2026-11-25T09:00' });
    const followUp = applicationCalendarFile(j, 'follow_up', { title: 'Follow up', description: 'd' }, now);
    const interview = applicationCalendarFile(j, 'interview', { title: 'Interview', description: 'd' }, now);
    expect(followUp?.content).toContain('UID:j1-follow_up@flacroncv.com');
    expect(followUp?.filename).toBe('follow-up-acme-inc-engineer.ics');
    expect(interview?.content).toContain('UID:j1-interview@flacroncv.com');
    expect(interview?.content).toMatch(/DTSTART:\d{8}T\d{6}Z/);
  });

  it('returns null for an impossible date', () => {
    expect(buildAllDayIcsEvent({ title: 't', date: '2026-02-30', uid: 'x', now })).toBeNull();
    expect(applicationCalendarFile(job(), 'deadline', { title: 't', description: '' }, now)).toBeNull();
  });
});

describe('letterText', () => {
  it('reads HTML letters as text without running markup', () => {
    const text = letterText('<p>Dear team,</p><p>I am <b>keen</b>.<img src=x onerror="alert(1)"></p>');
    expect(text).toContain('Dear team,');
    expect(text).toContain('I am keen.');
    expect(text).not.toContain('<');
  });

  it('leaves plain text alone', () => {
    expect(letterText('Plain\nletter')).toBe('Plain\nletter');
  });
});

describe('application drafts', () => {
  it('offers a referral before an interview and a thank-you after one', () => {
    expect(draftTypesFor({ status: JobStatus.SAVED, interviewDate: null })).toEqual(['referral_request']);
    expect(draftTypesFor({ status: JobStatus.APPLIED, interviewDate: '2026-11-20T10:00' })).toEqual([
      'referral_request',
      'thank_you',
    ]);
    expect(draftTypesFor({ status: JobStatus.INTERVIEWING, interviewDate: null })).toEqual(['thank_you']);
    expect(draftTypesFor({ status: JobStatus.REJECTED, interviewDate: null })).toEqual([]);
  });

  it('maps career API refusals to honest states', () => {
    const err = (status: number, code: string) => new ApiError(status, code, {} as never);
    expect(problemOf(err(402, 'quota_exhausted'))).toBe('quota');
    expect(problemOf(err(403, 'plan_upgrade_required'))).toBe('upgrade');
    expect(problemOf(err(503, 'provider_unavailable'))).toBe('unavailable');
    expect(problemOf(err(400, 'validation_error'))).toBe('unsupported');
    expect(problemOf(new Error('boom'))).toBe('failed');
  });
});

describe('isCapacityError', () => {
  it('recognises the plan-capacity refusal by its stable code only', async () => {
    const { isCapacityError } = await import('./job-workspace');
    expect(isCapacityError({ code: 'JOB_CAPACITY_REACHED' })).toBe(true);
    expect(isCapacityError({ code: 'CV_LIMIT_REACHED' })).toBe(false);
    expect(isCapacityError(new Error('Tracked application limit reached'))).toBe(false);
  });
});
