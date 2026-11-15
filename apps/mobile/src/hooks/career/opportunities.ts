import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  MatchResult,
  OpportunityDetail,
  OpportunityItem,
  OpportunitySearchQuery,
  OpportunitySearchResult,
  PaidMatch,
  PasteOpportunityInput,
  ReportOpportunityInput,
} from '../../../../../packages/career-api-client/src/types';
import { api } from '../../lib/api';
import { careerApi } from '../../lib/career-api';
import { withPaidUsage } from '../../lib/career/opportunities';
import { findTrackedJob, v1JobFromOpportunity } from '../../lib/job-from-opportunity';
import type { JobApplication } from '../../types/job.types';
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

/**
 * GET /opportunities with the website's filters (see lib/career/opportunity-search
 * `searchQuery`). The query object is the cache key, so each filter set is cached apart.
 */
export function useOpportunitySearch(query: OpportunitySearchQuery) {
  const { uid, entitled } = useEntitled();
  return useQuery<OpportunitySearchResult>({
    queryKey: ['career', uid, 'opportunities', 'list', query],
    queryFn: () => careerApi.opportunities(query),
    enabled: entitled,
    // A refused distance is answered on screen (plan limit); retrying cannot change it.
    retry: false,
  });
}

/** Listings this account saved (GET /saved-opportunities). Optional wherever it is shown. */
export function useSavedOpportunities(enabled = true) {
  const { uid, entitled } = useEntitled();
  return useQuery({
    queryKey: ['career', uid, 'opportunities', 'saved'],
    queryFn: async () => (await careerApi.savedOpportunities()).items,
    enabled: entitled && enabled,
    retry: false,
  });
}

/** Save / unsave a listing; every list and the detail show the new state. */
export function useToggleSaveOpportunity() {
  const queryClient = useQueryClient();
  const { uid } = useEntitled();
  return useMutation({
    mutationFn: async (item: Pick<OpportunityItem, 'id' | 'saved'>) => {
      if (item.saved) await careerApi.unsaveOpportunity(item.id);
      else await careerApi.saveOpportunity(item.id);
      return { id: item.id, saved: !item.saved };
    },
    onSuccess: ({ id, saved }) => {
      queryClient.setQueriesData<OpportunitySearchResult>({ queryKey: ['career', uid, 'opportunities', 'list'] }, (current) =>
        current ? { ...current, items: current.items.map((entry) => (entry.id === id ? { ...entry, saved } : entry)) } : current,
      );
      queryClient.setQueryData<OpportunityDetail>(['career', uid, 'opportunities', 'detail', id], (current) => (current ? { ...current, saved } : current));
      void queryClient.invalidateQueries({ queryKey: ['career', uid, 'opportunities', 'saved'] });
    },
  });
}

export type TrackResult = 'added' | 'already';

/**
 * "Track in Job Tracker": one V1 tracker entry per listing. An entry with this
 * listing's id or original link is reused, never duplicated. Same `POST /jobs`
 * payload as the website (opportunityId, job description from the listing, deadline).
 */
export function useTrackOpportunity() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: { item: OpportunityDetail; unstatedCompany: string }): Promise<TrackResult> => {
      const jobs = await api.get<JobApplication[]>('/jobs');
      if (findTrackedJob(jobs, input.item)) return 'already';
      await api.post<JobApplication>('/jobs', v1JobFromOpportunity(input.item, input.unstatedCompany));
      return 'added';
    },
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['jobs'] }),
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
    mutationFn: (input: PasteOpportunityInput) => careerApi.pasteOpportunity(input),
    onSuccess: (created: OpportunityDetail) => {
      queryClient.setQueryData(['career', uid, 'opportunities', 'detail', created.id], created);
      // Show it at the top of the current list right away, as the website does, then refresh.
      queryClient.setQueriesData<OpportunitySearchResult>({ queryKey: ['career', uid, 'opportunities', 'list'] }, (current) =>
        current ? { ...current, items: [created, ...current.items.filter((item) => item.id !== created.id)] } : current,
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
