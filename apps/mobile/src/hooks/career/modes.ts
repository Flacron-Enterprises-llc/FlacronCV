import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { careerApi } from '../../lib/career-api';
import { useEntitled, useUid } from '../useCareer';
import type {
  CandidateSpecialistMode,
  CreateLocationProfileInput,
  UpdateLocationProfileInput,
  UpdateSpecialistModeInput,
} from '../../../../../packages/career-api-client/src/types';

/**
 * Career-mode location profiles and the specialist mode
 * (`/career-modes/...`; not the alert locations). Keys start with
 * ['career', uid] so a second account never sees the first one's cache.
 */

const LOCATIONS = 'career-mode-locations';
const SPECIALIST = 'specialist-mode';

export function useCareerModeLocations(enabled = true) {
  const { uid, entitled } = useEntitled();
  return useQuery({
    queryKey: ['career', uid, LOCATIONS],
    queryFn: () => careerApi.locations(),
    enabled: entitled && enabled,
  });
}

export function useSpecialistMode(enabled = true) {
  const { uid, entitled } = useEntitled();
  return useQuery({
    queryKey: ['career', uid, SPECIALIST],
    queryFn: () => careerApi.specialistMode(),
    enabled: entitled && enabled,
    retry: false,
  });
}

function useRefreshLocations() {
  const queryClient = useQueryClient();
  const uid = useUid();
  return () => queryClient.invalidateQueries({ queryKey: ['career', uid, LOCATIONS] });
}

export function useCreateCareerModeLocation() {
  const refresh = useRefreshLocations();
  return useMutation({
    mutationFn: (input: CreateLocationProfileInput) => careerApi.createLocation(input),
    onSuccess: () => void refresh(),
  });
}

export function useUpdateCareerModeLocation() {
  const refresh = useRefreshLocations();
  return useMutation({
    mutationFn: (input: { id: string; patch: UpdateLocationProfileInput }) => careerApi.updateLocation(input.id, input.patch),
    onSuccess: () => void refresh(),
  });
}

export function useDeleteCareerModeLocation() {
  const refresh = useRefreshLocations();
  return useMutation({
    mutationFn: (id: string) => careerApi.deleteLocation(id),
    onSuccess: () => void refresh(),
  });
}

export function useSaveSpecialistMode() {
  const queryClient = useQueryClient();
  const uid = useUid();
  return useMutation({
    mutationFn: (input: UpdateSpecialistModeInput) => careerApi.setSpecialistMode(input),
    onSuccess: (saved: CandidateSpecialistMode) => {
      queryClient.setQueryData(['career', uid, SPECIALIST], saved);
    },
  });
}
