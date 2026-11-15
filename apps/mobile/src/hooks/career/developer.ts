import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { ApiKeyEnvironment, DeveloperStatus } from '../../../../../packages/career-api-client/src/types';
import { careerApi } from '../../lib/career-api';
import { withCreatedKey, withRevokedKey } from '../../lib/career/developer';
import { useEntitled, useUid } from '../useCareer';

/** Developer page data (`GET /developer`): add-ons, key prefixes (never secrets) and the saved brand. */
export function useDeveloperStatus() {
  const { uid, entitled } = useEntitled();
  return useQuery({ queryKey: ['career', uid, 'developer'], queryFn: () => careerApi.developerStatus(), enabled: entitled, retry: false });
}

export function useDeveloperActions() {
  const queryClient = useQueryClient();
  const uid = useUid();
  const queryKey = ['career', uid, 'developer'];
  return {
    // The returned secret is shown once by the screen and never cached.
    create: useMutation({
      mutationFn: (environment: ApiKeyEnvironment) => careerApi.createDeveloperKey(environment),
      onSuccess: (created) =>
        queryClient.setQueryData<DeveloperStatus>(queryKey, (status) => (status ? { ...status, keys: withCreatedKey(status.keys ?? [], created) } : status)),
    }),
    revoke: useMutation({
      mutationFn: (keyId: string) => careerApi.revokeDeveloperKey(keyId),
      onSuccess: (_result, keyId) =>
        queryClient.setQueryData<DeveloperStatus>(queryKey, (status) => (status ? { ...status, keys: withRevokedKey(status.keys ?? [], keyId) } : status)),
    }),
    brand: useMutation({
      mutationFn: (input: { brandName: string; attribution: string }) => careerApi.setWhiteLabel(input.brandName, input.attribution),
      onSuccess: (saved) => queryClient.setQueryData<DeveloperStatus>(queryKey, (status) => (status ? { ...status, brand: saved } : status)),
    }),
  };
}
