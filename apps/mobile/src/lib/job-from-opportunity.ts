import type { OpportunityDetail, TrackerReminderInput } from '../../../../packages/career-api-client/src/types';
import { statedOrganization } from '../../../../packages/career-shared/src/opportunities';
import type { JobApplication } from '../types/job.types';

/**
 * The bridge between career listings and V1's Job Tracker. Port of the
 * website's `apps/web/src/lib/career/v1-jobs.ts` (same payload, same dedupe,
 * same reminder sync); keep the two in step. Pure: no React Native imports.
 */

/** V1 status → career application status, with the legacy values older documents still carry. */
const STATUS: Record<string, string> = {
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

/** Body of `POST /jobs` for a listing: the same fields the website sends. */
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
    company: (statedOrganization(item.organization) ?? unstatedCompany).slice(0, 200),
    position: item.title.slice(0, 200),
    jobUrl: item.sourceUrl,
    location: item.locations.length > 0 ? item.locations.join(', ').slice(0, 200) : null,
    status: 'saved',
    opportunityId: item.id,
    jobDescription: item.description ? item.description.slice(0, 20_000) : null,
    jobDescriptionSource: 'opportunity',
    deadline: item.deadline,
  };
}

/** The tracker entry already holding this listing: same opportunity id, or the same original link. */
export function findTrackedJob(jobs: readonly JobApplication[], item: Pick<OpportunityDetail, 'id' | 'sourceUrl'>): JobApplication | null {
  return (
    jobs.find((job) => !job.deletedAt && (job.opportunityId === item.id || (item.sourceUrl !== null && job.jobUrl === item.sourceUrl))) ?? null
  );
}

function day(value: string | null | undefined): string | null {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}/.test(value)) return null;
  return value.slice(0, 10);
}

/**
 * Follow-up and interview dates from the tracker, as reminder inputs for the
 * career reminder list (`POST /reminders/tracker-sync`). Closed applications
 * (rejected, withdrawn, archived, deleted) produce none. At most 200.
 */
export function trackerReminders(jobs: readonly JobApplication[]): TrackerReminderInput[] {
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

/** Career status of a tracker entry (undefined for a value neither vocabulary knows). */
export function careerStatusOf(status: string): string | undefined {
  return STATUS[status];
}
