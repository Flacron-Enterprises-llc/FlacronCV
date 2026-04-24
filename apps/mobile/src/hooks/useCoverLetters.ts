import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';
import { useAuthStore } from '../store/auth-store';
import { CoverLetter, GenerateCoverLetterData } from '../types/cover-letter.types';
import { PaginatedResponse } from '../types/api.types';

function useAuthReady() {
  const { firebaseUser, isInitialized } = useAuthStore();
  return isInitialized && !!firebaseUser;
}

export function useCoverLetterList(page = 1, limit = 20) {
  const ready = useAuthReady();
  return useQuery({
    queryKey: ['cover-letters', page, limit],
    queryFn: () => api.get<PaginatedResponse<CoverLetter>>('/cover-letters', { page, limit }),
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
    mutationFn: (data: Partial<CoverLetter>) => api.post<CoverLetter>('/cover-letters', data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['cover-letters'] });
    },
  });
}

export function useUpdateCoverLetter(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: Partial<CoverLetter>) => api.put<CoverLetter>(`/cover-letters/${id}`, data),
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
      api.post<CoverLetter>(`/cover-letters/${id}/generate`, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['cover-letter', id] });
    },
  });
}
