import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { api } from '../lib/api';
import { cancelJobReminders, reconcileJobReminders, syncJobReminder } from '../lib/job-reminders';
import { duplicateCheckParams } from '../lib/job-tracker';
import { useAuthStore } from '../store/auth-store';
import {
  JobApplication,
  JobDuplicateCheck,
  JobPatchPayload,
  JobWritePayload,
} from '../types/job.types';

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
    // Archived applications are finished — reconcile drops their local reminders.
    void reconcileJobReminders(query.data.filter((j) => !j.archived)).catch(() => {});
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

/**
 * Archive / restore — `PUT /jobs/:id { archived }`, the website's reversible
 * alternative to deleting a finished role. Archiving cancels the job's local
 * reminders; restoring re-schedules them (subject to the push preference).
 */
export function useArchiveJob() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ job, archived }: { job: JobApplication; archived: boolean }) =>
      api.put<JobApplication>(`/jobs/${job.id}`, { archived } satisfies JobPatchPayload),
    onSuccess: (_saved, { job, archived }) => {
      qc.invalidateQueries({ queryKey: ['job', job.id] });
      qc.invalidateQueries({ queryKey: ['jobs'] });
      void (archived ? cancelJobReminders(job.id) : syncJobReminder(job)).catch(() => {});
    },
  });
}

/**
 * GET /jobs/duplicate-check — a same company + position application the user
 * already tracks, or null. Used on create only, as a confirmation (not a block).
 */
export async function findDuplicateJob(company: string, position: string): Promise<JobApplication | null> {
  const params = duplicateCheckParams(company, position);
  if (!params) return null;
  const res = await api.get<JobDuplicateCheck>('/jobs/duplicate-check', params);
  return res?.duplicate ?? null;
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

/**
 * "Use current version": freezes the CV or cover letter as it is now with this
 * application (`POST /jobs/:id/refreeze`, same as the website). Earlier
 * snapshots are never edited in place.
 */
export function useRefreezeJob(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (kind: 'cv' | 'cover_letter') => api.post<JobApplication>(`/jobs/${id}/refreeze`, { kind }),
    onSuccess: (job) => {
      qc.setQueryData(['job', id], job);
      qc.invalidateQueries({ queryKey: ['jobs'] });
    },
  });
}
