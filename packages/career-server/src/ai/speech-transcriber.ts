import type { TranscriptionRequest } from '@flacroncv/career-shared';
import { BillingError } from '../billing/errors';

/**
 * Speech transcription goes through this interface. Production plugs in a
 * vendor adapter; this build uses `UnconfiguredSpeechTranscriber`. Nothing
 * in `packages/server` calls a vendor directly, and no adapter invents text.
 */
export interface SpeechTranscribeResult {
  text: string;
  provider: string;
  model: string;
}

/** What an adapter receives: the validated request shape plus the audio bytes themselves. */
export interface SpeechTranscriptionInput extends TranscriptionRequest {
  audio: Buffer;
}

export interface SpeechTranscriber {
  transcribe(request: SpeechTranscriptionInput): Promise<SpeechTranscribeResult>;
}

/** No vendor key yet. Every call is `provider_unavailable`. */
export class UnconfiguredSpeechTranscriber implements SpeechTranscriber {
  async transcribe(_request: SpeechTranscriptionInput): Promise<SpeechTranscribeResult> {
    throw new BillingError('provider_unavailable', { reason: 'transcription_not_configured' });
  }
}
