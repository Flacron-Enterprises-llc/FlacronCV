import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { api } from '../lib/api';
import { reconcileJobReminders } from '../lib/job-reminders';
import { useAuthStore } from '../store/auth-store';
import { JobApplication, JobWritePayload } from '../types/job.types';

function useAuthReady() {
  const { firebaseUser, isInitialized } = useAuthStore();
  return isInitialized && !!firebaseUser;
}

/** GET /jobs returns the array (not a paginated { items } page). */
export function useJobList() {
  const ready = useAuthReady();
  const pushOn = useAuthStore((s) => s.user?.preferences?.pushNotifications === true);
  const query = useQuery({
    queryKey: ['jobs'],
    queryFn: () => api.get<JobApplication[]>('/jobs'),
    enabled: ready,
    staleTime: 30 * 1000,
  });

  useEffect(() => {
    if (!pushOn || !query.isSuccess || !query.data) return;
    void reconcileJobReminders(query.data).catch(() => {});
  }, [pushOn, query.isSuccess, query.data]);

  return query;
}

export function useJob(id: string | null) {
  const ready = useAuthReady();
  return useQuery({
    queryKey: ['job', id],
    queryFn: () => api.get<JobApplication>(`/jobs/${id}`),
    enabled: ready && !!id,
    staleTime: 30 * 1000,
  });
}

export function useCreateJob() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: JobWritePayload) => api.post<JobApplication>('/jobs', data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['jobs'] });
    },
  });
}

/** API is PUT /jobs/:id (not PATCH). */
export function useUpdateJob(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: JobWritePayload) => api.put<JobApplication>(`/jobs/${id}`, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['job', id] });
      qc.invalidateQueries({ queryKey: ['jobs'] });
    },
  });
}

export function useDeleteJob() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.delete(`/jobs/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['jobs'] });
    },
  });
}
