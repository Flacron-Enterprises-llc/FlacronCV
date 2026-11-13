import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { careerApi } from '../../lib/career-api';
import { useEntitled, useUid } from '../useCareer';
import type { CareerPreferences, FactValue } from '../../../../../packages/career-shared/src/facts';
import type { ImportRequest, NewFact } from '../../../../../packages/career-api-client/src/types';

/**
 * Career profile data beyond the fact list (which is `useCareerFacts` in
 * useCareer.ts, key ['career', uid, 'facts']). Every key starts with
 * ['career', uid] so a second account on the device never sees the first
 * one's cache. Writes go through the career API; nothing is granted here.
 */

export function useCareerProfile() {
  const { uid, entitled } = useEntitled();
  return useQuery({ queryKey: ['career', uid, 'profile'], queryFn: () => careerApi.profile(), enabled: entitled });
}

export function useImportAllowance() {
  const { uid, entitled } = useEntitled();
  return useQuery({
    queryKey: ['career', uid, 'import-allowance'],
    queryFn: () => careerApi.importAllowance(),
    enabled: entitled,
    retry: false,
  });
}

export function useFactRevisions(factId: string | undefined, open: boolean) {
  const { uid, entitled } = useEntitled();
  return useQuery({
    queryKey: ['career', uid, 'fact-revisions', factId],
    queryFn: async () => (await careerApi.factRevisions(factId as string)).items,
    enabled: entitled && open && Boolean(factId),
    retry: false,
  });
}

function useRefreshProfile() {
  const queryClient = useQueryClient();
  const uid = useUid();
  return () => {
    void queryClient.invalidateQueries({ queryKey: ['career', uid, 'facts'] });
    void queryClient.invalidateQueries({ queryKey: ['career', uid, 'profile'] });
    void queryClient.invalidateQueries({ queryKey: ['career', uid, 'fact-revisions'] });
  };
}

export function useCreateFact() {
  const refresh = useRefreshProfile();
  return useMutation({
    /** `confirm` runs the same consent step as the Confirm button after the fact exists. */
    mutationFn: async (input: { fact: NewFact; confirm: boolean }) => {
      const created = await careerApi.createFact(input.fact);
      return input.confirm ? careerApi.confirmFact(created.id) : created;
    },
    onSettled: refresh,
  });
}

/** Save changed fields, optionally followed by the confirm (consent) step, like the web editor. */
export function useSaveFact() {
  const refresh = useRefreshProfile();
  return useMutation({
    mutationFn: async (input: { factId: string; patch: Partial<FactValue> | null; confirm: boolean }) => {
      const saved = input.patch ? await careerApi.updateFact(input.factId, input.patch) : null;
      if (input.confirm) return careerApi.confirmFact(input.factId);
      return saved;
    },
    onSettled: refresh,
  });
}

export function useDeleteFact() {
  const refresh = useRefreshProfile();
  return useMutation({ mutationFn: (factId: string) => careerApi.deleteFact(factId), onSettled: refresh });
}

export function useImportResume() {
  const queryClient = useQueryClient();
  const uid = useUid();
  const refresh = useRefreshProfile();
  return useMutation({
    /** Pasted text, or text read from a file with its name and format (as the website sends it). */
    mutationFn: (input: string | ImportRequest) =>
      careerApi.importResume(typeof input === 'string' ? { text: input, format: 'text' } : input),
    onSettled: () => {
      refresh();
      void queryClient.invalidateQueries({ queryKey: ['career', uid, 'import-allowance'] });
    },
  });
}

export function useSetPreferences() {
  const queryClient = useQueryClient();
  const uid = useUid();
  return useMutation({
    mutationFn: (preferences: CareerPreferences) => careerApi.setPreferences(preferences),
    onSuccess: (profile) => queryClient.setQueryData(['career', uid, 'profile'], profile),
  });
}
