import { isApplicationStatus, isDateOnly, type ApplicationStatus } from './applications';
import type { FactCounts } from './facts';

/**
 * What the dashboard suggests next. A link only. It does not reserve a unit.
 * Order: unfinished profile, then the soonest open deadline, then an alert,
 * then interview practice, then search.
 */
export interface DashboardApplication {
  id: string;
  opportunityId: string;
  status: string;
  title: string;
  deadline: string | null;
}

export interface DashboardAction {
  kind: 'profile' | 'application' | 'alerts' | 'interview' | 'search';
  reason: 'missing_core' | 'deadline' | 'alert' | 'interviewing' | 'ready';
  applicationId: string | null;
  opportunityId: string | null;
  deadline: string | null;
  title: string | null;
}

const CLOSED = new Set(['rejected', 'withdrawn']);

export function utcDateOnly(now: Date): string {
  return now.toISOString().slice(0, 10);
}

/** The soonest deadline on or after today. Past dates and closed cards are skipped. */
export function nextDeadline(applications: readonly DashboardApplication[], today: string): DashboardApplication | null {
  let best: DashboardApplication | null = null;
  for (const item of applications) {
    if (CLOSED.has(item.status)) continue;
    if (!item.deadline || !isDateOnly(item.deadline) || !isDateOnly(today)) continue;
    if (item.deadline < today) continue;
    if (!best || !best.deadline || item.deadline < best.deadline) best = item;
  }
  return best;
}

export function suggestNextAction(input: {
  counts: FactCounts;
  applications: readonly DashboardApplication[];
  alertCount: number;
  today: string;
}): DashboardAction {
  if (input.counts.confirmed === 0 || input.counts.missingCore.length > 0) {
    return empty('profile', 'missing_core');
  }
  const deadline = nextDeadline(input.applications, input.today);
  if (deadline) {
    return {
      kind: 'application',
      reason: 'deadline',
      applicationId: deadline.id,
      opportunityId: deadline.opportunityId,
      deadline: deadline.deadline,
      title: deadline.title,
    };
  }
  if (input.alertCount > 0) return empty('alerts', 'alert');
  const interviewing = input.applications.find((item) => item.status === 'interviewing');
  if (interviewing) {
    return {
      kind: 'interview',
      reason: 'interviewing',
      applicationId: interviewing.id,
      opportunityId: interviewing.opportunityId,
      deadline: null,
      title: interviewing.title,
    };
  }
  return empty('search', 'ready');
}

export function savedApplicationCount(applications: readonly DashboardApplication[]): number {
  return applications.filter((item) => item.status === 'saved').length;
}

export function stageCounts(applications: readonly DashboardApplication[]): Record<ApplicationStatus, number> {
  const counts: Record<ApplicationStatus, number> = {
    saved: 0,
    preparing: 0,
    applied: 0,
    interviewing: 0,
    offered: 0,
    rejected: 0,
    withdrawn: 0,
  };
  for (const item of applications) {
    if (isApplicationStatus(item.status)) counts[item.status] += 1;
  }
  return counts;
}

function empty(kind: DashboardAction['kind'], reason: DashboardAction['reason']): DashboardAction {
  return { kind, reason, applicationId: null, opportunityId: null, deadline: null, title: null };
}
