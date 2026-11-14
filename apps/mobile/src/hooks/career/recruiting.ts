import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { careerApi } from '../../lib/career-api';
import { optInCount } from '../../lib/career/recruiting';
import { useEntitled, useUid } from '../useCareer';

/** The signed-in user's own recruiting opt-in (`GET /recruiting/opt-in`). */
export function useRecruitingOptIn() {
  const { uid, entitled } = useEntitled();
  return useQuery({
    queryKey: ['career', uid, 'recruiting-opt-in'],
    queryFn: async () => (await careerApi.recruitingOptIn()).discoverable === true,
    enabled: entitled && Boolean(uid),
    retry: false,
  });
}

/**
 * How many people opted in, read only when the person asks (`refetch()`).
 * The career API returns a count, never identities.
 */
export function useRecruitingCount() {
  const uid = useUid();
  return useQuery({
    queryKey: ['career', uid, 'recruiting-count'],
    queryFn: async () => optInCount(await careerApi.recruitingSearch()),
    enabled: false,
    retry: false,
  });
}

export function useSetRecruitingOptIn() {
  const queryClient = useQueryClient();
  const uid = useUid();
  return useMutation({
    mutationFn: (discoverable: boolean) => careerApi.setRecruitingOptIn(discoverable),
    onSuccess: (saved) => {
      queryClient.setQueryData(['career', uid, 'recruiting-opt-in'], saved.discoverable);
      // A shown total is stale once this person's choice changed.
      queryClient.removeQueries({ queryKey: ['career', uid, 'recruiting-count'] });
    },
  });
}
