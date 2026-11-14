import { describe, expect, it } from 'vitest';
import type { OpportunityDetail } from '@flacroncv/career-api-client';
import type { JobApplication } from '@flacroncv/shared-types';
import { careerItemsFromV1Jobs, findTrackedJob, trackerReminders, v1JobFromOpportunity } from './v1-jobs';

const job = (patch: Partial<JobApplication>): JobApplication =>
  ({
    id: 'j1', userId: 'u', company: 'Fictional Co', position: 'Analyst', jobUrl: null, location: null, status: 'applied',
    appliedDate: '2026-10-01', notes: null, linkedCVId: null, linkedCoverLetterId: null, salaryRange: null, contactName: null,
    contactEmail: null, interviewDate: null, followUpDate: '2026-11-10', deadline: null, opportunityId: null, archived: false, deletedAt: null, ...patch,
  }) as JobApplication;

describe('V1 jobs on the career overview', () => {
  it('maps current and legacy statuses and drops archived or deleted entries', () => {
    const items = careerItemsFromV1Jobs([
      job({ id: 'a', status: 'offer' as JobApplication['status'] }),
      job({ id: 'b', status: 'wishlist' as JobApplication['status'] }),
      job({ id: 'c', archived: true }),
      job({ id: 'd', deletedAt: new Date() as never }),
      job({ id: 'e', status: 'preparing' as JobApplication['status'] }),
      job({ id: 'f', status: 'withdrawn' as JobApplication['status'] }),
      job({ id: 'g', status: 'accepted' as JobApplication['status'] }),
    ]);
    expect(items.map((item) => [item.id, item.status])).toEqual([
      ['a', 'offered'],
      ['b', 'saved'],
      ['e', 'preparing'],
      ['f', 'withdrawn'],
      ['g', 'offered'],
    ]);
    expect(items[0]).toMatchObject({ opportunityId: '', dates: { applied: '2026-10-01' }, snapshot: { title: 'Analyst · Fictional Co' } });
  });

  it('keeps a follow-up date as a follow-up and uses only the recorded deadline as a deadline', () => {
    const [onlyFollowUp, withDeadline] = careerItemsFromV1Jobs([
      job({ id: 'a' }),
      job({ id: 'b', deadline: '2026-12-01', followUpDate: null }),
    ]);
    expect(onlyFollowUp).toMatchObject({ dates: { deadline: null }, followUpDate: '2026-11-10' });
    expect(withDeadline).toMatchObject({ dates: { deadline: '2026-12-01' }, followUpDate: null });
  });

  it('turns follow-up and interview dates into reminder inputs for open applications only', () => {
    const reminders = trackerReminders([
      job({ id: 'a', interviewDate: '2026-11-12T10:00' }),
      job({ id: 'b', status: 'rejected' as JobApplication['status'] }),
    ]);
    expect(reminders).toEqual([
      { kind: 'application_follow_up', sourceKey: 'a:follow_up', title: 'Analyst · Fictional Co', dueDate: '2026-11-10', link: '/jobs' },
      { kind: 'interview', sourceKey: 'a:interview', title: 'Analyst · Fictional Co', dueDate: '2026-11-12', link: '/jobs' },
    ]);
  });

  it('builds a saved tracker entry from a listing and finds one already tracked', () => {
    const item = {
      id: 'opp-1', title: 'Ledger analyst', organization: null, sourceUrl: 'https://example.test/1', locations: ['London', 'Remote'],
      description: 'Keep the ledger.', deadline: '2026-12-01',
    } as unknown as OpportunityDetail;
    expect(v1JobFromOpportunity(item, 'Not stated')).toEqual({
      company: 'Not stated', position: 'Ledger analyst', jobUrl: 'https://example.test/1', location: 'London, Remote', status: 'saved',
      opportunityId: 'opp-1', jobDescription: 'Keep the ledger.', jobDescriptionSource: 'opportunity', deadline: '2026-12-01',
    });
    expect(findTrackedJob([job({ id: 'x', jobUrl: 'https://example.test/1' })], item)?.id).toBe('x');
    expect(findTrackedJob([job({ id: 'y', opportunityId: 'opp-1' })], item)?.id).toBe('y');
    expect(findTrackedJob([job({ id: 'z' })], item)).toBeNull();
  });
});
