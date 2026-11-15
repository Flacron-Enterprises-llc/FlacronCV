import {
  nextDeadline,
  savedApplicationCount,
  stageCounts,
  suggestNextAction,
  type DashboardAction,
  type DashboardApplication,
} from '../../../../../packages/career-shared/src/dashboard';
import { countFacts, type FactCounts } from '../../../../../packages/career-shared/src/facts';
import type { AlertItem, Fact, OpportunityItem, Resume, UsageSummary } from '../../../../../packages/career-api-client/src/types';
import type { ApplicationStatus } from '../../../../../packages/career-shared/src/applications';
import { hasKey, t } from '../../i18n';
import type { JobApplication } from '../../types/job.types';

/**
 * Career overview summary (website: career/dashboard/DashboardScreen). The
 * counting and the single suggested next action come from career-shared
 * (`countFacts`, `suggestNextAction`, `nextDeadline`), the same functions the
 * website uses. Reading this costs no credit; the action is only a link.
 */

/** V1 `JobStatus` → career application status (website: lib/career/v1-jobs.ts). */
const V1_STATUS: Record<string, string> = {
  // Current V1 statuses are the career statuses.
  saved: 'saved',
  preparing: 'preparing',
  applied: 'applied',
  interviewing: 'interviewing',
  offered: 'offered',
  rejected: 'rejected',
  withdrawn: 'withdrawn',
  // Legacy values (older cached responses).
  wishlist: 'saved',
  offer: 'offered',
  accepted: 'offered',
};

/**
 * The V1 Job Tracker is the only application tracker (same as the website's
 * overview). Read-only view: nothing is copied, and an entry has no career
 * opportunity behind it unless it was tracked from a listing (`opportunityId`).
 */
export function applicationsFromV1Jobs(jobs: readonly JobApplication[]): DashboardApplication[] {
  return jobs
    .filter((job) => !job.archived && !job.deletedAt && V1_STATUS[job.status] !== undefined)
    .map((job) => ({
      id: job.id,
      opportunityId: job.opportunityId ?? '',
      status: V1_STATUS[job.status],
      title: job.company ? `${job.position} · ${job.company}` : job.position,
      // The application deadline only. A follow-up date is a follow-up, never shown as a deadline (website rule).
      deadline: dateOnly(job.deadline),
    }));
}

function dateOnly(value: string | null | undefined): string | null {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}/.test(value) ? value.slice(0, 10) : null;
}

/** The nearest follow-up date from the tracker, today or later, for an open application. Labelled as a follow-up. */
export function nextFollowUp(jobs: readonly JobApplication[], today: string): { id: string; title: string; date: string } | null {
  const open = jobs
    .filter((job) => !job.archived && !job.deletedAt)
    .map((job) => ({ job, status: V1_STATUS[job.status], date: dateOnly(job.followUpDate) }))
    .filter((entry): entry is { job: JobApplication; status: string; date: string } =>
      Boolean(entry.date && entry.status && entry.status !== 'rejected' && entry.status !== 'withdrawn' && (entry.date as string) >= today),
    )
    .sort((a, b) => a.date.localeCompare(b.date))[0];
  if (!open) return null;
  return { id: open.job.id, title: open.job.company ? `${open.job.position} · ${open.job.company}` : open.job.position, date: open.date };
}

export interface RelevantListing {
  id: string;
  title: string;
  deadline: string | null;
  source: 'saved' | 'alert';
}

/** Saved listings first (expired ones left out), then recent alerts not already saved; at most five (website). */
export function relevantListings(saved: readonly OpportunityItem[], alerts: readonly AlertItem[]): RelevantListing[] {
  const out: RelevantListing[] = saved
    .filter((item) => item.label !== 'expired')
    .map((item) => ({ id: item.id, title: item.title, deadline: item.deadline, source: 'saved' as const }));
  for (const alert of alerts) {
    if (out.some((entry) => entry.id === alert.opportunityId)) continue;
    out.push({ id: alert.opportunityId, title: alert.title, deadline: alert.basic?.deadline ?? null, source: 'alert' });
  }
  return out.slice(0, 5);
}

export interface UpcomingDeadline {
  key: string;
  title: string;
  date: string;
  /** A listing's stated deadline, or an application deadline recorded in the tracker. */
  kind: 'listing' | 'application';
  /** Listing id or tracker entry id, for the link. */
  id: string;
}

/** Real deadlines only: stated listing deadlines and recorded application deadlines, today or later, nearest first. */
export function upcomingDeadlines(saved: readonly OpportunityItem[], applications: readonly DashboardApplication[], today: string): UpcomingDeadline[] {
  const entries: UpcomingDeadline[] = [
    ...saved.filter((item) => item.deadline).map((item) => ({ key: `o-${item.id}`, title: item.title, date: (item.deadline as string).slice(0, 10), kind: 'listing' as const, id: item.id })),
    ...applications
      .filter((card) => card.deadline && card.status !== 'rejected' && card.status !== 'withdrawn')
      .map((card) => ({ key: `a-${card.id}`, title: card.title, date: card.deadline as string, kind: 'application' as const, id: card.id })),
  ];
  return entries.filter((entry) => entry.date >= today).sort((a, b) => a.date.localeCompare(b.date)).slice(0, 5);
}

export interface CareerOverview {
  counts: FactCounts;
  action: DashboardAction;
  deadline: DashboardApplication | null;
  followUp: { id: string; title: string; date: string } | null;
  stages: Record<ApplicationStatus, number>;
  relevant: RelevantListing[];
  deadlines: UpcomingDeadline[];
  /** The listing behind the first application at the interview stage, for interview practice; null when none. */
  practiceOpportunityId: string | null;
  saved: number;
  /** Text interview sessions left (included + packs); website `interview_remaining`. */
  interviewsLeft: number;
  units: { unit: string; remaining: number }[];
  recent: Pick<Resume, 'id' | 'title' | 'createdAt'> | null;
}

export function careerOverview(input: {
  facts: readonly Pick<Fact, 'factType' | 'confirmation' | 'uncertain'>[];
  jobs: readonly JobApplication[];
  /** Alerts waiting; 0 when the alert feature is off or the list could not load. */
  alertCount: number;
  usage: UsageSummary | null;
  resumes: readonly Resume[];
  today: string;
  /** Saved listings (optional on the overview: a failure leaves the rest usable). */
  savedListings?: readonly OpportunityItem[];
  alerts?: readonly AlertItem[];
}): CareerOverview {
  const counts = countFacts(input.facts);
  const applications = applicationsFromV1Jobs(input.jobs);
  const units = (input.usage?.units ?? []).map((unit) => ({ unit: unit.unit, remaining: unit.includedRemaining + unit.packRemaining }));
  const recent = input.resumes[0];
  return {
    counts,
    action: suggestNextAction({ counts, applications, alertCount: input.alertCount, today: input.today }),
    deadline: nextDeadline(applications, input.today),
    followUp: nextFollowUp(input.jobs, input.today),
    stages: stageCounts(applications),
    relevant: relevantListings(input.savedListings ?? [], input.alerts ?? []),
    deadlines: upcomingDeadlines(input.savedListings ?? [], applications, input.today),
    practiceOpportunityId: applications.find((item) => item.status === 'interviewing' && item.opportunityId)?.opportunityId ?? null,
    saved: savedApplicationCount(applications),
    interviewsLeft: units.find((unit) => unit.unit === 'text_interview')?.remaining ?? 0,
    units,
    recent: recent ? { id: recent.id, title: recent.title, createdAt: recent.createdAt } : null,
  };
}

/** Where the suggested action opens in the app (website `actionHref`). */
export function actionRoute(action: DashboardAction): string {
  switch (action.kind) {
    case 'profile':
      return '/(dashboard)/career/profile';
    case 'application':
      return '/(dashboard)/jobs';
    case 'alerts':
      return '/(dashboard)/career/alerts';
    case 'interview':
      return action.opportunityId
        ? `/(dashboard)/career/interviews?opportunityId=${encodeURIComponent(action.opportunityId)}`
        : '/(dashboard)/career/interviews';
    case 'search':
      return '/(dashboard)/career/opportunities';
  }
}

/** Website `actionLabel`, in the current language. `date` is the formatted deadline. */
export function actionLabel(action: DashboardAction, date: string | null): string {
  if (action.reason === 'deadline') return t('careerHub.overview.action.deadline', { title: action.title ?? '', date: date ?? action.deadline ?? '' });
  if (action.reason === 'alert') return t('careerHub.overview.action.alert');
  if (action.reason === 'interviewing') return t('careerHub.overview.action.interview');
  if (action.reason === 'ready') return t('careerHub.overview.action.search');
  return t('careerHub.overview.action.profile');
}

/** A usage unit's name (website `career.billing.unit_*`); an unknown unit shows its id. */
export function unitLabel(unit: string): string {
  const key = `careerHub.overview.units.${unit.replace(/_([a-z])/g, (_, c: string) => c.toUpperCase())}`;
  return hasKey(key) ? t(key) : unit;
}
