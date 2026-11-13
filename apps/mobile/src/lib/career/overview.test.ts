import { describe, expect, it } from 'vitest';
import type { Fact, Resume, UsageSummary } from '../../../../../packages/career-api-client/src/types';
import { JobStatus } from '../../types/enums';
import type { JobApplication } from '../../types/job.types';
import { actionLabel, actionRoute, applicationsFromV1Jobs, careerOverview, unitLabel } from './overview';

function job(partial: Partial<JobApplication> & { id: string; status: JobStatus }): JobApplication {
  return {
    userId: 'u1',
    company: 'Fictional Co',
    position: 'Analyst',
    jobUrl: null,
    location: null,
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

const CORE = ['contact', 'summary', 'experience', 'education', 'skill'] as const;
const confirmed = (factType: string): Pick<Fact, 'factType' | 'confirmation' | 'uncertain'> =>
  ({ factType, confirmation: 'confirmed', uncertain: {} }) as Pick<Fact, 'factType' | 'confirmation' | 'uncertain'>;
const fullProfile = CORE.map(confirmed);

const usage: UsageSummary = {
  renewalDate: '2026-12-01T00:00:00Z',
  units: [
    { unit: 'document_credit', includedGranted: 60, includedRemaining: 58, packRemaining: 5, packHeld: 0 },
    { unit: 'text_interview', includedGranted: 5, includedRemaining: 3, packRemaining: 1, packHeld: 0 },
    { unit: 'voice_minute', includedGranted: 30, includedRemaining: 0, packRemaining: 0, packHeld: 0 },
  ],
  packs: [],
};

describe('applicationsFromV1Jobs', () => {
  it('maps V1 statuses like the website and drops archived or deleted entries', () => {
    const items = applicationsFromV1Jobs([
      job({ id: 'a', status: JobStatus.WISHLIST, followUpDate: '2026-11-20' }),
      job({ id: 'b', status: JobStatus.OFFER, company: '' }),
      job({ id: 'c', status: JobStatus.ACCEPTED }),
      job({ id: 'd', status: JobStatus.APPLIED, archived: true }),
      job({ id: 'e', status: JobStatus.APPLIED, deletedAt: '2026-01-01' }),
    ]);
    expect(items).toEqual([
      { id: 'a', opportunityId: '', status: 'saved', title: 'Analyst · Fictional Co', deadline: '2026-11-20' },
      { id: 'b', opportunityId: '', status: 'offered', title: 'Analyst', deadline: null },
      { id: 'c', opportunityId: '', status: 'offered', title: 'Analyst · Fictional Co', deadline: null },
    ]);
  });
});

describe('careerOverview', () => {
  const base = { jobs: [] as JobApplication[], alertCount: 0, usage, resumes: [] as Resume[], today: '2026-11-13' };

  it('asks for the profile first while a core section has no confirmed fact', () => {
    const overview = careerOverview({ ...base, facts: [confirmed('contact'), { ...confirmed('skill'), confirmation: 'draft' }] });
    expect(overview.counts.confirmed).toBe(1);
    expect(overview.counts.missingCore).toEqual(['summary', 'experience', 'education', 'skill']);
    expect(overview.action.kind).toBe('profile');
    expect(actionRoute(overview.action)).toBe('/(dashboard)/career/profile');
  });

  it('then the soonest open deadline from the Job Tracker, skipping past dates', () => {
    const overview = careerOverview({
      ...base,
      facts: fullProfile,
      jobs: [
        job({ id: 'past', status: JobStatus.WISHLIST, followUpDate: '2026-11-01' }),
        job({ id: 'late', status: JobStatus.APPLIED, followUpDate: '2026-12-24' }),
        job({ id: 'soon', status: JobStatus.WISHLIST, followUpDate: '2026-11-20', position: 'Planner' }),
      ],
    });
    expect(overview.action).toMatchObject({ kind: 'application', reason: 'deadline', applicationId: 'soon', deadline: '2026-11-20' });
    expect(overview.deadline?.id).toBe('soon');
    expect(overview.saved).toBe(2);
    expect(actionRoute(overview.action)).toBe('/(dashboard)/jobs');
    expect(actionLabel(overview.action, 'Nov 20, 2026')).toBe('Review the deadline for Planner · Fictional Co');
  });

  it('then alerts, then interview practice, then search', () => {
    expect(careerOverview({ ...base, facts: fullProfile, alertCount: 2 }).action.kind).toBe('alerts');
    const interviewing = careerOverview({ ...base, facts: fullProfile, jobs: [job({ id: 'i', status: JobStatus.INTERVIEWING })] });
    expect(interviewing.action.kind).toBe('interview');
    expect(actionRoute(interviewing.action)).toBe('/(dashboard)/career/interviews');
    const ready = careerOverview({ ...base, facts: fullProfile });
    expect(ready.action.kind).toBe('search');
    expect(actionRoute(ready.action)).toBe('/(dashboard)/career/opportunities');
    expect(actionLabel(ready.action, null)).toBe('Search opportunities');
  });

  it('counts included plus pack units per unit and text interviews left', () => {
    const overview = careerOverview({ ...base, facts: fullProfile });
    expect(overview.units).toEqual([
      { unit: 'document_credit', remaining: 63 },
      { unit: 'text_interview', remaining: 4 },
      { unit: 'voice_minute', remaining: 0 },
    ]);
    expect(overview.interviewsLeft).toBe(4);
    expect(careerOverview({ ...base, facts: fullProfile, usage: null }).interviewsLeft).toBe(0);
  });

  it('the recent draft is the first one the career service lists', () => {
    const resumes = [
      { id: 'r2', title: 'Newest', language: 'en', templateId: 'classic', createdAt: '2026-11-10T00:00:00Z', currentVersionId: 'v' },
      { id: 'r1', title: 'Older', language: 'en', templateId: 'classic', createdAt: '2026-10-01T00:00:00Z', currentVersionId: 'v' },
    ] as Resume[];
    expect(careerOverview({ ...base, facts: fullProfile, resumes }).recent).toEqual({ id: 'r2', title: 'Newest', createdAt: '2026-11-10T00:00:00Z' });
    expect(careerOverview({ ...base, facts: fullProfile }).recent).toBeNull();
  });
});

describe('unitLabel', () => {
  it('names known units and shows an unknown unit as is', () => {
    expect(unitLabel('document_credit')).toBe('Document credits');
    expect(unitLabel('text_interview')).toBe('Text interviews');
    expect(unitLabel('something_new')).toBe('something_new');
  });
});
