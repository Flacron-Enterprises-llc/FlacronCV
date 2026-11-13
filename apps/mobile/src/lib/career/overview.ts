import {
  nextDeadline,
  savedApplicationCount,
  suggestNextAction,
  type DashboardAction,
  type DashboardApplication,
} from '../../../../../packages/career-shared/src/dashboard';
import { countFacts, type FactCounts } from '../../../../../packages/career-shared/src/facts';
import type { Fact, Resume, UsageSummary } from '../../../../../packages/career-api-client/src/types';
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
  wishlist: 'saved',
  applied: 'applied',
  interviewing: 'interviewing',
  offer: 'offered',
  accepted: 'offered',
  rejected: 'rejected',
};

/**
 * The V1 Job Tracker is the only application tracker (same as the website's
 * overview). Read-only view: nothing is copied, and an entry has no career
 * opportunity behind it (`opportunityId` is empty).
 */
export function applicationsFromV1Jobs(jobs: readonly JobApplication[]): DashboardApplication[] {
  return jobs
    .filter((job) => !job.archived && !job.deletedAt && V1_STATUS[job.status] !== undefined)
    .map((job) => ({
      id: job.id,
      opportunityId: '',
      status: V1_STATUS[job.status],
      title: job.company ? `${job.position} · ${job.company}` : job.position,
      deadline: job.followUpDate ?? null,
    }));
}

export interface CareerOverview {
  counts: FactCounts;
  action: DashboardAction;
  deadline: DashboardApplication | null;
  saved: number;
  /** Text interview sessions left (included + packs); website `interview_remaining`. */
  interviewsLeft: number;
  units: Array<{ unit: string; remaining: number }>;
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
}): CareerOverview {
  const counts = countFacts(input.facts);
  const applications = applicationsFromV1Jobs(input.jobs);
  const units = (input.usage?.units ?? []).map((unit) => ({ unit: unit.unit, remaining: unit.includedRemaining + unit.packRemaining }));
  const recent = input.resumes[0];
  return {
    counts,
    action: suggestNextAction({ counts, applications, alertCount: input.alertCount, today: input.today }),
    deadline: nextDeadline(applications, input.today),
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
      return '/(dashboard)/career/interviews';
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
