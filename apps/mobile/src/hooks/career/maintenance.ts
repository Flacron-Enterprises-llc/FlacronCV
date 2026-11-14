import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { AchievementInput, CredentialInput } from '../../../../../packages/career-api-client/src/types';
import { careerApi } from '../../lib/career-api';
import { useEntitled, useUid } from '../useCareer';

/** Career maintenance (website: career/maintenance). Keys start with ['career', uid]. */
const key = (uid: string | null) => ['career', uid, 'maintenance'] as const;

export function useMaintenance() {
  const { uid, entitled } = useEntitled();
  return useQuery({ queryKey: key(uid), queryFn: () => careerApi.maintenance(), enabled: entitled });
}

type GoalPatch = { desiredTitle?: string; targetDate?: string | null; status?: 'open' | 'dropped' };

/**
 * Free writes. Each refreshes the maintenance view (which also carries the
 * reminder list the server derives from credentials).
 */
export function useMaintenanceActions() {
  const queryClient = useQueryClient();
  const uid = useUid();
  const refresh = () => queryClient.invalidateQueries({ queryKey: key(uid) });
  return {
    addAchievement: useMutation({
      mutationFn: (input: AchievementInput & { title: string }) => {
        const { title, ...more } = input;
        return careerApi.addAchievement(title, more);
      },
      onSuccess: refresh,
    }),
    updateAchievement: useMutation({
      mutationFn: (input: { id: string; patch: AchievementInput }) => careerApi.updateAchievement(input.id, input.patch),
      onSuccess: refresh,
    }),
    deleteAchievement: useMutation({ mutationFn: (id: string) => careerApi.deleteAchievement(id), onSuccess: refresh }),
    addPromotionGoal: useMutation({
      mutationFn: (input: { desiredTitle: string; targetDate: string | null }) => careerApi.addPromotionGoal(input.desiredTitle, input.targetDate),
      onSuccess: refresh,
    }),
    updatePromotionGoal: useMutation({
      mutationFn: (input: { id: string; patch: GoalPatch }) => careerApi.updatePromotionGoal(input.id, input.patch),
      onSuccess: refresh,
    }),
    deletePromotionGoal: useMutation({ mutationFn: (id: string) => careerApi.deletePromotionGoal(id), onSuccess: refresh }),
    addCredential: useMutation({
      mutationFn: (input: CredentialInput & { name: string; expiresOn: string }) => {
        const { name, expiresOn, ...more } = input;
        return careerApi.addCredential(name, expiresOn, more);
      },
      onSuccess: refresh,
    }),
    updateCredential: useMutation({
      mutationFn: (input: { id: string; patch: CredentialInput }) => careerApi.updateCredential(input.id, input.patch),
      onSuccess: refresh,
    }),
    deleteCredential: useMutation({ mutationFn: (id: string) => careerApi.deleteCredential(id), onSuccess: refresh }),
  };
}
