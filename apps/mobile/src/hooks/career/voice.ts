import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { InterviewStage, VoiceList, VoiceSession } from '../../../../../packages/career-api-client/src/types';
import { careerApi } from '../../lib/career-api';
import { useEntitled, useUid } from '../useCareer';

/**
 * Voice practice over the typed path (no microphone capture on mobile, same
 * as the website). Keys start with ['career', uid]. Saving a take meters voice
 * seconds; a retry of the same take reuses its idempotency key.
 */

export function useVoiceInterviews() {
  const { uid, entitled } = useEntitled();
  return useQuery({
    queryKey: ['career', uid, 'voice'],
    queryFn: () => careerApi.voiceInterviews(),
    enabled: entitled,
    retry: false,
  });
}

function useVoiceCache() {
  const queryClient = useQueryClient();
  const uid = useUid();
  return (session: VoiceSession, patch?: Partial<Omit<VoiceList, 'items'>>) => {
    queryClient.setQueryData<VoiceList>(['career', uid, 'voice'], (list) =>
      list
        ? {
            ...list,
            ...patch,
            items: [session, ...list.items.filter((item) => item.id !== session.id)],
          }
        : list,
    );
  };
}

export function useConsentVoice() {
  const queryClient = useQueryClient();
  const uid = useUid();
  return useMutation({
    mutationFn: () => careerApi.consentVoice(),
    onSuccess: () => {
      queryClient.setQueryData<VoiceList>(['career', uid, 'voice'], (list) => (list ? { ...list, consent: true } : list));
    },
  });
}

export type StartVoiceInput =
  | { kind: 'practice'; opportunityId: string; stage: InterviewStage }
  | { kind: 'negotiation'; offer: string; salarySource: string };

export function useStartVoice() {
  const cache = useVoiceCache();
  return useMutation({
    mutationFn: (input: StartVoiceInput) => careerApi.startVoice(input),
    onSuccess: (session) => cache(session),
  });
}

export function useRecordVoice() {
  const cache = useVoiceCache();
  const queryClient = useQueryClient();
  const uid = useUid();
  return useMutation({
    mutationFn: (input: { sessionId: string; durationSeconds: number; transcript: string; idempotencyKey: string }) =>
      careerApi.recordVoice(input.sessionId, { durationSeconds: input.durationSeconds, transcript: input.transcript }, input.idempotencyKey),
    onSuccess: (result) => {
      cache(result.session, { remainingSeconds: result.remainingSeconds });
      void queryClient.invalidateQueries({ queryKey: ['career', uid, 'usage'] });
    },
  });
}

export function useCorrectVoiceTranscript() {
  const cache = useVoiceCache();
  return useMutation({
    mutationFn: (input: { sessionId: string; transcript: string }) => careerApi.correctVoiceTranscript(input.sessionId, input.transcript),
    onSuccess: (session) => cache(session),
  });
}

export function useDeleteVoiceAudio() {
  const cache = useVoiceCache();
  return useMutation({
    mutationFn: (sessionId: string) => careerApi.deleteVoiceAudio(sessionId),
    onSuccess: (session) => cache(session),
  });
}
