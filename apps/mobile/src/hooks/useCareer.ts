import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CAREER_ENABLED } from '../config/career';
import { api } from '../lib/api';
import { careerApi } from '../lib/career-api';
import type { CareerSubscriptionView } from '../lib/career-view';
import { useAuthStore } from '../store/auth-store';

/**
 * Career data for the signed-in user. Every key carries the uid so a second
 * account on the same device never sees the first one's cached career data.
 * Authorization and quotas are the career API's; these hooks only read and
 * write through it.
 */
function useUid(): string | null {
  return useAuthStore((s) => s.firebaseUser?.uid ?? null);
}

export function useCareerAccess() {
  const uid = useUid();
  return useQuery({
    queryKey: ['career', uid, 'access'],
    queryFn: () => careerApi.access(),
    enabled: CAREER_ENABLED && Boolean(uid),
    staleTime: 30_000,
    retry: false,
  });
}

/** V1 API: the career add-on subscription stored on the V1 account (provider independent). */
export function useCareerSubscription() {
  const uid = useUid();
  return useQuery({
    queryKey: ['career', uid, 'subscription'],
    queryFn: async () =>
      (await api.get<{ careerSubscription: CareerSubscriptionView | null }>('/career-billing/status')).careerSubscription,
    enabled: CAREER_ENABLED && Boolean(uid),
    staleTime: 30_000,
    retry: false,
  });
}

function useEntitled(): { uid: string | null; entitled: boolean } {
  const uid = useUid();
  const access = useCareerAccess();
  return { uid, entitled: access.data?.enabled === true };
}

export function useCareerUsage() {
  const { uid, entitled } = useEntitled();
  return useQuery({ queryKey: ['career', uid, 'usage'], queryFn: () => careerApi.usage(), enabled: entitled, retry: false });
}

export function useCareerFacts() {
  const { uid, entitled } = useEntitled();
  return useQuery({ queryKey: ['career', uid, 'facts'], queryFn: () => careerApi.facts(), enabled: entitled });
}

export function useCareerResumes() {
  const { uid, entitled } = useEntitled();
  return useQuery({ queryKey: ['career', uid, 'resumes'], queryFn: () => careerApi.resumes(), enabled: entitled });
}

export function useCareerResume(id: string | undefined) {
  const { uid, entitled } = useEntitled();
  return useQuery({
    queryKey: ['career', uid, 'resume', id],
    queryFn: () => careerApi.resume(id as string),
    enabled: entitled && Boolean(id),
  });
}

export function useCareerWritingList() {
  const { uid, entitled } = useEntitled();
  return useQuery({ queryKey: ['career', uid, 'writing'], queryFn: () => careerApi.writingDocuments(), enabled: entitled });
}

export function useCareerWriting(id: string | undefined) {
  const { uid, entitled } = useEntitled();
  return useQuery({
    queryKey: ['career', uid, 'writing', id],
    queryFn: () => careerApi.writingDocument(id as string),
    enabled: entitled && Boolean(id),
  });
}

export function useCareerOpportunities() {
  const { uid, entitled } = useEntitled();
  return useQuery({ queryKey: ['career', uid, 'opportunities'], queryFn: () => careerApi.opportunities({}), enabled: entitled });
}

export function useFactActions() {
  const queryClient = useQueryClient();
  const uid = useUid();
  const refresh = () => queryClient.invalidateQueries({ queryKey: ['career', uid, 'facts'] });
  return {
    confirm: useMutation({ mutationFn: (factId: string) => careerApi.confirmFact(factId), onSuccess: refresh }),
    remove: useMutation({ mutationFn: (factId: string) => careerApi.deleteFact(factId), onSuccess: refresh }),
  };
}

export function useSaveResumeLines(resumeId: string | undefined) {
  const queryClient = useQueryClient();
  const uid = useUid();
  return useMutation({
    mutationFn: (input: { versionId: string; lines: Array<{ factId: string; text: string }>; expectedRevision?: number }) =>
      careerApi.updateResumeVersion(input.versionId, { lines: input.lines, expectedRevision: input.expectedRevision }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['career', uid, 'resume', resumeId] });
      void queryClient.invalidateQueries({ queryKey: ['career', uid, 'resumes'] });
    },
  });
}

export function useSaveWriting(documentId: string | undefined) {
  const queryClient = useQueryClient();
  const uid = useUid();
  return useMutation({
    mutationFn: (input: { body: string; expectedRevision?: number }) =>
      careerApi.updateWriting(documentId as string, { body: input.body, expectedRevision: input.expectedRevision }),
    onSuccess: (saved) => {
      queryClient.setQueryData(['career', uid, 'writing', documentId], saved);
      void queryClient.invalidateQueries({ queryKey: ['career', uid, 'writing'], exact: true });
    },
  });
}
