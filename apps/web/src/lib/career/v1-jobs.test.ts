import { describe, expect, it } from 'vitest';
import type { JobApplication } from '@flacroncv/shared-types';
import { careerItemsFromV1Jobs } from './v1-jobs';

const job = (patch: Partial<JobApplication>): JobApplication =>
  ({
    id: 'j1', userId: 'u', company: 'Fictional Co', position: 'Analyst', jobUrl: null, location: null, status: 'applied',
    appliedDate: '2026-10-01', notes: null, linkedCVId: null, linkedCoverLetterId: null, salaryRange: null, contactName: null,
    contactEmail: null, interviewDate: null, followUpDate: '2026-11-10', archived: false, deletedAt: null, ...patch,
  }) as JobApplication;

describe('V1 jobs on the career overview', () => {
  it('maps statuses, title and follow-up date, and drops archived or deleted entries', () => {
    const items = careerItemsFromV1Jobs([
      job({ id: 'a', status: 'offer' as JobApplication['status'] }),
      job({ id: 'b', status: 'wishlist' as JobApplication['status'] }),
      job({ id: 'c', archived: true }),
      job({ id: 'd', deletedAt: new Date() as never }),
    ]);
    expect(items.map((item) => [item.id, item.status])).toEqual([
      ['a', 'offered'],
      ['b', 'saved'],
    ]);
    expect(items[0]).toMatchObject({ opportunityId: '', dates: { deadline: '2026-11-10', applied: '2026-10-01' }, snapshot: { title: 'Analyst · Fictional Co' } });
  });
});
