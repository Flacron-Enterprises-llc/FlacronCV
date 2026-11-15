import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { ActionPack, ActionPackEdit, ActionPackList } from '../../../../../packages/career-api-client/src/types';
import { careerApi } from '../../lib/career-api';
import { replacePack, sortPacks, withChecklistItem } from '../../lib/career/action-packs';
import { useEntitled, useUid } from '../useCareer';

/**
 * Action packs (website: career/action-pack). Keys start with ['career', uid]
 * so a second account on the device never sees the first one's packs.
 */
const listKey = (uid: string | null) => ['career', uid, 'action-packs'] as const;
const packKey = (uid: string | null, id: string | undefined) => ['career', uid, 'action-packs', 'item', id] as const;

export function useActionPacks() {
  const { uid, entitled } = useEntitled();
  return useQuery({ queryKey: listKey(uid), queryFn: () => careerApi.actionPacks(), enabled: entitled });
}

export function useActionPack(id: string | undefined) {
  const { uid, entitled } = useEntitled();
  const queryClient = useQueryClient();
  return useQuery({
    queryKey: packKey(uid, id),
    queryFn: () => careerApi.getActionPack(id as string),
    enabled: entitled && Boolean(id),
    // Shows the pack from the list at once while the fresh copy loads.
    placeholderData: () => queryClient.getQueryData<ActionPackList>(listKey(uid))?.items.find((p) => p.id === id),
  });
}

/** One paid action: the caller passes the idempotency key it keeps for retries of the same action. */
export function useCreateActionPack() {
  const queryClient = useQueryClient();
  const uid = useUid();
  return useMutation({
    mutationFn: (input: { opportunityId: string; idempotencyKey: string }) =>
      careerApi.createActionPack({ opportunityId: input.opportunityId }, input.idempotencyKey),
    onSuccess: (paid) => {
      queryClient.setQueryData<ActionPackList>(listKey(uid), (current) =>
        current
          ? {
              items: sortPacks([paid.actionPack, ...current.items.filter((p) => p.id !== paid.actionPack.id)]),
              actionPack: { ...current.actionPack, includedRemaining: paid.usage.includedRemaining, packRemaining: paid.usage.packRemaining },
            }
          : current,
      );
      queryClient.setQueryData(packKey(uid, paid.actionPack.id), paid.actionPack);
      void queryClient.invalidateQueries({ queryKey: listKey(uid), exact: true });
      void queryClient.invalidateQueries({ queryKey: ['career', uid, 'usage'] });
    },
  });
}

/** Ticks a checklist item (free). Optimistic, rolled back if the server refuses. */
export function useToggleChecklist(packId: string | undefined) {
  const queryClient = useQueryClient();
  const uid = useUid();
  const writeBoth = (pack: ActionPack) => {
    queryClient.setQueryData(packKey(uid, pack.id), pack);
    queryClient.setQueryData<ActionPackList>(listKey(uid), (current) => (current ? { ...current, items: replacePack(current.items, pack) } : current));
  };
  return useMutation({
    mutationFn: (input: { checklistId: string; done: boolean }) =>
      careerApi.updateActionPackChecklist(packId as string, input.checklistId, input.done),
    onMutate: async (input) => {
      await queryClient.cancelQueries({ queryKey: packKey(uid, packId) });
      const previous = queryClient.getQueryData<ActionPack>(packKey(uid, packId));
      if (previous) writeBoth(withChecklistItem(previous, input.checklistId, input.done));
      return { previous };
    },
    onError: (_error, _input, context) => {
      if (context?.previous) writeBoth(context.previous);
    },
    onSuccess: (pack) => writeBoth(pack),
  });
}

/** Retries the cover letter of a partial pack under the credit it already holds (no new credit). */
export function useRetryActionPackLetter(packId: string | undefined) {
  const queryClient = useQueryClient();
  const uid = useUid();
  return useMutation({
    mutationFn: () => careerApi.retryActionPackComponent(packId as string, 'coverLetter'),
    onSuccess: (paid) => {
      queryClient.setQueryData(packKey(uid, paid.actionPack.id), paid.actionPack);
      queryClient.setQueryData<ActionPackList>(listKey(uid), (current) =>
        current ? { ...current, items: replacePack(current.items, paid.actionPack) } : current,
      );
    },
    onSettled: () => {
      // A final failure removes the pack server-side and returns its credit.
      void queryClient.invalidateQueries({ queryKey: listKey(uid) });
      void queryClient.invalidateQueries({ queryKey: ['career', uid, 'usage'] });
    },
  });
}

function useWritePack() {
  const queryClient = useQueryClient();
  const uid = useUid();
  return (pack: ActionPack) => {
    queryClient.setQueryData(packKey(uid, pack.id), pack);
    queryClient.setQueryData<ActionPackList>(listKey(uid), (current) => (current ? { ...current, items: replacePack(current.items, pack) } : current));
  };
}

/** Saves the person's own edit of one component (free). */
export function useUpdateActionPack(packId: string | undefined) {
  const write = useWritePack();
  return useMutation({
    mutationFn: (edit: ActionPackEdit) => careerApi.updateActionPack(packId as string, edit),
    onSuccess: (pack) => write(pack),
  });
}

/** Copies the tailored résumé and letter into Documents (free; again replaces the copies). */
export function useSaveActionPackDocuments(packId: string | undefined) {
  const write = useWritePack();
  const queryClient = useQueryClient();
  const uid = useUid();
  return useMutation({
    mutationFn: () => careerApi.saveActionPackDocuments(packId as string),
    onSuccess: (result) => {
      write(result.actionPack);
      void queryClient.invalidateQueries({ queryKey: ['career', uid, 'resumes'] });
      void queryClient.invalidateQueries({ queryKey: ['career', uid, 'writing'] });
    },
  });
}

/** Cancels an unfinished pack (or deletes an expired one): the pack is removed and its held credit returned. */
export function useCancelActionPack() {
  const queryClient = useQueryClient();
  const uid = useUid();
  return useMutation({
    mutationFn: (packId: string) => careerApi.cancelActionPack(packId),
    onSuccess: (_result, packId) => {
      queryClient.setQueryData<ActionPackList>(listKey(uid), (current) =>
        current ? { ...current, items: current.items.filter((p) => p.id !== packId) } : current,
      );
      queryClient.removeQueries({ queryKey: packKey(uid, packId), exact: true });
      void queryClient.invalidateQueries({ queryKey: listKey(uid), exact: true });
      void queryClient.invalidateQueries({ queryKey: ['career', uid, 'usage'] });
    },
  });
}
