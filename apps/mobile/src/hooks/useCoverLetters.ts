import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';
import { useAuthStore } from '../store/auth-store';
import {
  CoverLetter,
  CreateCoverLetterPayload,
  GenerateCoverLetterData,
  UpdateCoverLetterPayload,
} from '../types/cover-letter.types';
import { ListPage } from '../types/api.types';
import { CoverLetterStatus } from '../types/enums';

function useAuthReady() {
  const { firebaseUser, isInitialized } = useAuthStore();
  return isInitialized && !!firebaseUser;
}

export function useCoverLetterList(page = 1, limit = 20) {
  const ready = useAuthReady();
  return useQuery({
    queryKey: ['cover-letters', page, limit],
    queryFn: () => api.get<ListPage<CoverLetter>>('/cover-letters', { page, limit }),
    enabled: ready,
    staleTime: 2 * 60 * 1000,
  });
}

export function useCoverLetter(id: string | null) {
  const ready = useAuthReady();
  return useQuery({
    queryKey: ['cover-letter', id],
    queryFn: () => api.get<CoverLetter>(`/cover-letters/${id}`),
    enabled: ready && !!id,
    staleTime: 30 * 1000,
  });
}

export function useCreateCoverLetter() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: CreateCoverLetterPayload) => api.post<CoverLetter>('/cover-letters', data),
    onSuccess: async () => {
      qc.invalidateQueries({ queryKey: ['cover-letters'] });
      qc.invalidateQueries({ queryKey: ['user'] });
      await useAuthStore.getState().syncUser();
    },
  });
}

export function useUpdateCoverLetter(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: UpdateCoverLetterPayload) =>
      api.put<CoverLetter>(`/cover-letters/${id}`, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['cover-letter', id] });
      qc.invalidateQueries({ queryKey: ['cover-letters'] });
    },
  });
}

export function useDeleteCoverLetter() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.delete(`/cover-letters/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['cover-letters'] });
    },
  });
}

export function useGenerateCoverLetter(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: GenerateCoverLetterData) =>
      api.post<CoverLetter>(`/cover-letters/${id}/ai/generate`, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['cover-letter', id] });
    },
  });
}

/**
 * POST /cover-letters/:id/duplicate — the website's list "Duplicate". The API
 * copies the letter as "<title> (Copy)", Draft, and counts it as a creation
 * (403 "Cover letter limit reached" when the plan has none left).
 */
export function useDuplicateCoverLetter() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.post<CoverLetter>(`/cover-letters/${id}/duplicate`),
    onSuccess: async () => {
      qc.invalidateQueries({ queryKey: ['cover-letters'] });
      qc.invalidateQueries({ queryKey: ['user'] });
      await useAuthStore.getState().syncUser();
    },
  });
}

/** PUT /cover-letters/:id { status } only — web "Mark as final" / "Revert to draft". */
export function useSetCoverLetterStatus(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (status: CoverLetterStatus) =>
      api.put<CoverLetter>(`/cover-letters/${id}`, { status }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['cover-letters'] });
    },
  });
}
