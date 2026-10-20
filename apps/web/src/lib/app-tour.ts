import { APP_TOUR_VERSION, AppTourPreference, AppTourStatus } from '@flacroncv/shared-types';

/**
 * Interactive tour for the signed-in product.
 *
 * There is one end-user role (`user`). Admin and super_admin are staff
 * surfaces and do not get a separate tour or an automatic start. Subscription
 * plans do not add or remove steps; paid actions are never triggered.
 *
 * Accounts created before this field existed omit `preferences.appTour`.
 * Missing metadata is not "unseen" and must not auto-start the tour.
 */

export const APP_TOUR_CACHE_PREFIX = 'flacroncv_app_tour:';

export const TOUR_TARGETS = {
  welcome: 'dashboard-welcome',
  usage: 'dashboard-usage',
  createCv: 'dashboard-create-cv',
  myCvs: 'cv-list',
  coverLetters: 'cover-letters',
  jobs: 'jobs',
  templates: 'nav-templates',
  editorSections: 'cv-sections',
  editorAi: 'cv-ai',
  editorPreview: 'cv-preview',
  editorExport: 'cv-export',
  editorAts: 'cv-ats',
  settings: 'settings-replay',
} as const;

export type TourStepId =
  | 'welcome'
  | 'usage'
  | 'create-cv'
  | 'my-cvs'
  | 'cover-letters'
  | 'jobs'
  | 'templates'
  | 'editor-sections'
  | 'editor-ai'
  | 'editor-preview'
  | 'editor-export'
  | 'editor-ats'
  | 'settings';

export interface TourStep {
  id: TourStepId;
  /** Null stays on the current dashboard route. `editor` opens an existing CV. */
  route: string | 'editor' | null;
  target: string;
  /** Sidebar link — the mobile drawer has to be open to see it. */
  nav?: boolean;
  /** Shown only when the account already has a CV. Never creates one. */
  requiresCv?: boolean;
}

export const TOUR_STEPS: readonly TourStep[] = [
  { id: 'welcome', route: '/dashboard', target: TOUR_TARGETS.welcome },
  { id: 'usage', route: '/dashboard', target: TOUR_TARGETS.usage },
  { id: 'create-cv', route: '/dashboard', target: TOUR_TARGETS.createCv },
  { id: 'my-cvs', route: '/cv', target: TOUR_TARGETS.myCvs },
  { id: 'cover-letters', route: '/cover-letters', target: TOUR_TARGETS.coverLetters },
  { id: 'jobs', route: '/jobs', target: TOUR_TARGETS.jobs },
  { id: 'templates', route: null, target: TOUR_TARGETS.templates, nav: true },
  { id: 'editor-sections', route: 'editor', target: TOUR_TARGETS.editorSections, requiresCv: true },
  { id: 'editor-ai', route: 'editor', target: TOUR_TARGETS.editorAi, requiresCv: true },
  { id: 'editor-preview', route: 'editor', target: TOUR_TARGETS.editorPreview, requiresCv: true },
  { id: 'editor-export', route: 'editor', target: TOUR_TARGETS.editorExport, requiresCv: true },
  { id: 'editor-ats', route: 'editor', target: TOUR_TARGETS.editorAts, requiresCv: true },
  { id: 'settings', route: '/settings', target: TOUR_TARGETS.settings },
];

export interface TourEligibilityInput {
  role: string | null | undefined;
  emailVerified: boolean;
  placeholderAccount: boolean;
  degraded: boolean;
  appTour: AppTourPreference | null | undefined;
}

/** Automatic start. Replay is a separate, explicit action and ignores this. */
export function isAutoStartEligible(input: TourEligibilityInput): boolean {
  if (!input.emailVerified || input.placeholderAccount || input.degraded) return false;
  if (input.role !== 'user') return false;
  const status = input.appTour?.status;
  return status === 'unseen' || status === 'in_progress';
}

/**
 * Same steps for every role that can open the dashboard. Editor steps exist
 * only when `hasCv` means a document was listed and opened for this account.
 * The usage counter is not an input: it can disagree with the saved documents.
 * `role` is accepted so a future staff-only step cannot slip in unnoticed.
 */
export function selectTourSteps(input: { role?: string | null; hasCv: boolean }): TourStep[] {
  void input.role;
  return TOUR_STEPS.filter((step) => (step.requiresCv ? input.hasCv : true));
}

/**
 * The id the tour may open. `confirmedId` is the document a read-only fetch
 * just returned for this account. A list row that cannot be opened, a deleted
 * document, or a usage count with no row all produce null.
 */
export function resolveTourCvId(
  items: ReadonlyArray<{ id?: unknown }> | null | undefined,
  confirmedId: string | null | undefined,
): string | null {
  if (!confirmedId) return null;
  const listed = items?.some((item) => item?.id === confirmedId) ?? false;
  return listed ? confirmedId : null;
}

export function stepRoute(step: TourStep, cvId: string | null): string | null {
  if (step.route === 'editor') return cvId ? `/cv/${cvId}` : null;
  return step.route;
}

export function pathsMatch(current: string, expected: string): boolean {
  const clean = (value: string) => {
    const path = value.split('?')[0].split('#')[0].replace(/\/$/, '');
    return path || '/';
  };
  return clean(current) === clean(expected);
}

export function resumeIndex(steps: readonly { id: string }[], stepId: string | null | undefined): number {
  if (!stepId) return 0;
  const index = steps.findIndex((step) => step.id === stepId);
  return index >= 0 ? index : 0;
}

/**
 * Cache may only refine the resume step of an in-progress tour. It never
 * overrides a completed, skipped, or missing server record.
 */
export function effectiveResumeStepId(
  server: AppTourPreference | null | undefined,
  cache: AppTourPreference | null,
): string | null {
  if (!server || server.status !== 'in_progress') return null;
  if (
    cache &&
    cache.status === 'in_progress' &&
    typeof cache.stepId === 'string' &&
    (cache.updatedAt ?? '') > (server.updatedAt ?? '')
  ) {
    return cache.stepId;
  }
  return server.stepId;
}

export type TourWriteAction = 'progress' | 'skip' | 'complete';

/**
 * Returns null when the write must not happen. A replay never moves a
 * completed, skipped, or legacy (missing) account back to in-progress, so
 * abandoning it cannot turn automatic onboarding back on.
 */
export function nextTourRecord(
  current: AppTourPreference | null | undefined,
  action: TourWriteAction,
  stepId: string | null,
  replay: boolean,
  now: string,
): AppTourPreference | null {
  const status: AppTourStatus | undefined = current?.status;
  const terminal = status === 'completed' || status === 'skipped';
  const legacy = !current;

  if (action === 'progress') {
    if (replay && (terminal || legacy)) return null;
    if (!replay && terminal) return null;
    if (!replay && legacy) return null;
    return {
      version: current?.version ?? APP_TOUR_VERSION,
      status: 'in_progress',
      stepId,
      completedAt: current?.completedAt ?? null,
      skippedAt: current?.skippedAt ?? null,
      updatedAt: now,
    };
  }

  if (action === 'skip') {
    if (replay && (terminal || legacy)) return null;
    if (status === 'completed' || status === 'skipped') return null;
    if (legacy) return null;
    return {
      version: current?.version ?? APP_TOUR_VERSION,
      status: 'skipped',
      stepId: null,
      completedAt: current?.completedAt ?? null,
      skippedAt: now,
      updatedAt: now,
    };
  }

  return {
    version: current?.version ?? APP_TOUR_VERSION,
    status: 'completed',
    stepId: null,
    completedAt: now,
    skippedAt: current?.skippedAt ?? null,
    updatedAt: now,
  };
}

export function tourCacheKey(uid: string): string {
  return `${APP_TOUR_CACHE_PREFIX}${uid}`;
}

export function readTourCache(uid: string, storage: Pick<Storage, 'getItem'>): AppTourPreference | null {
  try {
    const raw = storage.getItem(tourCacheKey(uid));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as AppTourPreference;
    if (!parsed || typeof parsed !== 'object') return null;
    if (parsed.status !== 'unseen' && parsed.status !== 'in_progress' && parsed.status !== 'skipped' && parsed.status !== 'completed') {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

/** No-op when preference storage is not allowed. Never writes another user's key. */
export function writeTourCache(
  uid: string,
  value: AppTourPreference,
  storage: Pick<Storage, 'setItem'>,
  allowed: boolean,
): void {
  if (!allowed || !uid) return;
  try {
    storage.setItem(tourCacheKey(uid), JSON.stringify(value));
  } catch {
    /* storage blocked — the server record is the one that counts */
  }
}

export interface Box {
  top: number;
  left: number;
  width: number;
  height: number;
}

export interface ViewportInsets {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

/**
 * Place the tooltip in the viewport without covering the target when there
 * is room. Coordinates are clamped to the insets.
 */
export function placeTooltip(
  target: Box,
  tip: { width: number; height: number },
  viewport: { width: number; height: number },
  insets: ViewportInsets = { top: 8, right: 8, bottom: 8, left: 8 },
  gap = 12,
): { top: number; left: number } {
  const tw = Math.min(tip.width, Math.max(0, viewport.width - insets.left - insets.right));
  const th = Math.min(tip.height, Math.max(0, viewport.height - insets.top - insets.bottom));
  const spaceBelow = viewport.height - insets.bottom - (target.top + target.height);
  const spaceAbove = target.top - insets.top;

  let top: number;
  if (spaceBelow >= th + gap) top = target.top + target.height + gap;
  else if (spaceAbove >= th + gap) top = target.top - th - gap;
  else if (spaceBelow >= spaceAbove) top = target.top + target.height + gap;
  else top = target.top - th - gap;

  let left = target.left + target.width / 2 - tw / 2;
  const overlapsHorizontally = left < target.left + target.width && left + tw > target.left;
  const overlapsVertically = top < target.top + target.height && top + th > target.top;
  if (overlapsHorizontally && overlapsVertically) {
    const spaceRight = viewport.width - insets.right - (target.left + target.width);
    const spaceLeft = target.left - insets.left;
    if (spaceRight >= tw + gap) left = target.left + target.width + gap;
    else if (spaceLeft >= tw + gap) left = target.left - tw - gap;
  }

  left = clamp(left, insets.left, viewport.width - insets.right - tw);
  top = clamp(top, insets.top, viewport.height - insets.bottom - th);
  return { top, left };
}

function clamp(value: number, min: number, max: number): number {
  if (max < min) return min;
  return Math.min(max, Math.max(min, value));
}

function tourNodes(target: string, root: ParentNode): HTMLElement[] {
  return [...root.querySelectorAll<HTMLElement>(`[data-tour="${CSS.escape(target)}"]`)];
}

function hasBox(el: HTMLElement): boolean {
  const rect = el.getBoundingClientRect();
  return rect.width >= 1 && rect.height >= 1;
}

function intersectsViewport(el: HTMLElement): boolean {
  const rect = el.getBoundingClientRect();
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  return rect.bottom > 0 && rect.right > 0 && rect.top < vh && rect.left < vw;
}

/**
 * A target that has been laid out, even if it is still below the fold.
 * Prefer one already on screen. Used to scroll the real control into view
 * before the spotlight is shown.
 */
export function findLaidOutTourTarget(target: string, root: ParentNode = document): HTMLElement | null {
  if (typeof window === 'undefined') return null;
  let fallback: HTMLElement | null = null;
  for (const el of tourNodes(target, root)) {
    if (!hasBox(el)) continue;
    if (!fallback) fallback = el;
    if (intersectsViewport(el)) return el;
  }
  return fallback;
}

export function findVisibleTourTarget(target: string, root: ParentNode = document): HTMLElement | null {
  if (typeof window === 'undefined') return null;
  for (const el of tourNodes(target, root)) {
    if (!hasBox(el) || !intersectsViewport(el)) continue;
    return el;
  }
  return null;
}
