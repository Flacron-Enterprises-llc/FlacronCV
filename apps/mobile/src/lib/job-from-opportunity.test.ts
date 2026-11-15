import { describe, expect, it } from 'vitest';
import type { OpportunityDetail } from '../../../../packages/career-api-client/src/types';
import { JobStatus } from '../types/enums';
import type { JobApplication } from '../types/job.types';
import { findTrackedJob, trackerReminders, v1JobFromOpportunity } from './job-from-opportunity';

const listing: OpportunityDetail = {
  id: 'o1',
  category: 'job',
  provider: 'paste',
  title: 'Data analyst',
  organization: null,
  status: 'open',
  label: 'open',
  sourceUrl: 'https://example.com/jobs/1',
  checkedAt: '2026-11-01T00:00:00Z',
  deadline: '2026-12-01',
  locations: ['Leeds', 'Remote'],
  compensation: { minimum: null, maximum: null, currency: null, period: null },
  sponsorship: 'unknown',
  description: 'Work with data.',
  resumeAnalysis: { includedRemaining: 0, packRemaining: 0, renewalDate: null },
};

function job(partial: Partial<JobApplication> & { id: string }): JobApplication {
  return {
    userId: 'u1',
    company: 'Fictional Co',
    position: 'Analyst',
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
    ...partial,
  };
}

describe('v1JobFromOpportunity', () => {
  it('sends the website payload: opportunityId, the listing text as the description, the deadline', () => {
    expect(v1JobFromOpportunity(listing, 'Employer not stated')).toEqual({
      company: 'Employer not stated',
      position: 'Data analyst',
      jobUrl: 'https://example.com/jobs/1',
      location: 'Leeds, Remote',
      status: 'saved',
      opportunityId: 'o1',
      jobDescription: 'Work with data.',
      jobDescriptionSource: 'opportunity',
      deadline: '2026-12-01',
    });
  });

  it('keeps within the tracker limits', () => {
    const long = v1JobFromOpportunity({ ...listing, title: 'x'.repeat(400), organization: 'y'.repeat(400), description: '' }, 'n/a');
    expect(long.position).toHaveLength(200);
    expect(long.company).toHaveLength(200);
    expect(long.jobDescription).toBeNull();
  });
});

describe('findTrackedJob', () => {
  it('reuses the entry with this listing id or link, never a deleted one', () => {
    expect(findTrackedJob([job({ id: 'j1', opportunityId: 'o1' })], listing)?.id).toBe('j1');
    expect(findTrackedJob([job({ id: 'j2', jobUrl: 'https://example.com/jobs/1' })], listing)?.id).toBe('j2');
    expect(findTrackedJob([job({ id: 'j3', opportunityId: 'o1', deletedAt: '2026-01-01' })], listing)).toBeNull();
    expect(findTrackedJob([job({ id: 'j4', jobUrl: null })], { ...listing, sourceUrl: null })).toBeNull();
  });
});

describe('trackerReminders', () => {
  it('sends follow-up and interview days of open applications only', () => {
    const items = trackerReminders([
      job({ id: 'a', followUpDate: '2026-12-01', interviewDate: '2026-12-03T10:00' }),
      job({ id: 'b', status: JobStatus.REJECTED, followUpDate: '2026-12-01' }),
      job({ id: 'c', archived: true, followUpDate: '2026-12-01' }),
      job({ id: 'd', company: '', followUpDate: 'soon' }),
    ]);
    expect(items).toEqual([
      { kind: 'application_follow_up', sourceKey: 'a:follow_up', title: 'Analyst · Fictional Co', dueDate: '2026-12-01', link: '/jobs' },
      { kind: 'interview', sourceKey: 'a:interview', title: 'Analyst · Fictional Co', dueDate: '2026-12-03', link: '/jobs' },
    ]);
  });
});
