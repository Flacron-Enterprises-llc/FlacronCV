import { PLAN_CONFIGS } from '../../../../packages/shared-types/src/subscription.types';
import type { SubscriptionPlan as SharedPlan } from '../../../../packages/shared-types/src/enums';
import type { V1Usage } from './billing';
import { toDateOrNull } from '../../../../packages/shared-types/src/usage-period';

/**
 * Home screen data, as the website dashboard computes it
 * (apps/web/src/app/[locale]/(dashboard)/dashboard/page.tsx, first-visit.ts,
 * RecentActivity.tsx).
 */

const ONE_DAY_MS = 24 * 60 * 60 * 1000;

/**
 * "Welcome" rather than "Welcome back": the account was created within the
 * last day. Only when `createdAt` is unknown does the tour stand in (an
 * account that never saw a tour — website or app — has not been here before).
 */
export function isFirstVisit(
  user: { createdAt?: unknown; preferences?: { appTour?: unknown; mobileAppTour?: unknown } | null } | null | undefined,
  now = Date.now(),
): boolean {
  if (!user) return false;
  const created = toDateOrNull(user.createdAt as Parameters<typeof toDateOrNull>[0]);
  if (created) return now - created.getTime() < ONE_DAY_MS;
  return !user.preferences?.appTour && !user.preferences?.mobileAppTour;
}

export function greetingKey(firstVisit: boolean, hasName: boolean): 'firstNamed' | 'first' | 'named' | 'plain' {
  if (firstVisit) return hasName ? 'firstNamed' : 'first';
  return hasName ? 'named' : 'plain';
}

/** First name for the greeting: the profile's, else the first word of the display name. */
export function greetingName(user: { profile?: { firstName?: string } | null; displayName?: string | null } | null | undefined): string {
  return user?.profile?.firstName?.trim() || user?.displayName?.trim().split(/\s+/)[0] || '';
}

export interface DocumentStat {
  used: number;
  /** null = unlimited. */
  limit: number | null;
}

/**
 * CV and cover-letter stats: current plans limit STORED documents (capacity),
 * legacy plans count creations this month. GET /users/me/usage reports both.
 */
export function documentStats(plan: string, usage: V1Usage | null | undefined): { cvs: DocumentStat; coverLetters: DocumentStat } {
  const config = PLAN_CONFIGS[plan as SharedPlan] ?? PLAN_CONFIGS.free;
  const capacity = !config.legacy;
  const cvs = (capacity ? usage?.storedCvs : undefined) ?? usage?.cvsCreated ?? 0;
  const letters = (capacity ? usage?.storedCoverLetters : undefined) ?? usage?.coverLettersCreated ?? 0;
  const limit = (value: number | 'unlimited') => (value === 'unlimited' ? null : value);
  return {
    cvs: { used: cvs, limit: limit(config.limits.cvs) },
    coverLetters: { used: letters, limit: limit(config.limits.coverLetters) },
  };
}

/** Job stages shown on the home screen, in pipeline order. */
export const HOME_PIPELINE = ['saved', 'applied', 'interviewing', 'offered'] as const;
export type HomePipelineStage = (typeof HOME_PIPELINE)[number];

/** Active (not archived) applications per stage, plus the active total. */
export function jobPipelineCounts(jobs: readonly { status: string; archived?: boolean }[] | null | undefined): {
  active: number;
  counts: Record<HomePipelineStage, number>;
} {
  const active = (jobs ?? []).filter((job) => !job.archived);
  const counts = Object.fromEntries(HOME_PIPELINE.map((stage) => [stage, active.filter((job) => job.status === stage).length])) as Record<
    HomePipelineStage,
    number
  >;
  return { active: active.length, counts };
}
