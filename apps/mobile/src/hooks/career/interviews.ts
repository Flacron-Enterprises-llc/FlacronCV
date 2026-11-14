import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  InterviewList,
  InterviewSession,
  StarStory,
  StarStoryInput,
  StartInterviewInput,
} from '../../../../../packages/career-api-client/src/types';
import { careerApi } from '../../lib/career-api';
import { useEntitled, useUid } from '../useCareer';

/**
 * Text interview practice and STAR stories. Keys start with ['career', uid]
 * so another account on the device never sees this one's sessions. The career
 * API meters sessions; a retry of the same start reuses its idempotency key.
 */

export function useInterviews() {
  const { uid, entitled } = useEntitled();
  return useQuery({ queryKey: ['career', uid, 'interviews'], queryFn: () => careerApi.interviews(), enabled: entitled });
}

export function useInterview(id: string | undefined) {
  const { uid, entitled } = useEntitled();
  return useQuery({
    queryKey: ['career', uid, 'interview', id],
    queryFn: () => careerApi.interview(id as string),
    enabled: entitled && Boolean(id),
  });
}

export function useStarStories() {
  const { uid, entitled } = useEntitled();
  return useQuery({ queryKey: ['career', uid, 'star-stories'], queryFn: () => careerApi.starStories(), enabled: entitled });
}

function useSessionCache() {
  const queryClient = useQueryClient();
  const uid = useUid();
  return (session: InterviewSession) => {
    queryClient.setQueryData(['career', uid, 'interview', session.id], session);
    queryClient.setQueryData<InterviewList>(['career', uid, 'interviews'], (list) =>
      list ? { ...list, items: list.items.map((item) => (item.id === session.id ? session : item)) } : list,
    );
  };
}

export function useCreateInterview() {
  const queryClient = useQueryClient();
  const uid = useUid();
  return useMutation({
    mutationFn: (input: { body: StartInterviewInput; idempotencyKey: string }) => careerApi.createInterview(input.body, input.idempotencyKey),
    onSuccess: (paid) => {
      queryClient.setQueryData(['career', uid, 'interview', paid.session.id], paid.session);
      queryClient.setQueryData<InterviewList>(['career', uid, 'interviews'], (list) =>
        list
          ? {
              items: [paid.session, ...list.items.filter((item) => item.id !== paid.session.id)],
              textInterview: {
                ...list.textInterview,
                includedRemaining: paid.usage.includedRemaining,
                packRemaining: paid.usage.packRemaining,
              },
            }
          : list,
      );
      void queryClient.invalidateQueries({ queryKey: ['career', uid, 'usage'] });
    },
  });
}

export function useAnswerInterview(sessionId: string | undefined) {
  const cache = useSessionCache();
  return useMutation({
    mutationFn: (answer: string) => careerApi.answerInterview(sessionId as string, answer),
    onSuccess: cache,
  });
}

export function useChallengeInterview(sessionId: string | undefined) {
  const cache = useSessionCache();
  return useMutation({
    mutationFn: (input: { answerId: string; note: string }) =>
      careerApi.challengeInterview(sessionId as string, input.answerId, input.note),
    onSuccess: cache,
  });
}

export function useCreateStarStory() {
  const queryClient = useQueryClient();
  const uid = useUid();
  return useMutation({
    mutationFn: (input: StarStoryInput) => careerApi.createStarStory(input),
    onSuccess: (story: StarStory) => {
      queryClient.setQueryData<{ items: StarStory[] }>(['career', uid, 'star-stories'], (list) =>
        list ? { items: [story, ...list.items.filter((item) => item.id !== story.id)] } : list,
      );
    },
  });
}

/** Edits a saved story; the career API re-checks numbers and the result against confirmed facts. */
export function useUpdateStarStory() {
  const queryClient = useQueryClient();
  const uid = useUid();
  return useMutation({
    mutationFn: (input: { id: string; body: StarStoryInput }) => careerApi.updateStarStory(input.id, input.body),
    onSuccess: (story: StarStory) => {
      queryClient.setQueryData<{ items: StarStory[] }>(['career', uid, 'star-stories'], (list) =>
        list ? { items: list.items.map((item) => (item.id === story.id ? story : item)) } : list,
      );
    },
  });
}

export function useDeleteStarStory() {
  const queryClient = useQueryClient();
  const uid = useUid();
  return useMutation({
    mutationFn: (storyId: string) => careerApi.deleteStarStory(storyId),
    onSuccess: (_result, storyId) => {
      queryClient.setQueryData<{ items: StarStory[] }>(['career', uid, 'star-stories'], (list) =>
        list ? { items: list.items.filter((item) => item.id !== storyId) } : list,
      );
    },
  });
}
