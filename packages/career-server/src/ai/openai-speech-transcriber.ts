import { BillingError } from '../billing/errors';
import { UnconfiguredSpeechTranscriber } from './speech-transcriber';
import type { SpeechTranscribeResult, SpeechTranscriber, SpeechTranscriptionInput } from './speech-transcriber';

/** OpenAI's speech-to-text endpoint. Audio is sent once per recording and not stored by this adapter. */
const ENDPOINT = 'https://api.openai.com/v1/audio/transcriptions';
export const DEFAULT_TRANSCRIBE_MODEL = 'gpt-4o-mini-transcribe';
const TRANSCRIBE_MODELS = new Set(['gpt-4o-mini-transcribe', 'gpt-4o-transcribe', 'whisper-1']);
const DEFAULT_TIMEOUT_MS = 120_000;

/** File name extension OpenAI uses to detect the container. */
const EXTENSION: Record<string, string> = {
  'audio/webm': 'webm',
  'audio/ogg': 'ogg',
  'audio/wav': 'wav',
  'audio/mp4': 'mp4',
  'audio/mpeg': 'mp3',
};

export function transcribeModelOrDefault(value: string | undefined): string {
  const model = value?.trim();
  return model && TRANSCRIBE_MODELS.has(model) ? model : DEFAULT_TRANSCRIBE_MODEL;
}

/**
 * Real transcription through OpenAI. Empty audio is refused (the check-only
 * path carries no recording); any vendor failure is `provider_unavailable`
 * for auth/availability problems and a plain error otherwise. Never invents
 * text: an empty transcript from the vendor is returned as empty.
 */
export class OpenAISpeechTranscriber implements SpeechTranscriber {
  constructor(
    private readonly apiKey: string,
    private readonly model: string = DEFAULT_TRANSCRIBE_MODEL,
    private readonly fetchImpl: typeof fetch = fetch,
    private readonly timeoutMs: number = DEFAULT_TIMEOUT_MS,
  ) {}

  async transcribe(request: SpeechTranscriptionInput): Promise<SpeechTranscribeResult> {
    if (!request.audio || request.audio.length === 0) {
      throw new BillingError('validation_error', { field: 'audio', reason: 'empty' });
    }
    const mimeType = request.mimeType ?? 'audio/webm';
    const extension = EXTENSION[mimeType];
    if (!extension) throw new BillingError('validation_error', { field: 'mimeType', reason: 'invalid' });

    const form = new FormData();
    form.append('model', this.model);
    form.append('language', request.language);
    form.append('response_format', 'json');
    form.append('file', new Blob([new Uint8Array(request.audio)], { type: mimeType }), `answer.${extension}`);

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    let response: Response;
    try {
      response = await this.fetchImpl(ENDPOINT, {
        method: 'POST',
        headers: { Authorization: `Bearer ${this.apiKey}` },
        body: form,
        signal: controller.signal,
      });
    } catch {
      throw new BillingError('provider_unavailable', { reason: 'transcription_unreachable' });
    } finally {
      clearTimeout(timer);
    }
    if (response.status === 401 || response.status === 403 || response.status === 429 || response.status >= 500) {
      throw new BillingError('provider_unavailable', { reason: `transcription_${response.status}` });
    }
    if (!response.ok) throw new Error(`Transcription refused (${response.status})`);
    const body = (await response.json().catch(() => null)) as { text?: unknown } | null;
    if (!body || typeof body.text !== 'string') throw new Error('Transcription returned no text field');
    return { text: body.text, provider: 'openai', model: this.model };
  }
}

/** Speech is on only when explicitly chosen: SPEECH_PROVIDER=openai plus OPENAI_API_KEY. */
export function speechProviderReady(env: NodeJS.ProcessEnv): boolean {
  return (env.SPEECH_PROVIDER?.trim().toLowerCase() ?? '') === 'openai' && (env.OPENAI_API_KEY?.trim() ?? '').length > 0;
}

export function createSpeechTranscriber(env: NodeJS.ProcessEnv = process.env): SpeechTranscriber {
  if (!speechProviderReady(env)) return new UnconfiguredSpeechTranscriber();
  return new OpenAISpeechTranscriber(env.OPENAI_API_KEY!.trim(), transcribeModelOrDefault(env.OPENAI_TRANSCRIBE_MODEL));
}
