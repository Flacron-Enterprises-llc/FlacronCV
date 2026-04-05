'use client';
import React from 'react';

import { useEffect, useCallback, useRef } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useParams } from 'next/navigation';
import { api } from '@/lib/api';
import { useCVStore } from '@/store/cv-store';
import { CV, CVSection } from '@flacroncv/shared-types';
import { toast } from 'sonner';
import CVEditor from '@/components/cv-builder/CVEditor';
import LivePreview from '@/components/cv-builder/LivePreview';
import EditorToolbar from '@/components/cv-builder/toolbar/EditorToolbar';
import { Loader2 } from 'lucide-react';

/** Shape written to / read from localStorage for offline resilience. */
interface CVBackup {
  cv: CV;
  sections: CVSection[];
  persistedSectionIds: string[];
  savedAt: number;
}

/** Returns the localStorage key for a given CV id. */
const backupKey = (id: string) => `cv_backup_${id}`;

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
  const {
    reset, setCV, setSections,
    cv, sections, persistedSectionIds,
    isDirty, setIsSaving, setLastSavedAt, markSectionsPersisted,
  } = useCVStore();
  const saveTimerRef = useRef<NodeJS.Timeout | undefined>(undefined);
  const saveErrorToastRef = useRef<string | number | undefined>(undefined);

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
  const { data: cvData, isLoading: cvLoading } = useQuery<CV>({
    queryKey: ['cv', cvId],
    queryFn: () => api.get<CV>(`/cvs/${cvId}`),
  });

  const { data: sectionsData, isLoading: sectionsLoading } = useQuery<CVSection[]>({
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
      const serverTs = new Date(cvData.updatedAt as unknown as string).getTime();

      if (backup.savedAt <= serverTs) {
        // Backup is older or equal to the server version — safe to discard
        clearBackup(cvId);
        return;
      }

      // Backup is newer: restore it and show a dismissible notice
      setCV(backup.cv);
      setSections(backup.sections);
      markSectionsPersisted(backup.persistedSectionIds);

      toast('Unsaved changes restored from your last session.', {
        duration: 6000,
        action: {
          label: 'Discard',
          onClick: () => {
            setCV(cvData);
            setSections(sectionsData);
            clearBackup(cvId);
          },
        },
      });
    } catch {
      clearBackup(cvId);
    }
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

      // Dismiss any lingering save-error toast
      if (saveErrorToastRef.current !== undefined) {
        toast.dismiss(saveErrorToastRef.current);
        saveErrorToastRef.current = undefined;
      }

      setLastSavedAt(new Date());
    } catch (error) {
      console.error('Auto-save failed:', error);

      // Show a single persistent error toast — don't stack multiples
      if (saveErrorToastRef.current === undefined) {
        saveErrorToastRef.current = toast.error(
          'Auto-save failed. Your changes are backed up locally and will retry.',
          { duration: Infinity },
        );
      }
    } finally {
      setIsSaving(false);
    }
  }, [cv, sections, persistedSectionIds, isDirty, cvId, setIsSaving, setLastSavedAt, markSectionsPersisted]);

  useEffect(() => {
    if (isDirty) {
      clearTimeout(saveTimerRef.current);
      saveTimerRef.current = setTimeout(autoSave, 2000);
    }
    return () => clearTimeout(saveTimerRef.current);
  }, [isDirty, autoSave]);

  if (cvLoading || sectionsLoading || !cv) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-brand-600" />
      </div>
    );
  }

  return (
    <div className="flex h-[calc(100vh-64px)] flex-col -m-4 sm:-m-6 lg:-m-8">
      {/* Toolbar */}
      <EditorToolbar cvId={cvId} />

      {/* Split view */}
      <div className="flex flex-1 overflow-hidden">
        {/* Editor panel */}
        <div className="w-full overflow-y-auto border-e border-stone-200 bg-white p-4 dark:border-stone-700 dark:bg-stone-900 lg:w-1/2">
          <CVEditor />
        </div>

        {/* Preview panel - hidden on mobile */}
        <div className="hidden w-1/2 overflow-y-auto bg-stone-100 p-6 dark:bg-stone-800 lg:block">
          <LivePreview />
        </div>
      </div>
    </div>
  );
}
