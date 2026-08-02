'use client';
import React from 'react';

import { useEffect, useCallback, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { api } from '@/lib/api';
import { Link } from '@/i18n/routing';
import { cn } from '@/lib/utils';
import { useCVStore } from '@/store/cv-store';
import { CV, CVSection } from '@flacroncv/shared-types';
import { toast } from 'sonner';
import Button from '@/components/ui/Button';
import CVEditor from '@/components/cv-builder/CVEditor';
import LivePreview from '@/components/cv-builder/LivePreview';
import EditorToolbar from '@/components/cv-builder/toolbar/EditorToolbar';
import { Loader2, AlertTriangle, Pencil, Eye } from 'lucide-react';

/** Shape written to / read from localStorage for offline resilience. */
interface CVBackup {
  cv: CV;
  sections: CVSection[];
  persistedSectionIds: string[];
  savedAt: number;
}

/** Returns the localStorage key for a given CV id. */
const backupKey = (id: string) => `cv_backup_${id}`;

/**
 * Firestore Timestamps serialize to `{ _seconds, _nanoseconds }` (or
 * `{ seconds, nanoseconds }`) over the wire, not an ISO string. Parsing that
 * with `new Date()` yields NaN, so the backup freshness check would always
 * treat the local copy as newer. This normalizes any of those shapes to a ms
 * epoch, falling back to 0 when the value is unrecognizable.
 */
function toEpochMs(value: unknown): number {
  if (!value) return 0;
  if (typeof value === 'string' || typeof value === 'number') {
    const t = new Date(value).getTime();
    return Number.isNaN(t) ? 0 : t;
  }
  if (typeof value === 'object') {
    const v = value as { _seconds?: number; seconds?: number };
    const secs = v._seconds ?? v.seconds;
    if (typeof secs === 'number') return secs * 1000;
  }
  return 0;
}

/** Persist current editor state before every save attempt. */
function writeBackup(cvId: string, backup: CVBackup) {
  try {
    localStorage.setItem(backupKey(cvId), JSON.stringify(backup));
  } catch {
    // Storage quota exceeded — silently ignore
  }
}

/** Remove the backup after a successful server save. */
function clearBackup(cvId: string) {
  try {
    localStorage.removeItem(backupKey(cvId));
  } catch {}
}

export default function CVBuilderPage(): React.JSX.Element | null {
  const params = useParams();
  const cvId = params.id as string;
  const queryClient = useQueryClient();
  const t = useTranslations('cv_builder');
  // Mobile: the preview is hidden by default; this toggles editor ↔ preview
  // below the lg breakpoint so small-screen users are never editing blind.
  const [mobileView, setMobileView] = useState<'edit' | 'preview'>('edit');
  const {
    reset, setCV, setSections, resetHistory,
    cv, sections, persistedSectionIds,
    isDirty, setIsSaving, markSaved, markSectionsPersisted, setPersistedSectionIds,
  } = useCVStore();
  const saveTimerRef = useRef<NodeJS.Timeout | undefined>(undefined);
  const saveErrorToastRef = useRef<string | number | undefined>(undefined);
  // Bumped on each autosave failure to re-arm the save effect (see below).
  const [retryTick, setRetryTick] = useState(0);

  // Reset store and invalidate queries when switching CVs.
  // On unmount: flush any pending unsaved changes before clearing state so the
  // user never silently loses work when navigating away.
  useEffect(() => {
    reset();
    queryClient.removeQueries({ queryKey: ['cv', cvId] });
    queryClient.removeQueries({ queryKey: ['cv-sections', cvId] });

    return () => {
      clearTimeout(saveTimerRef.current);

      // Read current state synchronously — safe to call outside React render
      const {
        isDirty: dirty,
        cv: currentCV,
        sections: currentSections,
        persistedSectionIds: currentPersistedIds,
      } = useCVStore.getState();

      if (dirty && currentCV) {
        const newSections     = currentSections.filter((s) => !currentPersistedIds.includes(s.id));
        const existingSections = currentSections.filter((s) => currentPersistedIds.includes(s.id));
        const deletedIds      = currentPersistedIds.filter((id) => !currentSections.some((s) => s.id === id));

        // Fire-and-forget — component is unmounting but the requests continue.
        api.put(`/cvs/${cvId}`, {
          title: currentCV.title,
          personalInfo: currentCV.personalInfo,
          styling: currentCV.styling,
          sectionOrder: currentCV.sectionOrder,
        }).catch(() => {});

        for (const section of newSections) {
          api.post(`/cvs/${cvId}/sections`, {
            id: section.id,
            type: section.type,
            title: section.title,
            order: section.order,
            isVisible: section.isVisible,
            items: section.items,
          }).catch(() => {});
        }

        for (const section of existingSections) {
          api.put(`/cvs/${cvId}/sections/${section.id}`, {
            title: section.title,
            isVisible: section.isVisible,
            items: section.items,
            order: section.order,
          }).catch(() => {});
        }

        for (const id of deletedIds) {
          api.delete(`/cvs/${cvId}/sections/${id}`).catch(() => {});
        }
      }

      reset();
    };
  }, [cvId, reset, queryClient]);

  // Warn the user before closing the tab or performing a hard navigation
  // (e.g., typing a new URL) while they have unsaved changes.
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (!isDirty) return;
      e.preventDefault();
      // Chrome requires returnValue to trigger the dialog
      e.returnValue = '';
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [isDirty]);

  // Fetch CV data — use React Query data for enabled/loading, sync to store separately
  const { data: cvData, isLoading: cvLoading, isError: cvError, refetch: refetchCV } = useQuery<CV>({
    queryKey: ['cv', cvId],
    queryFn: () => api.get<CV>(`/cvs/${cvId}`),
  });

  const { data: sectionsData, isLoading: sectionsLoading, isError: sectionsError, refetch: refetchSections } = useQuery<CVSection[]>({
    queryKey: ['cv-sections', cvId],
    queryFn: () => api.get<CVSection[]>(`/cvs/${cvId}/sections`),
    enabled: !!cvData,
  });

  // Sync React Query results into Zustand store
  useEffect(() => {
    if (cvData) setCV(cvData);
  }, [cvData, setCV]);

  useEffect(() => {
    if (sectionsData) setSections(sectionsData);
  }, [sectionsData, setSections]);

  // After the server data is loaded, check localStorage for a newer backup.
  // If found, silently restore it so no work is lost after a failed save / crash.
  useEffect(() => {
    if (!cvData || !sectionsData) return;

    try {
      const raw = localStorage.getItem(backupKey(cvId));
      if (!raw) return;

      const backup = JSON.parse(raw) as CVBackup;
      const serverTs = toEpochMs(cvData.updatedAt);

      // If the server timestamp can't be parsed, don't blindly trust the local
      // backup — keep it only when it is strictly newer than a known server time.
      if (serverTs === 0 || backup.savedAt <= serverTs) {
        // Backup is older or equal to the server version — safe to discard
        clearBackup(cvId);
        return;
      }

      // Backup is newer: restore it and show a dismissible notice
      setCV(backup.cv);
      setSections(backup.sections);
      // Set the persisted set EXACTLY: client-only restored sections must stay
      // unpersisted so the next save POSTs (creates) them instead of PUTting a
      // nonexistent doc (which 404s and permanently loses the restored work).
      setPersistedSectionIds(backup.persistedSectionIds);

      toast(t('backup_restored'), {
        duration: 6000,
        action: {
          label: t('backup_discard'),
          onClick: () => {
            setCV(cvData);
            setSections(sectionsData);
            clearBackup(cvId);
            // Re-baseline. Without this the discarded backup stays as
            // history[0], so the user's first Undo resurrects the very draft
            // they just chose to throw away.
            resetHistory();
          },
        },
      });
    } catch {
      clearBackup(cvId);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cvId, !!cvData, !!sectionsData]);

  // Seed the undo stack with the as-loaded document.
  //
  // The store snapshots AFTER each edit, so without a baseline entry the first
  // edit leaves historyIndex at 0 and `canUndo` (historyIndex > 0) stays false —
  // the user's first action could never be undone. Runs after both the server
  // data and any localStorage backup have settled, so the baseline is whatever
  // the user actually sees when the editor opens.
  //
  // `resetHistory` (not `pushHistory`) + a per-CV ref guard, because the effect
  // can legitimately run more than once for the same document — a warm React
  // Query cache resolves cvData and sectionsData in separate renders, and React
  // StrictMode double-invokes effects in development. Two baseline pushes left
  // historyIndex at 1 on a freshly opened CV, so Undo was enabled before the
  // user had edited anything. Seeding is idempotent now.
  const baselineSeededFor = useRef<string | null>(null);
  useEffect(() => {
    if (!cvData || !sectionsData) return;
    if (baselineSeededFor.current === cvId) return;
    baselineSeededFor.current = cvId;
    resetHistory();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cvId, !!cvData, !!sectionsData]);

  // Auto-save with debounce.
  // Differentiates between new sections (POST), existing sections (PUT),
  // and sections deleted client-side (DELETE) to avoid 404 errors.
  const autoSave = useCallback(async () => {
    if (!cv || !isDirty) return;

    // Snapshot the state at the moment save begins so we operate on consistent data
    const snapshot = { cv, sections, persistedSectionIds };

    const newSections      = snapshot.sections.filter((s) => !snapshot.persistedSectionIds.includes(s.id));
    const existingSections = snapshot.sections.filter((s) => snapshot.persistedSectionIds.includes(s.id));
    const deletedIds       = snapshot.persistedSectionIds.filter(
      (id) => !snapshot.sections.some((s) => s.id === id),
    );

    // Persist a backup before attempting the network calls so that if they fail
    // the user's work survives a page refresh.
    writeBackup(cvId, {
      cv: snapshot.cv,
      sections: snapshot.sections,
      persistedSectionIds: snapshot.persistedSectionIds,
      savedAt: Date.now(),
    });

    setIsSaving(true);
    try {
      // 1. Update the CV root (title, personalInfo, styling, sectionOrder)
      await api.put(`/cvs/${cvId}`, {
        title: snapshot.cv.title,
        personalInfo: snapshot.cv.personalInfo,
        styling: snapshot.cv.styling,
        sectionOrder: snapshot.cv.sectionOrder,
      });

      // 2. Create sections that only exist client-side (POST with client ID)
      for (const section of newSections) {
        await api.post(`/cvs/${cvId}/sections`, {
          id: section.id,
          type: section.type,
          title: section.title,
          order: section.order,
          isVisible: section.isVisible,
          items: section.items,
        });
      }

      // 3. Update sections already in the DB
      for (const section of existingSections) {
        await api.put(`/cvs/${cvId}/sections/${section.id}`, {
          title: section.title,
          isVisible: section.isVisible,
          items: section.items,
          order: section.order,
        });
      }

      // 4. Delete sections removed on the client
      for (const id of deletedIds) {
        await api.delete(`/cvs/${cvId}/sections/${id}`);
      }

      // Mark new section IDs as persisted and clear the backup
      markSectionsPersisted(snapshot.sections.map((s) => s.id));
      clearBackup(cvId);

      // Dismiss any lingering save-error toast and return to the fast debounce.
      if (saveErrorToastRef.current !== undefined) {
        toast.dismiss(saveErrorToastRef.current);
        saveErrorToastRef.current = undefined;
      }
      setRetryTick(0);

      // Clears isDirty only if no edit landed while this save was in flight,
      // so mid-save keystrokes aren't marked clean and dropped.
      markSaved(snapshot.cv, snapshot.sections);
    } catch (error) {
      console.error('Auto-save failed:', error);

      // Show a single persistent error toast — don't stack multiples
      if (saveErrorToastRef.current === undefined) {
        saveErrorToastRef.current = toast.error(t('autosave_failed'), { duration: Infinity });
      }
      // Actually schedule the retry the toast promises.
      //
      // Previously nothing here changed: `markSaved` is (correctly) not called
      // on failure, so `isDirty` stayed true — but the save effect depends on
      // [isDirty, autoSave] and neither changed, so it never re-ran. The user
      // was told "will retry" while the work sat unsaved until they typed
      // again. Bumping a counter that IS in the dep list re-arms the timer.
      setRetryTick((n) => n + 1);
    } finally {
      setIsSaving(false);
    }
  }, [cv, sections, persistedSectionIds, isDirty, cvId, setIsSaving, markSaved, markSectionsPersisted, t]);

  useEffect(() => {
    if (!isDirty) return;
    clearTimeout(saveTimerRef.current);
    // Normal debounce 2s; after a failure back off exponentially (4s, 8s, 16s…)
    // capped at 30s so a sustained outage doesn't hammer the API, and reset to
    // the fast path as soon as a save succeeds (retryTick stops changing).
    const delay = retryTick === 0 ? 2000 : Math.min(2000 * 2 ** retryTick, 30_000);
    saveTimerRef.current = setTimeout(autoSave, delay);
    return () => clearTimeout(saveTimerRef.current);
  }, [isDirty, autoSave, retryTick]);

  // Failed fetch — show a recoverable error instead of spinning forever.
  if (cvError || sectionsError) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-4 p-6 text-center">
        <div className="flex h-14 w-14 items-center justify-center rounded-full bg-amber-100 text-amber-600 dark:bg-amber-900/40 dark:text-amber-400">
          <AlertTriangle className="h-7 w-7" />
        </div>
        <div>
          <h2 className="text-lg font-semibold text-stone-900 dark:text-white">{t('load_error_title')}</h2>
          <p className="mt-1 max-w-sm text-sm text-stone-600 dark:text-stone-400">{t('load_error_desc')}</p>
        </div>
        <div className="flex gap-3">
          <Button onClick={() => { refetchCV(); refetchSections(); }}>
            {t('retry')}
          </Button>
          <Link href="/cv">
            <Button variant="secondary">{t('back_to_cvs')}</Button>
          </Link>
        </div>
      </div>
    );
  }

  if (cvLoading || sectionsLoading || !cv) {
    return (
      <div className="flex h-full items-center justify-center" role="status" aria-label={t('loading')}>
        <Loader2 className="h-8 w-8 animate-spin text-brand-600" />
      </div>
    );
  }

  return (
    <div className="flex h-[calc(100vh-64px)] flex-col -m-4 sm:-m-6 lg:-m-8">
      {/* Toolbar */}
      <EditorToolbar cvId={cvId} />

      {/* Mobile edit/preview switch — hidden on lg where both panels show */}
      <div className="flex border-b border-stone-200 bg-white p-1.5 dark:border-stone-700 dark:bg-stone-900 lg:hidden">
        <div className="mx-auto inline-flex rounded-lg bg-stone-100 p-1 dark:bg-stone-800" role="tablist" aria-label={t('view_switch_label')}>
          <button
            role="tab"
            aria-selected={mobileView === 'edit'}
            onClick={() => setMobileView('edit')}
            className={cn(
              'flex items-center gap-1.5 rounded-md px-4 py-1.5 text-sm font-medium transition-colors',
              mobileView === 'edit' ? 'bg-white text-brand-700 shadow-sm dark:bg-stone-700 dark:text-brand-300' : 'text-stone-600 dark:text-stone-400',
            )}
          >
            <Pencil className="h-4 w-4" /> {t('edit_tab')}
          </button>
          <button
            role="tab"
            aria-selected={mobileView === 'preview'}
            onClick={() => setMobileView('preview')}
            className={cn(
              'flex items-center gap-1.5 rounded-md px-4 py-1.5 text-sm font-medium transition-colors',
              mobileView === 'preview' ? 'bg-white text-brand-700 shadow-sm dark:bg-stone-700 dark:text-brand-300' : 'text-stone-600 dark:text-stone-400',
            )}
          >
            <Eye className="h-4 w-4" /> {t('preview_tab')}
          </button>
        </div>
      </div>

      {/* Split view */}
      <div className="flex flex-1 overflow-hidden">
        {/* Editor panel */}
        <div className={cn(
          'w-full overflow-y-auto border-e border-stone-200 bg-white p-4 dark:border-stone-700 dark:bg-stone-900 lg:block lg:w-1/2',
          mobileView === 'edit' ? 'block' : 'hidden',
        )}>
          <CVEditor />
        </div>

        {/* Preview panel */}
        <div className={cn(
          'w-full overflow-y-auto bg-stone-100 p-6 dark:bg-stone-800 lg:block lg:w-1/2',
          mobileView === 'preview' ? 'block' : 'hidden',
        )}>
          <LivePreview />
        </div>
      </div>
    </div>
  );
}
