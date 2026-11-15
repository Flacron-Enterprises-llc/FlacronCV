import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { VoiceList, VoiceRecordResult, VoiceSession } from '../../../../../packages/career-api-client/src/types';
import { careerApi } from '../../lib/career-api';
import { VOICE_UPLOAD_TYPE, takeTooLarge, upsertSession, type VoiceStartInput } from '../../lib/career/voice';
import { useEntitled, useUid } from '../useCareer';

/**
 * Voice practice sessions. Keys start with ['career', uid]. Opening a
 * question is free; a take is a real audio upload the server measures and
 * bills by the second (one idempotency key per take, so a retried upload is
 * never charged twice). Transcript corrections are free; removing a
 * recording deletes the audio and keeps the summary.
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
  const key = ['career', uid, 'voice'];
  return {
    session: (session: VoiceSession) =>
      queryClient.setQueryData<VoiceList>(key, (list) => (list ? { ...list, items: upsertSession(list.items, session) } : list)),
    patch: (patch: Partial<VoiceList>) => queryClient.setQueryData<VoiceList>(key, (list) => (list ? { ...list, ...patch } : list)),
    usage: () => void queryClient.invalidateQueries({ queryKey: ['career', uid, 'usage'] }),
  };
}

/** Gives (true) or withdraws (false) recording consent. Withdrawing keeps earlier recordings. */
export function useVoiceConsent() {
  const cache = useVoiceCache();
  return useMutation({
    mutationFn: async (agree: boolean) => (agree ? (await careerApi.consentVoice()).consent : (await careerApi.withdrawVoiceConsent()).consent),
    onSuccess: (consent) => cache.patch({ consent }),
  });
}

/** Opens a practice or negotiation question. Spends nothing: only recorded seconds are counted. */
export function useStartVoice() {
  const cache = useVoiceCache();
  return useMutation({
    mutationFn: (input: VoiceStartInput) => careerApi.startVoice(input),
    onSuccess: (session) => cache.session(session),
  });
}

/** Thrown before upload when the file is bigger than the server accepts; nothing is sent or billed. */
export class TakeTooLarge extends Error {
  constructor() {
    super('take_too_large');
    this.name = 'TakeTooLarge';
  }
}

/** Uploads one recorded take from its file URI. */
export function useRecordVoice() {
  const cache = useVoiceCache();
  return useMutation({
    mutationFn: async (input: { sessionId: string; uri: string; idempotencyKey: string; language: 'en' | 'fr' }): Promise<VoiceRecordResult> => {
      const source = await (await fetch(input.uri)).blob();
      if (takeTooLarge(source.size)) throw new TakeTooLarge();
      const audio = source.type === VOICE_UPLOAD_TYPE ? source : new Blob([source], { type: VOICE_UPLOAD_TYPE });
      return careerApi.recordVoice(input.sessionId, audio, input.idempotencyKey, input.language);
    },
    onSuccess: (result) => {
      cache.session(result.session);
      cache.patch({ remainingSeconds: result.remainingSeconds });
      cache.usage();
    },
  });
}

/** A five-minute link to the caller's own stored take; never cached. */
export function useVoiceAudioLink() {
  return useMutation({ mutationFn: (sessionId: string) => careerApi.voiceAudioLink(sessionId) });
}

export function useCorrectVoiceTranscript() {
  const cache = useVoiceCache();
  return useMutation({
    mutationFn: (input: { sessionId: string; transcript: string }) => careerApi.correctVoiceTranscript(input.sessionId, input.transcript),
    onSuccess: (session) => cache.session(session),
  });
}

export function useDeleteVoiceAudio() {
  const cache = useVoiceCache();
  return useMutation({
    mutationFn: (sessionId: string) => careerApi.deleteVoiceAudio(sessionId),
    onSuccess: (session) => cache.session(session),
  });
}
