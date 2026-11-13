import { useQueryClient } from '@tanstack/react-query';
import { useRouter, useSegments, type Href } from 'expo-router';
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { Alert } from 'react-native';
import { CAREER_ENABLED } from '../config/career';
import { t } from '../i18n';
import { api } from '../lib/api';
import {
  isAutoStartEligible,
  isDashboardHome,
  newerTourRecord,
  nextTourRecord,
  selectMobileTourSteps,
  startIndex,
  tourPreferencePatch,
  type MobileTourStep,
  type TourWriteAction,
} from '../lib/app-tour';
import { useAuthStore } from '../store/auth-store';
import type { AppTourPreference, User } from '../types/user.types';

/**
 * Mobile app tour state. Mount <AppTourProvider> once inside the signed-in
 * dashboard layout (it needs the router and the auth store) and render
 * <AppTour /> from src/components/tour/AppTour.tsx inside it.
 *
 * Progress is saved to `preferences.mobileAppTour` with
 * PATCH /users/me/preferences. The website's `preferences.appTour` is never
 * read for decisions or written here, so the two tours stay independent.
 */

/**
 * Last record saved in this app session, per account. The auth store's user
 * is refreshed only on sync, so a remounted layout must not treat a finished
 * tour as unseen. Cleared when the process restarts (server record wins then).
 */
const sessionTour = new Map<string, AppTourPreference>();

/** Lets the dashboard finish its first paint before the sheet slides up. */
const AUTO_START_DELAY_MS = 800;

export interface AppTourView {
  steps: MobileTourStep[];
  index: number;
  /** Started from Settings/Support rather than automatically. */
  replay: boolean;
  /** "Show me" collapsed the card to a bar so the screen can be used. */
  minimized: boolean;
}

export interface AppTourContextValue {
  /** Null while no tour is running. */
  view: AppTourView | null;
  /** First name for the welcome title. */
  firstName: string | null;
  /** Starts from the first step. Does not clear a previous completion or skip. */
  replay: () => void;
  next: () => void;
  back: () => void;
  skip: () => void;
  /** Opens the step's tab/screen and collapses the card. */
  showMe: () => void;
  /** Re-opens the collapsed card. */
  expand: () => void;
}

const noop = () => {};

const AppTourContext = createContext<AppTourContextValue | null>(null);

/** Safe outside the provider: returns a no-op replay and no view. */
export function useAppTour(): AppTourContextValue {
  const ctx = useContext(AppTourContext);
  return (
    ctx ?? {
      view: null,
      firstName: null,
      replay: noop,
      next: noop,
      back: noop,
      skip: noop,
      showMe: noop,
      expand: noop,
    }
  );
}

/** Convenience for Settings / Support: `const replayTour = useAppTourReplay();` */
export function useAppTourReplay(): () => void {
  return useAppTour().replay;
}

export function AppTourProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const segments = useSegments();
  const qc = useQueryClient();
  const user = useAuthStore((s) => s.user);
  const firebaseUser = useAuthStore((s) => s.firebaseUser);
  const emailVerified = useAuthStore((s) => s.emailVerified);
  const userSyncError = useAuthStore((s) => s.userSyncError);
  const legalGate = useAuthStore((s) => s.legalGate);

  const [view, setView] = useState<AppTourView | null>(null);

  const uid = firebaseUser?.uid ?? null;
  const onDashboard = isDashboardHome(segments as readonly string[]);

  const recordRef = useRef<AppTourPreference | undefined>(undefined);
  const decided = useRef<string | null>(null);
  const writeChain = useRef<Promise<void>>(Promise.resolve());
  const errorShown = useRef(false);
  const epoch = useRef(0);
  const userRef = useRef<User | null>(user);
  userRef.current = user;

  const persist = useCallback(
    (action: TourWriteAction, stepId: string | null, replay: boolean) => {
      const token = epoch.current;
      writeChain.current = writeChain.current.then(async () => {
        const current = userRef.current;
        if (!current || token !== epoch.current) return;
        const next = nextTourRecord(recordRef.current, action, stepId, replay, new Date().toISOString());
        if (!next) return;
        try {
          await api.patch<User>('/users/me/preferences', tourPreferencePatch(next));
          if (token !== epoch.current) return;
          recordRef.current = next;
          sessionTour.set(current.uid, next);
          const withTour = (u: User): User => ({
            ...u,
            preferences: { ...u.preferences, mobileAppTour: next },
          });
          qc.setQueryData<User>(['user', current.uid], (old) => (old ? withTour(old) : old));
          useAuthStore.setState((s) =>
            s.user && s.user.uid === current.uid ? { user: withTour(s.user) } : {},
          );
        } catch {
          if (errorShown.current) return;
          errorShown.current = true;
          Alert.alert(t('tour.dialogLabel'), t('tour.saveError'));
        }
      });
    },
    [qc],
  );

  const start = useCallback(
    (replay: boolean) => {
      const current = userRef.current;
      if (!current) return;
      epoch.current += 1;
      recordRef.current = newerTourRecord(sessionTour.get(current.uid), current.preferences?.mobileAppTour);
      const steps = selectMobileTourSteps({ careerEnabled: CAREER_ENABLED });
      const index = startIndex(steps, recordRef.current, replay);
      setView({ steps, index, replay, minimized: false });
      persist('progress', steps[index].id, replay);
    },
    [persist],
  );

  // Signed out or switched account: drop any running tour.
  useEffect(() => {
    return () => {
      epoch.current += 1;
      decided.current = null;
      errorShown.current = false;
      setView(null);
    };
  }, [uid]);

  // Automatic start: once per account per app session, on the Dashboard tab.
  useEffect(() => {
    if (!uid || !user || user.uid !== uid || !onDashboard || legalGate) return;
    if (decided.current === uid) return;
    const timer = setTimeout(() => {
      const current = userRef.current;
      if (!current || current.uid !== uid || decided.current === uid) return;
      decided.current = uid;
      const eligible = isAutoStartEligible({
        role: current.role,
        emailVerified,
        degraded: !!userSyncError,
        tour: newerTourRecord(sessionTour.get(uid), current.preferences?.mobileAppTour),
      });
      if (eligible) start(false);
    }, AUTO_START_DELAY_MS);
    return () => clearTimeout(timer);
    // Unverified / degraded sessions simply wait: when the flag clears, this re-runs.
  }, [uid, user, onDashboard, legalGate, emailVerified, userSyncError, start]);

  const replay = useCallback(() => {
    if (uid) decided.current = uid; // a replay settles the automatic start too
    start(true);
  }, [start, uid]);

  // Actions read the latest view from a ref (not a state updater) so each
  // tap issues exactly one write, even when React re-runs updaters.
  const viewRef = useRef<AppTourView | null>(view);
  viewRef.current = view;
  const show = useCallback((v: AppTourView | null) => {
    viewRef.current = v;
    setView(v);
  }, []);

  const next = useCallback(() => {
    const v = viewRef.current;
    if (!v) return;
    if (v.index >= v.steps.length - 1) {
      show(null);
      persist('complete', null, v.replay);
      return;
    }
    const index = v.index + 1;
    show({ ...v, index, minimized: false });
    persist('progress', v.steps[index].id, v.replay);
  }, [persist, show]);

  const back = useCallback(() => {
    const v = viewRef.current;
    if (!v || v.index === 0) return;
    const index = v.index - 1;
    show({ ...v, index, minimized: false });
    persist('progress', v.steps[index].id, v.replay);
  }, [persist, show]);

  const skip = useCallback(() => {
    const v = viewRef.current;
    if (!v) return;
    show(null);
    persist('skip', null, v.replay);
  }, [persist, show]);

  const showMe = useCallback(() => {
    const v = viewRef.current;
    if (!v) return;
    const step = v.steps[v.index];
    show({ ...v, minimized: true });
    router.navigate(step.route as Href);
  }, [router, show]);

  const expand = useCallback(() => {
    const v = viewRef.current;
    if (v) show({ ...v, minimized: false });
  }, [show]);

  const firstName = user?.profile?.firstName ?? null;

  const value = useMemo<AppTourContextValue>(
    () => ({ view, firstName, replay, next, back, skip, showMe, expand }),
    [view, firstName, replay, next, back, skip, showMe, expand],
  );

  return React.createElement(AppTourContext.Provider, { value }, children);
}
