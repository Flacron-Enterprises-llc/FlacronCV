import type { AppTourPreference, AppTourStatus } from '../types/user.types';

/**
 * Mobile app tour (iOS and Android).
 *
 * Mirrors the website tour (apps/web/src/lib/app-tour.ts) but is stored in its
 * own record, `preferences.mobileAppTour`, never in `preferences.appTour`:
 * the two have different steps, and finishing the tour on one platform must
 * not suppress it on the other. The mobile app never writes `appTour`.
 *
 * Same rules as the website:
 * - Accounts created before the field existed omit it. Missing is not
 *   "unseen" and never auto-starts the tour.
 * - Only the end-user role auto-starts; staff roles and degraded / unverified
 *   sessions do not.
 * - A replay never moves a completed, skipped, or missing record back to
 *   in-progress, so abandoning a replay cannot re-enable the automatic start.
 *
 * Pure module: no React Native or Expo imports (vitest runs it in node).
 */

export const MOBILE_APP_TOUR_VERSION = 1;

export type MobileTourStepId =
  | 'welcome'
  | 'usage'
  | 'cvs'
  | 'cover-letters'
  | 'jobs'
  | 'templates'
  | 'career'
  | 'settings';

export interface MobileTourStep {
  id: MobileTourStepId;
  /** expo-router href that "Show me" opens. */
  route: string;
  /** Label of the "Show me" button (names the place it opens). */
  showLabel: string;
  title: string;
  body: string;
  /** Shown only when the build has the career add-on (CAREER_ENABLED). */
  requiresCareer?: boolean;
}

/** Copy follows the website tour (`tour.*` in apps/web/public/locales/en/common.json), adapted to tabs. */
export const MOBILE_TOUR_STEPS: readonly MobileTourStep[] = [
  {
    id: 'welcome',
    route: '/(dashboard)',
    showLabel: 'Show dashboard',
    title: 'Welcome to FlacronCV',
    body: 'This short tour shows where to build a CV, write a cover letter, and track jobs. You can leave at any time.',
  },
  {
    id: 'usage',
    route: '/(dashboard)',
    showLabel: 'Show dashboard',
    title: 'Your plan and usage',
    body: 'CVs, AI credits, and exports follow your current plan. These counts update as you work. Nothing here starts a payment.',
  },
  {
    id: 'cvs',
    route: '/(dashboard)/cvs',
    showLabel: 'Show My CVs',
    title: 'My CVs',
    body: 'Every CV you save is listed here. Tap New CV when you are ready: you pick a template, then edit your own content. This tour does not create a CV for you.',
  },
  {
    id: 'cover-letters',
    route: '/(dashboard)/cover-letters',
    showLabel: 'Show Cover Letters',
    title: 'Cover letters',
    body: 'Write a letter for a role and, if you want, improve a draft with AI later. Opening this tab does not spend credits.',
  },
  {
    id: 'jobs',
    route: '/(dashboard)/jobs',
    showLabel: 'Show Job Tracker',
    title: 'Job tracker',
    body: 'Keep companies and stages in one list, from wishlist to offer. A job is added only when you choose to. Open it from the dashboard.',
  },
  {
    id: 'templates',
    route: '/(dashboard)/templates',
    showLabel: 'Show Templates',
    title: 'Templates',
    body: 'Browse CV layouts here. Some designs are part of a paid plan. This tour does not select one.',
  },
  {
    id: 'career',
    route: '/(dashboard)/career',
    showLabel: 'Show Career tools',
    title: 'Career tools',
    body: 'Career tools is an optional add-on for planning your next move. Open it from the dashboard. This tour does not start anything there.',
    requiresCareer: true,
  },
  {
    id: 'settings',
    route: '/(dashboard)/settings',
    showLabel: 'Show Settings',
    title: 'Replay anytime',
    body: 'Replay App Tour is in Settings and on the Support page. Finish now and it will not start by itself again.',
  },
];

export function selectMobileTourSteps(input: { careerEnabled: boolean }): MobileTourStep[] {
  return MOBILE_TOUR_STEPS.filter((step) => (step.requiresCareer ? input.careerEnabled : true));
}

/** Welcome title uses the first name like the website ("Welcome, {name}"). */
export function stepTitle(step: MobileTourStep, firstName: string | null | undefined): string {
  if (step.id !== 'welcome') return step.title;
  const name = firstName?.trim() ?? '';
  if (!name || name.includes('@')) return step.title;
  return `Welcome, ${name}`;
}

export function progressLabel(index: number, total: number): string {
  return `Step ${index + 1} of ${total}`;
}

export interface MobileTourEligibilityInput {
  role: string | null | undefined;
  emailVerified: boolean;
  /** Account sync failed (userSyncError) — never start on a stale record. */
  degraded: boolean;
  tour: AppTourPreference | null | undefined;
}

/** Automatic start (same rule as the website). Replay is explicit and ignores this. */
export function isAutoStartEligible(input: MobileTourEligibilityInput): boolean {
  if (!input.emailVerified || input.degraded) return false;
  if (input.role !== 'user') return false;
  const status = input.tour?.status;
  return status === 'unseen' || status === 'in_progress';
}

export function resumeIndex(steps: readonly { id: string }[], stepId: string | null | undefined): number {
  if (!stepId) return 0;
  const index = steps.findIndex((step) => step.id === stepId);
  return index >= 0 ? index : 0;
}

/** The step to resume at: only an in-progress record resumes. */
export function startIndex(
  steps: readonly { id: string }[],
  record: AppTourPreference | null | undefined,
  replay: boolean,
): number {
  if (replay || record?.status !== 'in_progress') return 0;
  return resumeIndex(steps, record.stepId);
}

/**
 * The newer of the record saved in this app session and the one on the
 * signed-in user. The auth store's user is not refreshed after each PATCH, so
 * a remounted dashboard must not treat a finished tour as unseen.
 */
export function newerTourRecord(
  session: AppTourPreference | null | undefined,
  stored: AppTourPreference | null | undefined,
): AppTourPreference | undefined {
  if (!session) return stored ?? undefined;
  if (!stored) return session;
  return (session.updatedAt ?? '') >= (stored.updatedAt ?? '') ? session : stored;
}

export type TourWriteAction = 'progress' | 'skip' | 'complete';

/**
 * Returns null when the write must not happen (same rules as the website's
 * nextTourRecord). A replay never moves a completed, skipped, or legacy
 * (missing) account back to in-progress.
 */
export function nextTourRecord(
  current: AppTourPreference | null | undefined,
  action: TourWriteAction,
  stepId: string | null,
  replay: boolean,
  now: string,
): AppTourPreference | null {
  // `replay` is kept for parity with the website signature: with or without
  // it, progress/skip never revive a terminal or missing record.
  void replay;
  const status: AppTourStatus | undefined = current?.status;
  const terminal = status === 'completed' || status === 'skipped';
  const legacy = !current;

  if (action === 'progress') {
    if (terminal || legacy) return null;
    return {
      version: current?.version ?? MOBILE_APP_TOUR_VERSION,
      status: 'in_progress',
      stepId,
      completedAt: current?.completedAt ?? null,
      skippedAt: current?.skippedAt ?? null,
      updatedAt: now,
    };
  }

  if (action === 'skip') {
    if (terminal || legacy) return null;
    return {
      version: current?.version ?? MOBILE_APP_TOUR_VERSION,
      status: 'skipped',
      stepId: null,
      completedAt: current?.completedAt ?? null,
      skippedAt: now,
      updatedAt: now,
    };
  }

  return {
    version: current?.version ?? MOBILE_APP_TOUR_VERSION,
    status: 'completed',
    stepId: null,
    completedAt: now,
    skippedAt: current?.skippedAt ?? null,
    updatedAt: now,
  };
}

/** Body of PATCH /users/me/preferences. Only the mobile record — never `appTour`. */
export function tourPreferencePatch(record: AppTourPreference): { mobileAppTour: AppTourPreference } {
  return { mobileAppTour: record };
}

/**
 * True on the Dashboard tab root (app/(dashboard)/index.tsx). expo-router
 * segments there are ['(dashboard)'] (some versions append 'index').
 */
export function isDashboardHome(segments: readonly string[]): boolean {
  if (segments[0] !== '(dashboard)') return false;
  return segments.slice(1).every((s) => s === 'index' || s.startsWith('('));
}
