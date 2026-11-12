import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  MatchResult,
  OpportunityDetail,
  OpportunityItem,
  PaidMatch,
  ReportOpportunityInput,
} from '../../../../../packages/career-api-client/src/types';
import { careerApi } from '../../lib/career-api';
import { withPaidUsage } from '../../lib/career/opportunities';
import { useCareerAccess, useEntitled } from '../useCareer';

/**
 * Opportunity data for the mobile career screens. Every key starts with
 * ['career', uid, 'opportunities' | 'maps', ...] so another account on the
 * device never reads this account's cache, and invalidating
 * ['career', uid, 'opportunities'] refreshes every list and detail.
 */

export function useCareerFeature(feature: string): { known: boolean; on: boolean } {
  const access = useCareerAccess();
  return { known: Boolean(access.data), on: access.data?.enabled === true && access.data.features?.[feature] === true };
}

export function useOpportunitySearch(q: string) {
  const { uid, entitled } = useEntitled();
  return useQuery({
    queryKey: ['career', uid, 'opportunities', 'list', q],
    queryFn: () => careerApi.opportunities(q ? { q } : {}),
    enabled: entitled,
  });
}

export function useOpportunity(id: string | undefined) {
  const { uid, entitled } = useEntitled();
  return useQuery({
    queryKey: ['career', uid, 'opportunities', 'detail', id],
    queryFn: () => careerApi.opportunity(id as string),
    enabled: entitled && Boolean(id),
  });
}

export function useOpportunityTrust(id: string | undefined) {
  const { uid, entitled } = useEntitled();
  return useQuery({
    queryKey: ['career', uid, 'opportunities', 'trust', id],
    queryFn: () => careerApi.opportunityTrust(id as string),
    enabled: entitled && Boolean(id),
    retry: false,
  });
}

export function usePasteOpportunity() {
  const queryClient = useQueryClient();
  const { uid } = useEntitled();
  return useMutation({
    mutationFn: (input: { text: string; sourceUrl?: string }) => careerApi.pasteOpportunity(input),
    onSuccess: (created: OpportunityDetail) => {
      queryClient.setQueryData(['career', uid, 'opportunities', 'detail', created.id], created);
      // Show it at the top of the current list right away, as the website does, then refresh.
      queryClient.setQueriesData<{ items: OpportunityItem[] }>({ queryKey: ['career', uid, 'opportunities', 'list'] }, (current) =>
        current ? { items: [created, ...current.items.filter((item) => item.id !== created.id)] } : current,
      );
      void queryClient.invalidateQueries({ queryKey: ['career', uid, 'opportunities', 'list'] });
      void queryClient.invalidateQueries({ queryKey: ['career', uid, 'opportunities'], exact: true });
    },
  });
}

export function useReportOpportunity(id: string | undefined) {
  const queryClient = useQueryClient();
  const { uid } = useEntitled();
  return useMutation({
    mutationFn: (input: ReportOpportunityInput) => careerApi.reportOpportunity(id as string, input),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['career', uid, 'opportunities', 'detail', id] });
      void queryClient.invalidateQueries({ queryKey: ['career', uid, 'opportunities', 'trust', id] });
    },
  });
}

/** A comparison already saved for this listing and CV version (free to read; nothing is charged). */
export function useSavedMatch(opportunityId: string | undefined, versionId: string | null) {
  const { uid, entitled } = useEntitled();
  return useQuery({
    queryKey: ['career', uid, 'opportunities', 'match', opportunityId, versionId],
    queryFn: async () => (await careerApi.match({ opportunityId: opportunityId as string, resumeVersionId: versionId as string })).match,
    enabled: entitled && Boolean(opportunityId) && Boolean(versionId),
    retry: false,
  });
}

/**
 * The website's "Compare with my resume": POST /matches with mode 'explicit'.
 * The caller passes the idempotency key it made for this user action, so a
 * retry of the same comparison is never charged twice.
 */
export function useCreateMatch(opportunityId: string | undefined) {
  const queryClient = useQueryClient();
  const { uid } = useEntitled();
  return useMutation({
    mutationFn: (input: { versionId: string; idempotencyKey: string }) =>
      careerApi.createMatch({ opportunityId: opportunityId as string, resumeVersionId: input.versionId, mode: 'explicit' }, input.idempotencyKey),
    onSuccess: (paid: PaidMatch, input) => {
      queryClient.setQueryData<MatchResult | null>(['career', uid, 'opportunities', 'match', opportunityId, input.versionId], paid.match);
      queryClient.setQueryData<OpportunityDetail>(['career', uid, 'opportunities', 'detail', opportunityId], (current) =>
        current ? withPaidUsage(current, paid) : current,
      );
      void queryClient.invalidateQueries({ queryKey: ['career', uid, 'usage'] });
    },
  });
}

export function useMapList() {
  const { uid, entitled } = useEntitled();
  const feature = useCareerFeature('mapSessions');
  return useQuery({
    queryKey: ['career', uid, 'maps'],
    queryFn: () => careerApi.mapOpportunities(),
    enabled: entitled && feature.on,
    retry: false,
  });
}

export function useStartMap() {
  const queryClient = useQueryClient();
  const { uid } = useEntitled();
  return useMutation({
    mutationFn: (idempotencyKey: string) => careerApi.startMap(idempotencyKey),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['career', uid, 'usage'] }),
  });
}
