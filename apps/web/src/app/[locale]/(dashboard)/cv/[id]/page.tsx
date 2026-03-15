'use client';
import React from 'react';

import { useEffect, useCallback, useRef } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useParams } from 'next/navigation';
import { api } from '@/lib/api';
import { useCVStore } from '@/store/cv-store';
import { CV, CVSection } from '@flacroncv/shared-types';
import CVEditor from '@/components/cv-builder/CVEditor';
import LivePreview from '@/components/cv-builder/LivePreview';
import EditorToolbar from '@/components/cv-builder/toolbar/EditorToolbar';
import { Loader2 } from 'lucide-react';

export default function CVBuilderPage(): React.JSX.Element | null {
  const params = useParams();
  const cvId = params.id as string;
  const queryClient = useQueryClient();
  const { reset, setCV, setSections, cv, sections, isDirty, setIsSaving, setLastSavedAt } = useCVStore();
  const saveTimerRef = useRef<NodeJS.Timeout>();

  // Reset store and invalidate queries when switching CVs
  useEffect(() => {
    reset();
    queryClient.removeQueries({ queryKey: ['cv', cvId] });
    queryClient.removeQueries({ queryKey: ['cv-sections', cvId] });
    return () => reset();
  }, [cvId, reset, queryClient]);

  // Fetch CV data — use React Query data for enabled/loading, sync to store separately
  const { data: cvData, isLoading: cvLoading } = useQuery({
    queryKey: ['cv', cvId],
    queryFn: () => api.get<CV>(`/cvs/${cvId}`),
  });

  const { data: sectionsData, isLoading: sectionsLoading } = useQuery({
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

  // Auto-save with debounce
  const autoSave = useCallback(async () => {
    if (!cv || !isDirty) return;

    setIsSaving(true);
    try {
      await api.put(`/cvs/${cvId}`, {
        title: cv.title,
        personalInfo: cv.personalInfo,
        styling: cv.styling,
        sectionOrder: cv.sectionOrder,
      });

      // Save each section
      for (const section of sections) {
        await api.put(`/cvs/${cvId}/sections/${section.id}`, {
          title: section.title,
          isVisible: section.isVisible,
          items: section.items,
          order: section.order,
        });
      }

      setLastSavedAt(new Date());
    } catch (error) {
      console.error('Auto-save failed:', error);
    } finally {
      setIsSaving(false);
    }
  }, [cv, sections, isDirty, cvId, setIsSaving, setLastSavedAt]);

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
