import { describe, expect, it } from 'vitest';
import { JobStatus } from '../types/enums';
import type { JobApplication } from '../types/job.types';
import {
  duplicateCheckParams,
  duplicateConfirmMessage,
  filterAndSortJobs,
  interviewCalendarFile,
  isValidContactEmail,
  optionalJobField,
  statusCounts,
  visibleJobs,
} from './job-tracker';

function job(over: Partial<JobApplication>): JobApplication {
  return {
    id: 'j',
    userId: 'u',
    company: 'Acme',
    position: 'Engineer',
    jobUrl: null,
    location: null,
    status: JobStatus.APPLIED,
    appliedDate: null,
    notes: null,
    linkedCVId: null,
    linkedCoverLetterId: null,
    salaryRange: null,
    contactName: null,
    contactEmail: null,
    interviewDate: null,
    followUpDate: null,
    archived: false,
    createdAt: null,
    updatedAt: null,
    deletedAt: null,
    ...over,
  };
}

const JOBS = [
  job({ id: 'a', company: 'Zeta', position: 'Designer', status: JobStatus.OFFER, updatedAt: '2026-01-03T00:00:00Z', appliedDate: '2026-01-01' }),
  job({ id: 'b', company: 'Acme', position: 'Engineer', status: JobStatus.WISHLIST, updatedAt: { _seconds: 1_767_500_000 }, location: 'Remote' }),
  job({ id: 'c', company: 'Mid', position: 'Analyst', status: JobStatus.APPLIED, updatedAt: '2026-01-01T00:00:00Z', appliedDate: '2026-02-01', contactName: 'Jane Recruiter' }),
  job({ id: 'd', company: 'Old', position: 'Archived role', archived: true, notes: 'finished' }),
];

const ids = (list: JobApplication[]) => list.map((j) => j.id);

describe('visibleJobs / statusCounts', () => {
  it('splits active and archived exactly like the website toggle', () => {
    expect(ids(visibleJobs(JOBS, false))).toEqual(['a', 'b', 'c']);
    expect(ids(visibleJobs(JOBS, true))).toEqual(['d']);
  });

  it('counts per status over the visible set', () => {
    expect(statusCounts(visibleJobs(JOBS, false))).toEqual({ offer: 1, wishlist: 1, applied: 1 });
  });
});

describe('filterAndSortJobs', () => {
  const active = visibleJobs(JOBS, false);
  const run = (o: Partial<Parameters<typeof filterAndSortJobs>[1]>) =>
    ids(filterAndSortJobs(active, { status: 'all', search: '', sort: 'updated', ...o }));

  it('sorts by each website key', () => {
    // b's Firestore timestamp (2026-01-04) is the most recent update.
    expect(run({ sort: 'updated' })).toEqual(['b', 'a', 'c']);
    expect(run({ sort: 'applied' })).toEqual(['c', 'a', 'b']);
    expect(run({ sort: 'company' })).toEqual(['b', 'c', 'a']);
    expect(run({ sort: 'position' })).toEqual(['c', 'a', 'b']);
    expect(run({ sort: 'status' })).toEqual(['b', 'c', 'a']);
  });

  it('searches company, position, location, notes and contact name', () => {
    expect(run({ search: 'remote' })).toEqual(['b']);
    expect(run({ search: 'jane' })).toEqual(['c']);
    expect(run({ search: 'DESIGN' })).toEqual(['a']);
    expect(ids(filterAndSortJobs(visibleJobs(JOBS, true), { status: 'all', search: 'finish', sort: 'updated' }))).toEqual(['d']);
  });

  it('filters by status', () => {
    expect(run({ status: JobStatus.OFFER })).toEqual(['a']);
  });

  it('does not mutate the input', () => {
    const copy = [...active];
    filterAndSortJobs(active, { status: 'all', search: '', sort: 'company' });
    expect(active).toEqual(copy);
  });
});

describe('isValidContactEmail', () => {
  it.each(['', '  ', 'recruiter@company.com', 'a.b+c@sub.example.co.uk'])('accepts %p', (v) => {
    expect(isValidContactEmail(v)).toBe(true);
  });
  it.each(['nope', 'a@b', 'a@b.', '@b.com', 'a b@c.com', 'a..b@c.com', '.a@c.com', 'a@-b.com'])('rejects %p', (v) => {
    expect(isValidContactEmail(v)).toBe(false);
  });
});

describe('optionalJobField', () => {
  it('omits empty values on create and clears them with null on edit', () => {
    expect(optionalJobField('  ', false)).toBeUndefined();
    expect(optionalJobField('  ', true)).toBeNull();
    expect(optionalJobField(' x ', true)).toBe('x');
  });
});

describe('duplicate check', () => {
  it('only checks when both company and position are present', () => {
    expect(duplicateCheckParams(' Acme ', ' Eng ')).toEqual({ company: 'Acme', position: 'Eng' });
    expect(duplicateCheckParams('', 'Eng')).toBeNull();
  });
  it('uses the website wording', () => {
    expect(duplicateConfirmMessage({ company: 'Acme', position: 'Eng' })).toBe(
      'You already track an application for Eng at Acme. Add another one anyway?',
    );
  });
});

describe('interviewCalendarFile', () => {
  it('builds the website summary, location, url and filename', () => {
    const file = interviewCalendarFile(
      { company: 'Acme, Inc.', position: 'Senior Engineer', location: 'Remote', jobUrl: 'https://x.test/1', interviewDate: '2026-08-03T14:30' },
      new Date('2026-07-30T09:00:00Z'),
    )!;
    expect(file.filename).toBe('interview-acme-inc-senior-engineer.ics');
    expect(file.content).toContain('SUMMARY:Interview: Senior Engineer at Acme\\, Inc.');
    expect(file.content).toContain('LOCATION:Remote');
    expect(file.content).toContain('URL:https://x.test/1');
    expect(file.content.replace(/\r\n /g, '')).toContain(
      'DESCRIPTION:Interview for Senior Engineer at Acme\\, Inc..\\nhttps://x.test/1',
    );
  });

  it('returns null without a parseable interview date', () => {
    expect(interviewCalendarFile({ company: 'A', position: 'B', location: null, jobUrl: null, interviewDate: null })).toBeNull();
  });

  it('falls back to a generic filename', () => {
    expect(
      interviewCalendarFile({ company: '日本', position: '!!', location: null, jobUrl: null, interviewDate: '2026-08-03T14:30' })!
        .filename,
    ).toBe('interview-interview.ics');
  });
});
