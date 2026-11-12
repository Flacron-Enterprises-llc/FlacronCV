import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  CareerEvidence,
  CreateEvidenceInput,
  UpdateEvidenceInput,
} from '../../../../../packages/career-api-client/src/types';
import { careerApi } from '../../lib/career-api';
import { checkUploadSize, type MobileUploadType } from '../../lib/career/evidence';
import { useCareerAccess, useEntitled, useUid } from '../useCareer';

/**
 * Evidence vault data. Keys start with ['career', uid] so another account on
 * the device never sees this one's cached items.
 */

/** 'locked' when career is not on the plan or the operator switch for evidence is off. */
export function useEvidenceGate(): 'loading' | 'locked' | 'off' | 'open' | 'error' {
  const access = useCareerAccess();
  if (access.isLoading) return 'loading';
  if (access.error || !access.data) return 'error';
  if (!access.data.enabled) return 'locked';
  if (access.data.features?.evidenceItems !== true) return 'off';
  return 'open';
}

export function useEvidenceList() {
  const { uid, entitled } = useEntitled();
  return useQuery({ queryKey: ['career', uid, 'evidence'], queryFn: () => careerApi.evidence(), enabled: entitled });
}

export function useEvidenceItem(id: string | undefined) {
  const { uid, entitled } = useEntitled();
  return useQuery({
    queryKey: ['career', uid, 'evidence', id],
    queryFn: () => careerApi.getEvidence(id as string),
    enabled: entitled && Boolean(id),
  });
}

export function useEvidenceActions() {
  const queryClient = useQueryClient();
  const uid = useUid();

  /** Put the fresh item in the detail cache and refresh the list (and portfolio pickers). */
  const store = (item: CareerEvidence) => {
    queryClient.setQueryData(['career', uid, 'evidence', item.id], item);
    void queryClient.invalidateQueries({ queryKey: ['career', uid, 'evidence'], exact: true });
  };

  return {
    create: useMutation({ mutationFn: (input: CreateEvidenceInput) => careerApi.createEvidence(input), onSuccess: store }),
    update: useMutation({
      mutationFn: (input: { id: string; body: UpdateEvidenceInput }) => careerApi.updateEvidence(input.id, input.body),
      onSuccess: store,
    }),
    remove: useMutation({
      mutationFn: (id: string) => careerApi.deleteEvidence(id),
      // The open detail screen navigates back itself; removing its query here would refetch a 404 first.
      onSuccess: () => {
        void queryClient.invalidateQueries({ queryKey: ['career', uid, 'evidence'], exact: true });
        // A deleted item drops out of portfolio pages too.
        void queryClient.invalidateQueries({ queryKey: ['career', uid, 'portfolios'] });
      },
    }),
    /** Reads the picked photo into a Blob of the checked type and stores it privately. */
    upload: useMutation({
      mutationFn: async (input: { id: string; uri: string; contentType: MobileUploadType; fileName: string }) => {
        const source = await (await fetch(input.uri)).blob();
        const tooBig = checkUploadSize(source.size);
        if (tooBig) throw new UploadRefused(tooBig);
        const body = source.type === input.contentType ? source : new Blob([source], { type: input.contentType });
        return careerApi.uploadEvidenceAttachment(input.id, body, input.fileName);
      },
      onSuccess: store,
    }),
    removeFile: useMutation({ mutationFn: (id: string) => careerApi.removeEvidenceAttachment(id), onSuccess: store }),
    /** A five-minute download link; never cached. */
    link: useMutation({ mutationFn: (id: string) => careerApi.evidenceAttachmentLink(id) }),
  };
}

/** A local refusal before anything was sent (its message is shown as is). */
export class UploadRefused extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'UploadRefused';
  }
}
