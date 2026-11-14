import { transcriptionRequest } from '@flacroncv/career-shared';
import { isBillingError } from '../billing/errors';
import { UnconfiguredSpeechTranscriber } from './speech-transcriber';

describe('UnconfiguredSpeechTranscriber', () => {
  it('refuses without inventing text', async () => {
    const request = transcriptionRequest({ language: 'en', mimeType: 'audio/webm', byteLength: 2048 });
    expect(request).not.toBeNull();
    const error = await new UnconfiguredSpeechTranscriber().transcribe({ ...request!, audio: Buffer.from('fake') }).catch((caught: unknown) => caught);
    expect(isBillingError(error, 'provider_unavailable')).toBe(true);
    expect(JSON.stringify(error)).not.toMatch(/"text"|hello|I used SQL/i);
  });
});
