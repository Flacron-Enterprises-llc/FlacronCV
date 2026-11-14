import { Readable } from 'stream';
import type { Request } from 'express';
import { isBillingError } from '@flacroncv/career-server';
import { readAudioBody } from './voice.controller';

function requestOf(chunks: Buffer[], headers: Record<string, string> = {}): Request {
  const stream = Readable.from(chunks) as unknown as Request;
  Object.assign(stream, { headers, body: undefined });
  return stream;
}

describe('readAudioBody', () => {
  it('reads the unparsed audio stream', async () => {
    const body = await readAudioBody(requestOf([Buffer.from('ab'), Buffer.from('cd')]), 10);
    expect(body.toString()).toBe('abcd');
  });

  it('refuses a declared or streamed body over the limit without buffering it all', async () => {
    const declared = await readAudioBody(requestOf([Buffer.alloc(1)], { 'content-length': '11' }), 10).catch((error: unknown) => error);
    expect(isBillingError(declared, 'validation_error')).toBe(true);
    const streamed = await readAudioBody(requestOf([Buffer.alloc(6), Buffer.alloc(6)]), 10).catch((error: unknown) => error);
    expect(isBillingError(streamed, 'validation_error')).toBe(true);
    if (isBillingError(streamed)) expect(streamed.details).toMatchObject({ field: 'audio', reason: 'too_large' });
  });

  it('uses a body a parser already read', async () => {
    const req = requestOf([]);
    (req as { body: unknown }).body = Buffer.from('ready');
    expect((await readAudioBody(req, 10)).toString()).toBe('ready');
  });
});
