import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';
import type { DesignUpdatePayload } from '../lib/cv-design';
import { buildLinkedInRequest } from '../lib/linkedin';
import { useCVStore } from '../store/cv-store';
import { AIResponse } from '../types/api.types';
import { CV } from '../types/cv.types';

/**
 * `PUT /cvs/:id` with `{ templateId?, styling }` from the Design screen.
 * Invalidates the same keys as `useUpdateCV` (`['cv', id]`, `['cvs']`).
 *
 * The editor keeps its own copy of the CV in `useCVStore` and PUTs
 * `styling` from it on save; patch that copy too (without touching
 * `isDirty`) so a later editor save cannot write the old design back.
 */
export function useUpdateCVDesign(cvId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: DesignUpdatePayload) => api.put<CV>(`/cvs/${cvId}`, payload),
    onSuccess: (updated, payload) => {
      const store = useCVStore.getState();
      if (store.cv && store.cv.id === cvId) {
        const styling = { ...store.cv.styling, ...(updated?.styling ?? {}), ...(payload.styling ?? {}) };
        useCVStore.setState({
          cv: {
            ...store.cv,
            templateId: payload.templateId ?? store.cv.templateId,
            styling: styling as CV['styling'],
          },
        });
      }
      void qc.invalidateQueries({ queryKey: ['cv', cvId] });
      void qc.invalidateQueries({ queryKey: ['cvs'] });
    },
  });
}

/** `POST /ai/linkedin` (1 Engine credit). Body is exactly `LinkedinOptimizeDto`. */
export function useLinkedInOptimize() {
  return useMutation({
    mutationFn: ({ cvContent, targetRole }: { cvContent: string; targetRole: string }) =>
      api.post<AIResponse>('/ai/linkedin', buildLinkedInRequest(cvContent, targetRole)),
  });
}
