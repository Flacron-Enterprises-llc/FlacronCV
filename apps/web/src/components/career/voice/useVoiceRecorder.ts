'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

/** Containers the server can measure, best first. Safari only offers MP4. */
const PREFERRED_TYPES = ['audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus', 'audio/mp4'];

export type RecorderStatus = 'idle' | 'requesting' | 'recording' | 'stopped' | 'denied' | 'unsupported' | 'error';

export interface VoiceRecorder {
  status: RecorderStatus;
  /** Seconds since recording started (browser clock, for display only; the server measures the file). */
  elapsed: number;
  /** The finished take, once stopped. */
  take: Blob | null;
  start: (limitSeconds: number) => Promise<void>;
  stop: () => void;
  discard: () => void;
}

export function recorderSupported(): boolean {
  return (
    typeof window !== 'undefined' &&
    typeof navigator !== 'undefined' &&
    typeof navigator.mediaDevices?.getUserMedia === 'function' &&
    typeof (globalThis as { MediaRecorder?: unknown }).MediaRecorder === 'function'
  );
}

function pickMimeType(): string | undefined {
  const check = MediaRecorder.isTypeSupported?.bind(MediaRecorder);
  if (!check) return undefined;
  return PREFERRED_TYPES.find((type) => check(type));
}

/**
 * Microphone recording with MediaRecorder. It stops itself at the limit it
 * was started with (the time left, capped per take), releases the
 * microphone as soon as it stops, and never uploads anything itself.
 */
export function useVoiceRecorder(): VoiceRecorder {
  const [status, setStatus] = useState<RecorderStatus>(() => (recorderSupported() ? 'idle' : 'unsupported'));
  const [elapsed, setElapsed] = useState(0);
  const [take, setTake] = useState<Blob | null>(null);
  const recorder = useRef<MediaRecorder | null>(null);
  const stream = useRef<MediaStream | null>(null);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  const startedAt = useRef(0);

  const release = useCallback(() => {
    if (timer.current) clearInterval(timer.current);
    timer.current = null;
    stream.current?.getTracks().forEach((track) => track.stop());
    stream.current = null;
  }, []);

  useEffect(
    () => () => {
      if (recorder.current && recorder.current.state !== 'inactive') {
        recorder.current.onstop = null;
        recorder.current.stop();
      }
      release();
    },
    [release],
  );

  const stop = useCallback(() => {
    if (recorder.current && recorder.current.state !== 'inactive') recorder.current.stop();
  }, []);

  const start = useCallback(
    async (limitSeconds: number) => {
      if (!recorderSupported()) {
        setStatus('unsupported');
        return;
      }
      if (limitSeconds < 1) return;
      setTake(null);
      setElapsed(0);
      setStatus('requesting');
      let media: MediaStream;
      try {
        media = await navigator.mediaDevices.getUserMedia({ audio: true });
      } catch (error) {
        const name = (error as { name?: string } | null)?.name;
        setStatus(name === 'NotAllowedError' || name === 'SecurityError' ? 'denied' : 'error');
        return;
      }
      stream.current = media;
      let next: MediaRecorder;
      try {
        const mimeType = pickMimeType();
        next = mimeType ? new MediaRecorder(media, { mimeType }) : new MediaRecorder(media);
      } catch {
        release();
        setStatus('unsupported');
        return;
      }
      const chunks: Blob[] = [];
      next.ondataavailable = (event) => {
        if (event.data && event.data.size > 0) chunks.push(event.data);
      };
      next.onstop = () => {
        release();
        const type = next.mimeType || chunks[0]?.type || 'audio/webm';
        const blob = new Blob(chunks, { type });
        setTake(blob.size > 0 ? blob : null);
        setStatus(blob.size > 0 ? 'stopped' : 'error');
      };
      recorder.current = next;
      startedAt.current = Date.now();
      next.start(1000);
      setStatus('recording');
      timer.current = setInterval(() => {
        const seconds = Math.floor((Date.now() - startedAt.current) / 1000);
        setElapsed(seconds);
        if (seconds >= limitSeconds) next.stop();
      }, 250);
    },
    [release],
  );

  const discard = useCallback(() => {
    setTake(null);
    setElapsed(0);
    setStatus(recorderSupported() ? 'idle' : 'unsupported');
  }, []);

  return { status, elapsed, take, start, stop, discard };
}
