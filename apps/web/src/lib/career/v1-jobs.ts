import type { ApplicationItem } from '@flacroncv/career-api-client';
import type { JobApplication } from '@flacroncv/shared-types';

/** V1 `JobStatus` → the career application status (same table as the career service's outcome analytics). */
const STATUS: Record<string, ApplicationItem['status']> = {
  wishlist: 'saved',
  applied: 'applied',
  interviewing: 'interviewing',
  offer: 'offered',
  accepted: 'offered',
  rejected: 'rejected',
};

/**
 * Shows V1 Jobs-tracker entries on the career overview, which was written
 * for V2's own tracker. Read-only view: nothing is copied or stored, and an
 * entry has no career opportunity behind it (`opportunityId` is empty).
 */
export function careerItemsFromV1Jobs(jobs: JobApplication[]): ApplicationItem[] {
  return jobs
    .filter((job) => !job.archived && !job.deletedAt && STATUS[job.status] !== undefined)
    .map((job) => ({
      id: job.id,
      opportunityId: '',
      opportunityRevisionId: '',
      resumeVersionId: null,
      letterId: null,
      status: STATUS[job.status],
      contacts: [],
      notes: '',
      dates: { deadline: job.followUpDate ?? null, applied: job.appliedDate ?? null, interview: job.interviewDate ?? null },
      checklist: [],
      snapshot: {
        title: job.company ? `${job.position} · ${job.company}` : job.position,
        organization: job.company || null,
        sourceUrl: job.jobUrl || null,
        description: '',
        checkedAt: '',
        provider: 'v1_job_tracker',
        revisionId: '',
      },
      createdAt: String(job.createdAt ?? ''),
      updatedAt: String(job.updatedAt ?? ''),
    }));
}
