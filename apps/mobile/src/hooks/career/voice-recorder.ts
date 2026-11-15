import * as Crypto from 'expo-crypto';
import {
  requestRecordingPermissionsAsync,
  setAudioModeAsync,
  useAudioRecorder,
  useAudioRecorderState,
  type RecordingOptions,
} from 'expo-audio';
import * as FileSystem from 'expo-file-system/legacy';
import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import { VOICE_RECORDING_OPTIONS, elapsedSeconds, reachedLimit } from '../../lib/career/voice';

export type RecorderStatus = 'idle' | 'requesting' | 'recording' | 'stopped' | 'denied' | 'error';

export interface VoiceTake {
  /** Local file (app cache). Deleted when the take is discarded or after it is saved. */
  uri: string;
  /** Recorder clock, for display only: the server measures the file. */
  seconds: number;
  /** One key per take, so a retried upload of the same take is never charged twice. */
  idempotencyKey: string;
}

export interface VoiceRecorder {
  status: RecorderStatus;
  elapsed: number;
  take: VoiceTake | null;
  /** False when the system will not show the permission prompt again (only Settings can allow it). */
  canAskAgain: boolean;
  /** True when the last take was stopped because the app went to the background. */
  stoppedInBackground: boolean;
  start: (limitSeconds: number) => Promise<void>;
  stop: () => Promise<void>;
  /** Forgets the take and deletes its file. */
  discard: () => void;
}

const OPTIONS = VOICE_RECORDING_OPTIONS as unknown as RecordingOptions;

async function deleteFile(uri: string | null | undefined) {
  if (!uri) return;
  try {
    await FileSystem.deleteAsync(uri, { idempotent: true });
  } catch {
    // A file the system already cleaned up is fine.
  }
}

async function recordingMode(on: boolean) {
  try {
    await setAudioModeAsync({ allowsRecording: on, playsInSilentMode: true });
  } catch {
    // The audio session could not be switched; recording reports its own error.
  }
}

/**
 * Microphone recording with expo-audio (AAC in .m4a). Asks for the
 * microphone only when recording starts, stops itself at the limit it was
 * started with (the time left, capped per take), stops when the app leaves
 * the foreground, and never uploads anything itself.
 */
export function useVoiceRecorder(): VoiceRecorder {
  const recorder = useAudioRecorder(OPTIONS);
  const state = useAudioRecorderState(recorder, 250);
  const [status, setStatus] = useState<RecorderStatus>('idle');
  const [take, setTake] = useState<VoiceTake | null>(null);
  const [canAskAgain, setCanAskAgain] = useState(true);
  const [stoppedInBackground, setStoppedInBackground] = useState(false);
  const limit = useRef(0);
  const finishing = useRef(false);
  const sawRecording = useRef(false);
  const lastMillis = useRef(0);
  const statusRef = useRef<RecorderStatus>('idle');
  statusRef.current = status;
  const takeRef = useRef<VoiceTake | null>(null);
  takeRef.current = take;

  const finish = useCallback(
    async (background = false) => {
      if (finishing.current || statusRef.current !== 'recording') return;
      finishing.current = true;
      try {
        if (recorder.isRecording) await recorder.stop();
      } catch {
        // Already stopped by its own duration limit.
      }
      await recordingMode(false);
      const uri = recorder.uri;
      const seconds = elapsedSeconds(Math.max(lastMillis.current, recorder.currentTime * 1000));
      if (uri && seconds > 0) {
        setTake({ uri, seconds, idempotencyKey: Crypto.randomUUID() });
        setStoppedInBackground(background);
        setStatus('stopped');
      } else {
        void deleteFile(uri);
        setStatus('error');
      }
      finishing.current = false;
    },
    [recorder],
  );

  // Stop at the limit, and notice when the native duration limit stopped it first.
  useEffect(() => {
    if (status !== 'recording') return;
    if (state.isRecording) {
      sawRecording.current = true;
      lastMillis.current = state.durationMillis;
      if (reachedLimit(state.durationMillis, limit.current)) void finish();
    } else if (sawRecording.current) {
      void finish();
    }
  }, [state.isRecording, state.durationMillis, status, finish]);

  // Leaving the app ends the take (no background recording); the person decides what to do with it.
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (next) => {
      if (next !== 'active' && statusRef.current === 'recording') void finish(true);
    });
    return () => subscription.remove();
  }, [finish]);

  // Leaving the screen stops the microphone and removes an unsaved take.
  useEffect(
    () => () => {
      try {
        if (recorder.isRecording) void recorder.stop();
      } catch {
        // Released already.
      }
      void recordingMode(false);
      void deleteFile(takeRef.current?.uri);
    },
    [recorder],
  );

  const start = useCallback(
    async (limitSeconds: number) => {
      if (limitSeconds < 1 || statusRef.current === 'recording' || statusRef.current === 'requesting') return;
      void deleteFile(takeRef.current?.uri);
      setTake(null);
      setStoppedInBackground(false);
      setStatus('requesting');
      try {
        const permission = await requestRecordingPermissionsAsync();
        if (!permission.granted) {
          setCanAskAgain(permission.canAskAgain);
          setStatus('denied');
          return;
        }
        await recordingMode(true);
        await recorder.prepareToRecordAsync();
        limit.current = limitSeconds;
        sawRecording.current = false;
        lastMillis.current = 0;
        recorder.record({ forDuration: limitSeconds });
        setStatus('recording');
      } catch {
        await recordingMode(false);
        setStatus('error');
      }
    },
    [recorder],
  );

  const stop = useCallback(() => finish(false), [finish]);

  const discard = useCallback(() => {
    void deleteFile(takeRef.current?.uri);
    setTake(null);
    setStoppedInBackground(false);
    setStatus('idle');
  }, []);

  return {
    status,
    elapsed: status === 'recording' ? elapsedSeconds(state.durationMillis) : (take?.seconds ?? 0),
    take,
    canAskAgain,
    stoppedInBackground,
    start,
    stop,
    discard,
  };
}
