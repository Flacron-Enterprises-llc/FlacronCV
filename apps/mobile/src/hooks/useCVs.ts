import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';
import { useAuthStore } from '../store/auth-store';
import { CV, CVSection } from '../types/cv.types';
import { PaginatedResponse } from '../types/api.types';

function useAuthReady() {
  const { firebaseUser, isInitialized } = useAuthStore();
  return isInitialized && !!firebaseUser;
}

export function useCVList(page = 1, limit = 20) {
  const ready = useAuthReady();
  return useQuery({
    queryKey: ['cvs', page, limit],
    queryFn: () => api.get<PaginatedResponse<CV>>('/cvs', { page, limit }),
    enabled: ready,
    staleTime: 2 * 60 * 1000,
  });
}

export function useCV(id: string | null) {
  const ready = useAuthReady();
  return useQuery({
    queryKey: ['cv', id],
    queryFn: () => api.get<CV>(`/cvs/${id}`),
    enabled: ready && !!id,
    staleTime: 30 * 1000,
  });
}

export function useCVSections(cvId: string | null) {
  const ready = useAuthReady();
  return useQuery({
    queryKey: ['cv-sections', cvId],
    queryFn: () => api.get<CVSection[]>(`/cvs/${cvId}/sections`),
    enabled: ready && !!cvId,
    staleTime: 30 * 1000,
  });
}

export function useCreateCV() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: Partial<CV>) => api.post<CV>('/cvs', data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['cvs'] });
    },
  });
}

export function useUpdateCV(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: Partial<CV>) => api.put<CV>(`/cvs/${id}`, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['cv', id] });
      qc.invalidateQueries({ queryKey: ['cvs'] });
    },
  });
}

export function useDeleteCV() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.delete(`/cvs/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['cvs'] });
    },
  });
}

export function useDuplicateCV() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.post<CV>(`/cvs/${id}/duplicate`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['cvs'] });
    },
  });
}

export function useUpdateCVSection(cvId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ sectionId, data }: { sectionId: string; data: Partial<CVSection> }) =>
      api.put<CVSection>(`/cvs/${cvId}/sections/${sectionId}`, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['cv-sections', cvId] });
    },
  });
}

export function useAddCVSection(cvId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: Partial<CVSection>) => api.post<CVSection>(`/cvs/${cvId}/sections`, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['cv-sections', cvId] });
    },
  });
}

export function useDeleteCVSection(cvId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (sectionId: string) => api.delete(`/cvs/${cvId}/sections/${sectionId}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['cv-sections', cvId] });
    },
  });
}

export function useShareCV(cvId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api.post<CV>(`/cvs/${cvId}/share`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['cv', cvId] });
    },
  });
}

export function useCVVersions(cvId: string) {
  const ready = useAuthReady();
  return useQuery({
    queryKey: ['cv-versions', cvId],
    queryFn: () => api.get(`/cvs/${cvId}/versions`),
    enabled: ready && !!cvId,
  });
}
