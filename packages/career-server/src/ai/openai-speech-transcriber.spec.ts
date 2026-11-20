import { isBillingError } from '../billing/errors';
import { OpenAISpeechTranscriber, createSpeechTranscriber, speechProviderReady, transcribeModelOrDefault } from './openai-speech-transcriber';
import { UnconfiguredSpeechTranscriber } from './speech-transcriber';

const audio = Buffer.from([0x1a, 0x45, 0xdf, 0xa3, 1, 2, 3]);
const input = { language: 'en' as const, mimeType: 'audio/webm', byteLength: audio.length, audio };

function fakeFetch(status: number, body: unknown) {
  const calls: Array<{ url: string; init: RequestInit }> = [];
  const impl = (async (url: string, init: RequestInit) => {
    calls.push({ url, init });
    return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
  }) as unknown as typeof fetch;
  return { impl, calls };
}

describe('OpenAISpeechTranscriber', () => {
  it('sends the audio with model, language and a container-matching file name, and returns the text', async () => {
    const { impl, calls } = fakeFetch(200, { text: ' I led the migration. ' });
    const result = await new OpenAISpeechTranscriber('sk-test', 'gpt-4o-mini-transcribe', impl).transcribe(input);
    expect(result).toEqual({ text: ' I led the migration. ', provider: 'openai', model: 'gpt-4o-mini-transcribe' });
    expect(calls).toHaveLength(1);
    expect(calls[0]!.url).toBe('https://api.openai.com/v1/audio/transcriptions');
    expect((calls[0]!.init.headers as Record<string, string>).Authorization).toBe('Bearer sk-test');
    const form = calls[0]!.init.body as FormData;
    expect(form.get('model')).toBe('gpt-4o-mini-transcribe');
    expect(form.get('language')).toBe('en');
    const file = form.get('file') as File;
    expect(file.name).toBe('answer.webm');
    expect(file.type).toBe('audio/webm');
    expect(file.size).toBe(audio.length);
  });

  it('refuses empty audio without calling the vendor (never invents text)', async () => {
    const { impl, calls } = fakeFetch(200, { text: 'should not be used' });
    await expect(new OpenAISpeechTranscriber('sk-test', undefined, impl).transcribe({ ...input, audio: Buffer.alloc(0), byteLength: 0 }))
      .rejects.toMatchObject({ code: 'validation_error' });
    expect(calls).toHaveLength(0);
  });

  it('maps auth, rate-limit and server failures to provider_unavailable, other refusals to a plain error', async () => {
    for (const status of [401, 429, 503]) {
      const error = await new OpenAISpeechTranscriber('sk-test', undefined, fakeFetch(status, { error: {} }).impl).transcribe(input).catch((e) => e);
      expect(isBillingError(error, 'provider_unavailable')).toBe(true);
    }
    const bad = await new OpenAISpeechTranscriber('sk-test', undefined, fakeFetch(400, { error: {} }).impl).transcribe(input).catch((e) => e);
    expect(isBillingError(bad, 'provider_unavailable')).toBe(false);
    expect(bad).toBeInstanceOf(Error);
    const unreachable = (async () => { throw new TypeError('fetch failed'); }) as unknown as typeof fetch;
    expect(isBillingError(await new OpenAISpeechTranscriber('sk-test', undefined, unreachable).transcribe(input).catch((e) => e), 'provider_unavailable')).toBe(true);
  });

  it('is configured only with SPEECH_PROVIDER=openai and a key; unknown models fall back to the default', () => {
    expect(speechProviderReady({ OPENAI_API_KEY: 'sk-x' })).toBe(false);
    expect(speechProviderReady({ SPEECH_PROVIDER: 'openai' })).toBe(false);
    expect(speechProviderReady({ SPEECH_PROVIDER: 'OpenAI', OPENAI_API_KEY: 'sk-x' })).toBe(true);
    expect(createSpeechTranscriber({ OPENAI_API_KEY: 'sk-x' })).toBeInstanceOf(UnconfiguredSpeechTranscriber);
    expect(createSpeechTranscriber({ SPEECH_PROVIDER: 'openai', OPENAI_API_KEY: 'sk-x' })).toBeInstanceOf(OpenAISpeechTranscriber);
    expect(transcribeModelOrDefault('whisper-1')).toBe('whisper-1');
    expect(transcribeModelOrDefault('gpt-made-up')).toBe('gpt-4o-mini-transcribe');
  });
});
