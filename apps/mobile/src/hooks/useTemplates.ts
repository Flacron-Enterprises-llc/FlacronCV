import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api';
import { useAuthStore } from '../store/auth-store';
import { Template } from '../types/template.types';
import { TemplateCategory } from '../types/enums';

function useAuthReady() {
  const { firebaseUser, isInitialized } = useAuthStore();
  return isInitialized && !!firebaseUser;
}

export function useTemplates(category?: TemplateCategory) {
  const ready = useAuthReady();
  return useQuery({
    queryKey: ['templates', category],
    queryFn: () => api.get<Template[]>('/templates', category ? { category } : {}),
    enabled: ready,
    staleTime: 10 * 60 * 1000,
  });
}

export function useTemplate(id: string | null) {
  const ready = useAuthReady();
  return useQuery({
    queryKey: ['template', id],
    queryFn: () => api.get<Template>(`/templates/${id}`),
    enabled: ready && !!id,
    staleTime: 10 * 60 * 1000,
  });
}
