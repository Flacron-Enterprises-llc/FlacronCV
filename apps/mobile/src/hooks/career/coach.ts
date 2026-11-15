import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { AskCoachInput, CoachList, CoachThread, CoachThreadSummary } from '../../../../../packages/career-api-client/src/types';
import { careerApi } from '../../lib/career-api';
import { useEntitled, useUid } from '../useCareer';

/**
 * Career coach conversations. Keys start with ['career', uid] so another
 * account on the device never sees this one's threads. The career API meters
 * replies; a retry of the same question reuses its idempotency key.
 */

function summary(thread: CoachThread): CoachThreadSummary {
  return {
    id: thread.id,
    title: thread.title,
    opportunityId: thread.opportunityId,
    messageCount: thread.messageCount,
    updatedAt: thread.updatedAt,
  };
}

export function useCoachThreads() {
  const { uid, entitled } = useEntitled();
  return useQuery({ queryKey: ['career', uid, 'coach'], queryFn: () => careerApi.coachThreads(), enabled: entitled });
}

export function useCoachThread(id: string | undefined) {
  const { uid, entitled } = useEntitled();
  return useQuery({
    queryKey: ['career', uid, 'coach-thread', id],
    queryFn: () => careerApi.coachThread(id as string),
    enabled: entitled && Boolean(id),
  });
}

export function useAskCoach() {
  const queryClient = useQueryClient();
  const uid = useUid();
  return useMutation({
    mutationFn: (input: { body: AskCoachInput; idempotencyKey: string }) => careerApi.askCoach(input.body, input.idempotencyKey),
    onSuccess: (paid) => {
      queryClient.setQueryData(['career', uid, 'coach-thread', paid.thread.id], paid.thread);
      queryClient.setQueryData<CoachList>(['career', uid, 'coach'], (list) =>
        list
          ? {
              items: [summary(paid.thread), ...list.items.filter((item) => item.id !== paid.thread.id)],
              coaching: {
                ...list.coaching,
                includedRemaining: paid.usage.includedRemaining,
                packRemaining: paid.usage.packRemaining,
              },
            }
          : list,
      );
      void queryClient.invalidateQueries({ queryKey: ['career', uid, 'coach'] });
      void queryClient.invalidateQueries({ queryKey: ['career', uid, 'usage'] });
    },
  });
}

export function useDeleteCoachThread() {
  const queryClient = useQueryClient();
  const uid = useUid();
  return useMutation({
    mutationFn: (threadId: string) => careerApi.deleteCoachThread(threadId),
    onSuccess: (_result, threadId) => {
      queryClient.removeQueries({ queryKey: ['career', uid, 'coach-thread', threadId] });
      queryClient.setQueryData<CoachList>(['career', uid, 'coach'], (list) =>
        list ? { ...list, items: list.items.filter((item) => item.id !== threadId) } : list,
      );
    },
  });
}
