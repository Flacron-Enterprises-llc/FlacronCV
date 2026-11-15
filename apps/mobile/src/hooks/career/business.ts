import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { BusinessQueueItem, BusinessStaffRole } from '../../../../../packages/career-api-client/src/types';
import { careerApi } from '../../lib/career-api';
import { webOrigin } from '../../lib/career/portfolios';
import { useEntitled, useUid } from '../useCareer';

/**
 * Business workspace data. Keys start with ['career', uid, 'business'].
 * `workspace` is the id to act in (undefined = the caller's own workspace).
 * The API checks the caller's role for every request.
 */

/** The website origin invitation links are served from, or null when this build has none. */
export const BUSINESS_WEB_ORIGIN: string | null = webOrigin(process.env.EXPO_PUBLIC_WEB_URL ?? process.env.EXPO_PUBLIC_APP_URL);

const key = (uid: string | null, ...rest: unknown[]) => ['career', uid, 'business', ...rest];

export function useBusinessMemberships() {
  const { uid, entitled } = useEntitled();
  return useQuery({ queryKey: key(uid, 'memberships'), queryFn: () => careerApi.businessMemberships(), enabled: entitled, retry: false });
}

export function useBusinessOverview(workspace: string | undefined, enabled = true) {
  const { uid, entitled } = useEntitled();
  return useQuery({
    queryKey: key(uid, 'overview', workspace ?? 'own'),
    queryFn: () => careerApi.businessOverview(workspace),
    enabled: entitled && enabled,
    retry: false,
  });
}

export function useBusinessQueue(workspace: string | undefined, enabled: boolean) {
  const { uid, entitled } = useEntitled();
  return useQuery({
    queryKey: key(uid, 'queue', workspace ?? 'own'),
    queryFn: () => careerApi.businessQueue(workspace),
    enabled: entitled && enabled,
    retry: false,
  });
}

export function useBusinessUsage(workspace: string | undefined, enabled: boolean) {
  const { uid, entitled } = useEntitled();
  return useQuery({
    queryKey: key(uid, 'usage', workspace ?? 'own'),
    queryFn: () => careerApi.businessUsage(workspace),
    enabled: entitled && enabled,
    retry: false,
  });
}

export function useBusinessReport(workspace: string | undefined, enabled: boolean) {
  const { uid, entitled } = useEntitled();
  return useQuery({
    queryKey: key(uid, 'report', workspace ?? 'own'),
    queryFn: () => careerApi.businessReport(workspace),
    enabled: entitled && enabled,
    retry: false,
  });
}

/** Opening a candidate is a read the person asks for; the API returns only what the candidate shares. */
export function useOpenCandidate(workspace: string | undefined) {
  return useMutation({ mutationFn: (candidateId: string) => careerApi.businessCandidate(candidateId, workspace) });
}

/** Workspace changes; each refreshes the overview (and report) of that workspace. */
export function useBusinessActions(workspace: string | undefined) {
  const queryClient = useQueryClient();
  const uid = useUid();
  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: key(uid, 'overview', workspace ?? 'own') });
    void queryClient.invalidateQueries({ queryKey: key(uid, 'report', workspace ?? 'own') });
    void queryClient.invalidateQueries({ queryKey: key(uid, 'usage', workspace ?? 'own') });
  };
  return {
    inviteStaff: useMutation({
      mutationFn: (input: { email: string; role: BusinessStaffRole }) => careerApi.inviteStaff(input.email, input.role, workspace),
      onSuccess: refresh,
    }),
    removeStaff: useMutation({ mutationFn: (staffId: string) => careerApi.removeStaff(staffId, workspace), onSuccess: refresh }),
    inviteCandidate: useMutation({
      mutationFn: (input: { email: string; consent: boolean }) => careerApi.inviteCandidate(input.email, input.consent, workspace),
      onSuccess: refresh,
    }),
    revokeCandidate: useMutation({ mutationFn: (candidateId: string) => careerApi.revokeCandidateInvite(candidateId, workspace), onSuccess: refresh }),
    archiveCandidate: useMutation({
      mutationFn: (input: { candidateId: string; archived: boolean }) => careerApi.setCandidateArchived(input.candidateId, input.archived, workspace),
      onSuccess: refresh,
    }),
    assign: useMutation({
      mutationFn: (input: { staffId: string; candidateId: string }) => careerApi.assignCounselor(input.staffId, input.candidateId, workspace),
      onSuccess: refresh,
    }),
  };
}

export function useBusinessQueueActions(workspace: string | undefined) {
  const queryClient = useQueryClient();
  const uid = useUid();
  const queueKey = key(uid, 'queue', workspace ?? 'own');
  return {
    add: useMutation({
      mutationFn: (input: { title: string; url: string | null; note: string; candidateId: string | null }) =>
        careerApi.addBusinessQueueItem(input, workspace),
      onSuccess: (saved) => {
        queryClient.setQueryData<{ items: BusinessQueueItem[] }>(queueKey, (list) => ({ items: [saved, ...(list?.items ?? [])] }));
        void queryClient.invalidateQueries({ queryKey: key(uid, 'report', workspace ?? 'own') });
      },
    }),
    remove: useMutation({
      mutationFn: (itemId: string) => careerApi.removeBusinessQueueItem(itemId, workspace),
      onSuccess: (_result, itemId) => {
        queryClient.setQueryData<{ items: BusinessQueueItem[] }>(queueKey, (list) =>
          list ? { items: list.items.filter((item) => item.id !== itemId) } : list,
        );
        void queryClient.invalidateQueries({ queryKey: key(uid, 'report', workspace ?? 'own') });
      },
    }),
  };
}

/** The invited candidate's own memberships: sharing and leaving. */
export function useMembershipActions() {
  const queryClient = useQueryClient();
  const uid = useUid();
  const refresh = () => queryClient.invalidateQueries({ queryKey: key(uid, 'memberships') });
  return {
    share: useMutation({
      mutationFn: (input: { candidateId: string; shareProfile: boolean }) => careerApi.setBusinessShare(input.candidateId, input.shareProfile),
      onSuccess: refresh,
    }),
    leave: useMutation({ mutationFn: (candidateId: string) => careerApi.leaveBusiness(candidateId), onSuccess: refresh }),
  };
}

export function useAcceptInvitation() {
  const queryClient = useQueryClient();
  const uid = useUid();
  return useMutation({
    mutationFn: (token: string) => careerApi.acceptBusinessInvitation(token),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: key(uid) }),
  });
}
