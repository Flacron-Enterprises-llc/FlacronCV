import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { VoiceList, VoiceSession } from '../../../../../packages/career-api-client/src/types';
import { careerApi } from '../../lib/career-api';
import { useEntitled, useUid } from '../useCareer';

/**
 * Voice practice sessions. Keys start with ['career', uid]. Recording a take
 * is a real audio upload the server measures and bills; this app has no audio
 * recording module yet, so takes are recorded on the website and the app only
 * reads sessions, saves transcript corrections (free) and removes stored audio.
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
  return (session: VoiceSession) => {
    queryClient.setQueryData<VoiceList>(['career', uid, 'voice'], (list) =>
      list ? { ...list, items: list.items.map((item) => (item.id === session.id ? session : item)) } : list,
    );
  };
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
