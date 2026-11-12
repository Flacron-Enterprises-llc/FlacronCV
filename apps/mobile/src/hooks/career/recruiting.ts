import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { careerApi } from '../../lib/career-api';
import { isDiscoverable } from '../../lib/career/recruiting';
import { useEntitled, useUid } from '../useCareer';

/**
 * The signed-in user's recruiting opt-in. The career API has no read for it,
 * so the current value is whether this user is on the opted-in list (only the
 * boolean leaves this hook; the list itself is not kept or shown).
 */
export function useRecruitingOptIn() {
  const { uid, entitled } = useEntitled();
  return useQuery({
    queryKey: ['career', uid, 'recruiting-opt-in'],
    queryFn: async () => isDiscoverable(await careerApi.recruitingSearch(), uid),
    enabled: entitled && Boolean(uid),
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
    },
  });
}
