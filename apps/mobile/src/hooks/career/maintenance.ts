import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { careerApi } from '../../lib/career-api';
import { useEntitled, useUid } from '../useCareer';

/** Career maintenance (website: career/maintenance). Keys start with ['career', uid]. */
const key = (uid: string | null) => ['career', uid, 'maintenance'] as const;

export function useMaintenance() {
  const { uid, entitled } = useEntitled();
  return useQuery({ queryKey: key(uid), queryFn: () => careerApi.maintenance(), enabled: entitled });
}

/** Free writes. Each refreshes the maintenance view; none can be undone through the API. */
export function useMaintenanceActions() {
  const queryClient = useQueryClient();
  const uid = useUid();
  const refresh = () => queryClient.invalidateQueries({ queryKey: key(uid) });
  return {
    addAchievement: useMutation({ mutationFn: (title: string) => careerApi.addAchievement(title), onSuccess: refresh }),
    addPromotionGoal: useMutation({ mutationFn: (desiredTitle: string) => careerApi.addPromotionGoal(desiredTitle), onSuccess: refresh }),
    addCredential: useMutation({
      mutationFn: (input: { name: string; expiresOn: string }) => careerApi.addCredential(input.name, input.expiresOn),
      onSuccess: refresh,
    }),
  };
}
