'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { AppTourPreference, User } from '@flacroncv/shared-types';
import { useRouter, usePathname } from '@/i18n/routing';
import { useAuth } from '@/providers/AuthProvider';
import { api } from '@/lib/api';
import { isAllowed, onConsentChange, readConsent } from '@/lib/consent';
import { useCVStore } from '@/store/cv-store';
import { useCoverLetterStore } from '@/store/cover-letter-store';
import {
  effectiveResumeStepId,
  findLaidOutTourTarget,
  findVisibleTourTarget,
  isAutoStartEligible,
  nextTourRecord,
  pathsMatch,
  readTourCache,
  resolveTourCvId,
  resumeIndex,
  selectTourSteps,
  stepRoute,
  TourStep,
  TourStepId,
  writeTourCache,
} from '@/lib/app-tour';
import AppTourOverlay from './AppTourOverlay';

/**
 * Last tour record saved in this tab. The auth profile is not rewritten after
 * each save, so a dashboard remount must not treat a finished tour as unseen.
 * A full reload drops this map and reads the server record.
 */
const sessionTour = new Map<string, AppTourPreference>();

function accountTour(user: User): AppTourPreference | undefined {
  const session = sessionTour.get(user.uid);
  const stored = user.preferences?.appTour;
  if (!session) return stored;
  if (!stored) return session;
  return (session.updatedAt ?? '') >= (stored.updatedAt ?? '') ? session : stored;
}

interface AppTourContextValue {
  /** Starts from the first step. Does not clear a previous completion or skip. */
  replay: () => void;
}

const AppTourContext = createContext<AppTourContextValue | null>(null);

export function useAppTourReplay(): () => void {
  const ctx = useContext(AppTourContext);
  return ctx?.replay ?? (() => {});
}

interface AppTourProviderProps {
  children: ReactNode;
  sidebarOpen: boolean;
  setSidebarOpen: (open: boolean) => void;
  sidebarCollapsed: boolean;
  setSidebarCollapsed: (collapsed: boolean) => void;
}

interface TourView {
  step: TourStep;
  index: number;
  total: number;
}

type Move = 'next' | 'back' | 'skip' | 'cancel';

interface ChromeMemory {
  touchedMobile: boolean;
  mobileWasOpen: boolean;
  collapsedBefore: boolean | null;
}

function hasUnsavedDocumentEdits(): boolean {
  return useCVStore.getState().isDirty || useCoverLetterStore.getState().isDirty;
}

function tourName(user: User | null): string {
  const first = user?.profile?.firstName?.trim() ?? '';
  if (!first || first.includes('@')) return '';
  return first;
}

function stepCopy(
  t: (key: string, values?: Record<string, string | number>) => string,
  id: TourStepId,
  name: string,
): { title: string; body: string } {
  switch (id) {
    case 'welcome':
      return {
        title: name ? t('welcomeTitleNamed', { name }) : t('welcomeTitle'),
        body: t('welcomeBody'),
      };
    case 'usage':
      return { title: t('usageTitle'), body: t('usageBody') };
    case 'create-cv':
      return { title: t('createCvTitle'), body: t('createCvBody') };
    case 'my-cvs':
      return { title: t('myCvsTitle'), body: t('myCvsBody') };
    case 'cover-letters':
      return { title: t('coverLettersTitle'), body: t('coverLettersBody') };
    case 'jobs':
      return { title: t('jobsTitle'), body: t('jobsBody') };
    case 'templates':
      return { title: t('templatesTitle'), body: t('templatesBody') };
    case 'editor-sections':
      return { title: t('sectionsTitle'), body: t('sectionsBody') };
    case 'editor-ai':
      return { title: t('aiTitle'), body: t('aiBody') };
    case 'editor-preview':
      return { title: t('previewTitle'), body: t('previewBody') };
    case 'editor-export':
      return { title: t('exportTitle'), body: t('exportBody') };
    case 'editor-ats':
      return { title: t('atsTitle'), body: t('atsBody') };
    case 'settings':
      return { title: t('settingsTitle'), body: t('settingsBody') };
    default:
      return { title: t('welcomeTitle'), body: t('welcomeBody') };
  }
}

function waitFrames(count: number): Promise<void> {
  return new Promise((resolve) => {
    const step = (left: number) => {
      if (left <= 0) resolve();
      else requestAnimationFrame(() => step(left - 1));
    };
    step(count);
  });
}

function waitFor(check: () => boolean, timeoutMs: number, alive: () => boolean): Promise<boolean> {
  return new Promise((resolve) => {
    const start = Date.now();
    const tick = () => {
      if (!alive()) {
        resolve(false);
        return;
      }
      if (check()) {
        resolve(true);
        return;
      }
      if (Date.now() - start >= timeoutMs) {
        resolve(false);
        return;
      }
      requestAnimationFrame(tick);
    };
    tick();
  });
}

/**
 * Read-only. A listed CV is usable only when that same id can be fetched.
 * A usage count is intentionally not read here.
 */
async function resolveAccessibleCvId(alive: () => boolean): Promise<string | null> {
  const listed = await Promise.race([
    api.get<{ items?: { id?: string }[] }>('/cvs?limit=1').catch(() => null),
    new Promise<null>((resolve) => {
      window.setTimeout(() => resolve(null), 8000);
    }),
  ]);
  if (!alive()) return null;
  const candidate = listed?.items?.find((item) => typeof item?.id === 'string' && item.id.length > 0)?.id ?? null;
  if (!candidate) return resolveTourCvId(listed?.items, null);
  const opened = await Promise.race([
    api.get<{ id?: string }>(`/cvs/${candidate}`).catch(() => null),
    new Promise<null>((resolve) => {
      window.setTimeout(() => resolve(null), 8000);
    }),
  ]);
  if (!alive()) return null;
  return resolveTourCvId(listed?.items, opened?.id === candidate ? candidate : null);
}

/**
 * Owns the tour for the signed-in dashboard. Mounted only after auth has
 * resolved, so it never runs on the public site or the sign-in form.
 */
export default function AppTourProvider({
  children,
  sidebarOpen,
  setSidebarOpen,
  sidebarCollapsed,
  setSidebarCollapsed,
}: AppTourProviderProps) {
  const t = useTranslations('tour');
  const { user, emailVerified, degraded, placeholderAccount } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  const [view, setView] = useState<TourView | null>(null);

  const epoch = useRef(0);
  const moveRef = useRef<((move: Move) => void) | null>(null);
  const decided = useRef<string | null>(null);
  const toastShown = useRef(false);
  const recordRef = useRef<AppTourPreference | null | undefined>(undefined);
  const cvIdRef = useRef<string | null>(null);
  const focusRef = useRef<HTMLElement | null>(null);
  const userRef = useRef(user);
  const pathnameRef = useRef(pathname);
  const routerRef = useRef(router);
  const degradedRef = useRef(degraded);
  const placeholderRef = useRef(placeholderAccount);
  const sidebarOpenRef = useRef(sidebarOpen);
  const sidebarCollapsedRef = useRef(sidebarCollapsed);
  const tRef = useRef(t);
  const chromeRef = useRef<ChromeMemory>({ touchedMobile: false, mobileWasOpen: false, collapsedBefore: null });

  userRef.current = user;
  pathnameRef.current = pathname;
  routerRef.current = router;
  degradedRef.current = degraded;
  placeholderRef.current = placeholderAccount;
  sidebarOpenRef.current = sidebarOpen;
  sidebarCollapsedRef.current = sidebarCollapsed;
  tRef.current = t;

  const restoreChrome = useCallback(() => {
    const chrome = chromeRef.current;
    if (chrome.collapsedBefore) setSidebarCollapsed(true);
    if (chrome.touchedMobile) setSidebarOpen(chrome.mobileWasOpen);
    chromeRef.current = { touchedMobile: false, mobileWasOpen: false, collapsedBefore: null };
  }, [setSidebarCollapsed, setSidebarOpen]);

  const restoreRef = useRef(restoreChrome);
  restoreRef.current = restoreChrome;

  const notifySaveError = useCallback(() => {
    if (toastShown.current) return;
    toastShown.current = true;
    toast.error(tRef.current('saveError'));
  }, []);

  const persist = useCallback(
    async (action: 'progress' | 'skip' | 'complete', stepId: string | null, replay: boolean, alive: () => boolean) => {
      const currentUser = userRef.current;
      if (!currentUser || !alive()) return;
      const next = nextTourRecord(recordRef.current, action, stepId, replay, new Date().toISOString());
      if (!next) return;
      if (degradedRef.current || placeholderRef.current) {
        notifySaveError();
        return;
      }
      try {
        await api.patch('/users/me/preferences', { appTour: next });
        recordRef.current = next;
        sessionTour.set(currentUser.uid, next);
        writeTourCache(currentUser.uid, next, localStorage, isAllowed('preferences'));
      } catch {
        notifySaveError();
      }
    },
    [notifySaveError],
  );

  const syncChrome = useCallback(
    async (step: TourStep) => {
      const mobile = window.innerWidth < 1024;
      const chrome = chromeRef.current;
      if (step.nav) {
        if (mobile) {
          if (!chrome.touchedMobile) {
            chrome.mobileWasOpen = sidebarOpenRef.current;
            chrome.touchedMobile = true;
          }
          setSidebarOpen(true);
        } else if (sidebarCollapsedRef.current) {
          if (chrome.collapsedBefore === null) chrome.collapsedBefore = true;
          setSidebarCollapsed(false);
        }
        await waitFrames(2);
        return;
      }
      if (mobile && chrome.touchedMobile) {
        setSidebarOpen(false);
        await waitFrames(2);
      }
    },
    [setSidebarCollapsed, setSidebarOpen],
  );

  const runRef = useRef<(opts: { replay: boolean }) => Promise<'retry' | 'settled'>>(async () => 'settled');

  runRef.current = async ({ replay }) => {
    const currentUser = userRef.current;
    if (!currentUser) return 'settled';
    moveRef.current?.('cancel');
    const token = ++epoch.current;
    const alive = () => epoch.current === token;
    recordRef.current = accountTour(currentUser);
    cvIdRef.current = null;
    if (!focusRef.current) {
      focusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    }

    if (document.querySelector('[role="dialog"]')) {
      if (replay) toast.error(tRef.current('blocked'));
      return replay ? 'settled' : 'retry';
    }

    const accessibleCvId = await resolveAccessibleCvId(alive);
    if (!alive()) return 'settled';
    cvIdRef.current = accessibleCvId;
    const steps = selectTourSteps({ role: currentUser.role, hasCv: accessibleCvId !== null });
    let index = 0;
    if (!replay && recordRef.current?.status === 'in_progress') {
      const cache = isAllowed('preferences') ? readTourCache(currentUser.uid, localStorage) : null;
      index = resumeIndex(steps, effectiveResumeStepId(recordRef.current, cache));
    }

    let shownAny = false;
    let stoppedForUnsaved = false;
    let retryWhenReady = false;

    const present = async (step: TourStep): Promise<'shown' | 'missing' | 'blocked'> => {
      if (!alive()) return 'blocked';
      setView(null);
      await syncChrome(step);
      if (!alive()) return 'blocked';
      if (step.requiresCv && !cvIdRef.current) return 'missing';
      const route = stepRoute(step, cvIdRef.current);
      let navigated = false;
      if (route && !pathsMatch(pathnameRef.current, route)) {
        if (hasUnsavedDocumentEdits()) {
          stoppedForUnsaved = true;
          return 'blocked';
        }
        routerRef.current.push(route);
        navigated = true;
        const arrived = await waitFor(() => pathsMatch(pathnameRef.current, route), 5000, alive);
        if (!arrived) return alive() ? 'missing' : 'blocked';
        await syncChrome(step);
        if (!alive()) return 'blocked';
      }
      const laidOut = await waitFor(() => findLaidOutTourTarget(step.target) !== null, 8000, alive);
      if (!alive()) return 'blocked';
      if (!laidOut) {
        if (!navigated && !shownAny) retryWhenReady = true;
        return navigated || shownAny ? 'missing' : 'blocked';
      }
      findLaidOutTourTarget(step.target)?.scrollIntoView({ block: 'center', inline: 'nearest', behavior: 'auto' });
      await waitFrames(2);
      const visible = await waitFor(() => findVisibleTourTarget(step.target) !== null, 1500, alive);
      if (!alive()) return 'blocked';
      if (!visible) {
        if (!navigated && !shownAny) retryWhenReady = true;
        return navigated || shownAny ? 'missing' : 'blocked';
      }
      await persist('progress', step.id, replay, alive);
      return alive() ? 'shown' : 'blocked';
    };

    try {
      while (alive()) {
        if (index >= steps.length) {
          if (shownAny) await persist('complete', null, replay, alive);
          break;
        }
        const outcome = await present(steps[index]);
        if (!alive() || outcome === 'blocked') break;
        if (outcome === 'missing') {
          if (steps[index]?.requiresCv) {
            cvIdRef.current = null;
            while (index < steps.length && steps[index]?.requiresCv) steps.splice(index, 1);
          } else {
            steps.splice(index, 1);
          }
          if (index >= steps.length) {
            if (shownAny) await persist('complete', null, replay, alive);
            break;
          }
          continue;
        }
        shownAny = true;
        setView({ step: steps[index], index, total: steps.length });
        const move = await new Promise<Move>((resolve) => {
          if (!alive()) {
            resolve('cancel');
            return;
          }
          moveRef.current = (next) => {
            moveRef.current = null;
            resolve(next);
          };
        });
        if (!alive() || move === 'cancel') break;
        if (move === 'skip') {
          await persist('skip', null, replay, alive);
          break;
        }
        if (move === 'back') {
          if (index > 0) index -= 1;
          continue;
        }
        if (index >= steps.length - 1) {
          await persist('complete', null, replay, alive);
          break;
        }
        index += 1;
      }
    } finally {
      if (alive()) {
        restoreRef.current();
        setView(null);
        const previous = focusRef.current;
        focusRef.current = null;
        previous?.focus?.();
        if (stoppedForUnsaved) {
          toast.error(tRef.current('unsaved'));
        }
      }
    }
    return retryWhenReady && !shownAny ? 'retry' : 'settled';
  };

  useEffect(() => {
    return () => {
      epoch.current += 1;
      moveRef.current?.('cancel');
      moveRef.current = null;
      restoreRef.current();
      decided.current = null;
      toastShown.current = false;
      setView(null);
    };
  }, [user?.uid]);

  useEffect(() => {
    const uid = user?.uid;
    if (!uid || placeholderAccount || degraded || !emailVerified) return;
    if (decided.current === uid) return;

    let cancelled = false;
    let attempts = 0;
    const tryStart = () => {
      if (cancelled || decided.current === uid) return;
      if (readConsent() === null) return;
      if (document.querySelector('[role="dialog"]')) return;
      if (document.querySelector('[data-maintenance]')) return;
      const current = userRef.current;
      if (!current || current.uid !== uid) return;
      decided.current = uid;
      if (
        !isAutoStartEligible({
          role: current.role,
          emailVerified: true,
          placeholderAccount: false,
          degraded: false,
          appTour: accountTour(current),
        })
      ) {
        return;
      }
      attempts += 1;
      void runRef.current({ replay: false }).then((result) => {
        if (cancelled) return;
        if (result === 'retry' && attempts < 4) decided.current = null;
      });
    };

    const unsubscribe = onConsentChange(tryStart);
    const timer = window.setTimeout(tryStart, 400);
    const retry = window.setInterval(tryStart, 500);
    return () => {
      cancelled = true;
      unsubscribe();
      window.clearTimeout(timer);
      window.clearInterval(retry);
    };
  }, [user?.uid, placeholderAccount, degraded, emailVerified]);

  const replay = useCallback(() => {
    setSidebarOpen(false);
    focusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    void runRef.current({ replay: true });
  }, [setSidebarOpen]);

  const go = (move: Move) => {
    moveRef.current?.(move);
  };

  const copy = view ? stepCopy(t, view.step.id, tourName(user)) : null;

  return (
    <AppTourContext.Provider value={{ replay }}>
      {children}
      {view && copy && (
        <AppTourOverlay
          target={view.step.target}
          title={copy.title}
          body={copy.body}
          progress={t('progress', { current: view.index + 1, total: view.total })}
          backLabel={t('back')}
          skipLabel={t('skip')}
          nextLabel={t('next')}
          finishLabel={t('finish')}
          dialogLabel={t('dialogLabel')}
          isFirst={view.index === 0}
          isLast={view.index === view.total - 1}
          busy={false}
          onBack={() => go('back')}
          onSkip={() => go('skip')}
          onNext={() => go('next')}
        />
      )}
    </AppTourContext.Provider>
  );
}
