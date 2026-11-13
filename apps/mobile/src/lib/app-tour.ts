import { hasKey, t } from '../i18n';
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

/** Segment under `tour.steps.*` (src/i18n/locales/<locale>/tour.json) for each step. */
const STEP_COPY_KEY: Record<MobileTourStepId, string> = {
  welcome: 'welcome',
  usage: 'usage',
  cvs: 'cvs',
  'cover-letters': 'coverLetters',
  jobs: 'jobs',
  templates: 'templates',
  career: 'career',
  settings: 'settings',
};

function stepCopy(id: MobileTourStepId, field: 'show' | 'title' | 'body'): string {
  const key = `tour.steps.${STEP_COPY_KEY[id]}.${field}`;
  return hasKey(key) ? t(key) : '';
}

/**
 * Copy follows the website tour (`tour.*` in apps/web/public/locales/en/common.json),
 * adapted to tabs. `showLabel` / `title` / `body` are getters, so they read the
 * current language every time they are rendered.
 */
function tourStep(id: MobileTourStepId, route: string, requiresCareer?: true): MobileTourStep {
  return {
    id,
    route,
    ...(requiresCareer ? { requiresCareer } : {}),
    get showLabel() {
      return stepCopy(id, 'show');
    },
    get title() {
      return stepCopy(id, 'title');
    },
    get body() {
      return stepCopy(id, 'body');
    },
  };
}

export const MOBILE_TOUR_STEPS: readonly MobileTourStep[] = [
  tourStep('welcome', '/(dashboard)'),
  tourStep('usage', '/(dashboard)'),
  tourStep('cvs', '/(dashboard)/cvs'),
  tourStep('cover-letters', '/(dashboard)/cover-letters'),
  tourStep('jobs', '/(dashboard)/jobs'),
  tourStep('templates', '/(dashboard)/templates'),
  tourStep('career', '/(dashboard)/career', true),
  tourStep('settings', '/(dashboard)/settings'),
];

export function selectMobileTourSteps(input: { careerEnabled: boolean }): MobileTourStep[] {
  return MOBILE_TOUR_STEPS.filter((step) => (step.requiresCareer ? input.careerEnabled : true));
}

/** Welcome title uses the first name like the website ("Welcome, {name}"). */
export function stepTitle(step: MobileTourStep, firstName: string | null | undefined): string {
  if (step.id !== 'welcome') return step.title;
  const name = firstName?.trim() ?? '';
  if (!name || name.includes('@')) return step.title;
  return t('tour.welcomeTitleNamed', { name });
}

export function progressLabel(index: number, total: number): string {
  return t('tour.progress', { current: index + 1, total });
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
