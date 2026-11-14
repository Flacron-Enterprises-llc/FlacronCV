import type { ApplicationItem, OpportunityDetail, TrackerReminderInput } from '@flacroncv/career-api-client';
import { statedOrganization } from '@flacroncv/career-shared';
import type { JobApplication } from '@flacroncv/shared-types';

/**
 * V1 `JobStatus` → the career application status (same table as the career
 * service's outcome analytics). The seven current stages plus the legacy
 * values still found in old documents (wishlist, offer, accepted).
 */
const STATUS: Record<string, ApplicationItem['status']> = {
  saved: 'saved',
  preparing: 'preparing',
  applied: 'applied',
  interviewing: 'interviewing',
  offered: 'offered',
  rejected: 'rejected',
  withdrawn: 'withdrawn',
  wishlist: 'saved',
  offer: 'offered',
  accepted: 'offered',
};

/** A tracker entry on the overview, with its follow-up date kept apart from any real deadline. */
export type V1CareerItem = ApplicationItem & { followUpDate: string | null };

/**
 * Shows V1 Jobs-tracker entries on the career overview, which was written
 * for V2's own tracker. Read-only view: nothing is copied or stored. The
 * deadline is the application deadline the person recorded; a follow-up date
 * is a follow-up, never presented as a deadline.
 */
export function careerItemsFromV1Jobs(jobs: JobApplication[]): V1CareerItem[] {
  return jobs
    .filter((job) => !job.archived && !job.deletedAt && STATUS[job.status] !== undefined)
    .map((job) => ({
      id: job.id,
      opportunityId: job.opportunityId ?? '',
      opportunityRevisionId: '',
      resumeVersionId: null,
      letterId: null,
      status: STATUS[job.status],
      contacts: [],
      notes: '',
      dates: { deadline: day(job.deadline), applied: job.appliedDate ?? null, interview: job.interviewDate ?? null },
      followUpDate: day(job.followUpDate),
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

/**
 * Follow-up and interview dates from the tracker, as reminder inputs for the
 * career alert centre (read-only, like the overview). Closed applications
 * (rejected, withdrawn, archived) produce none.
 */
export function trackerReminders(jobs: JobApplication[]): TrackerReminderInput[] {
  const out: TrackerReminderInput[] = [];
  for (const job of jobs) {
    if (job.archived || job.deletedAt) continue;
    const status = STATUS[job.status];
    if (!status || status === 'rejected' || status === 'withdrawn') continue;
    const title = job.company ? `${job.position} · ${job.company}` : job.position;
    const followUp = day(job.followUpDate);
    if (followUp) out.push({ kind: 'application_follow_up', sourceKey: `${job.id}:follow_up`, title, dueDate: followUp, link: '/jobs' });
    const interview = day(job.interviewDate);
    if (interview) out.push({ kind: 'interview', sourceKey: `${job.id}:interview`, title, dueDate: interview, link: '/jobs' });
  }
  return out.slice(0, 200);
}

/** The tracker operations career screens use. The default talks to the V1 API; tests pass a fake. */
export interface JobTracker {
  list(): Promise<JobApplication[]>;
  create(input: V1JobInput): Promise<JobApplication>;
}

export interface V1JobInput {
  company: string;
  position: string;
  jobUrl: string | null;
  location: string | null;
  status: 'saved';
  opportunityId: string;
  jobDescription: string | null;
  jobDescriptionSource: 'opportunity';
  deadline: string | null;
}

/** V1 needs a company name; a listing that does not state one is recorded as such, in the person's language. */
export function v1JobFromOpportunity(item: OpportunityDetail, unstatedCompany: string): V1JobInput {
  return {
    company: statedOrganization(item.organization) ?? unstatedCompany,
    position: item.title.slice(0, 300),
    jobUrl: item.sourceUrl,
    location: item.locations.length > 0 ? item.locations.join(', ').slice(0, 300) : null,
    status: 'saved',
    opportunityId: item.id,
    jobDescription: item.description ? item.description.slice(0, 20_000) : null,
    jobDescriptionSource: 'opportunity',
    deadline: item.deadline,
  };
}

/** The tracker entry already holding this listing: same opportunity id, or the same original link. */
export function findTrackedJob(jobs: JobApplication[], item: Pick<OpportunityDetail, 'id' | 'sourceUrl'>): JobApplication | null {
  return (
    jobs.find(
      (job) => !job.deletedAt && (job.opportunityId === item.id || (item.sourceUrl !== null && job.jobUrl === item.sourceUrl)),
    ) ?? null
  );
}

/** Loaded on first use so screens and tests that never track a job do not pull in the V1 session client. */
export const v1JobTracker: JobTracker = {
  async list() {
    const { api } = await import('@/lib/api');
    return api.get<JobApplication[]>('/jobs');
  },
  async create(input) {
    const { api } = await import('@/lib/api');
    return api.post<JobApplication>('/jobs', input);
  },
};

function day(value: string | null | undefined): string | null {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}/.test(value)) return null;
  return value.slice(0, 10);
}
