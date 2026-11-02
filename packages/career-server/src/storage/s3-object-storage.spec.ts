import { DeleteObjectCommand, GetObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { S3ObjectStorage, MAX_SIGNED_URL_SECONDS } from './s3-object-storage';

/**
 * Mocked S3: no bucket, no network. `send` is a fake that records commands.
 * Presigning uses the real SDK signer with fake static credentials; it signs
 * locally and makes no request.
 */
const FAKE_CREDENTIALS = { accessKeyId: 'AKIDLOCALTESTONLY', secretAccessKey: 'local-test-signing-value' };
const NOW = new Date('2026-10-24T12:00:00Z');

function fakeClient(fail = false) {
  const commands: Array<PutObjectCommand | DeleteObjectCommand> = [];
  return {
    commands,
    client: {
      send: async (command: PutObjectCommand | DeleteObjectCommand) => {
        commands.push(command);
        if (fail) {
          const error = new Error('AccessDenied for arn:aws:s3:::flacroncv-staging-documents/evidence/x');
          error.name = 'AccessDenied';
          throw error;
        }
        return {};
      },
    } as unknown as Pick<S3Client, 'send'>,
  };
}

describe('S3ObjectStorage (mocked S3)', () => {
  it('puts a private object under the prefix with its type and server-side encryption', async () => {
    const fake = fakeClient();
    const storage = new S3ObjectStorage({ bucket: 'flacroncv-staging-documents', region: 'us-east-1', prefix: '/staging/', client: fake.client });
    await storage.put('evidence/ws/c/item/obj', Buffer.from('%PDF-1.7'), 'application/pdf');
    const input = (fake.commands[0] as PutObjectCommand).input;
    expect(fake.commands[0]).toBeInstanceOf(PutObjectCommand);
    expect(input).toMatchObject({
      Bucket: 'flacroncv-staging-documents',
      Key: 'staging/evidence/ws/c/item/obj',
      ContentType: 'application/pdf',
      ContentLength: 8,
      CacheControl: 'private, no-store',
      ServerSideEncryption: 'AES256',
    });
    expect(input).not.toHaveProperty('ACL');
  });

  it('uses KMS when a key id is configured', async () => {
    const fake = fakeClient();
    const storage = new S3ObjectStorage({ bucket: 'b', region: 'us-east-1', kmsKeyId: 'alias/flacroncv-staging', client: fake.client });
    await storage.put('exports/u/1.json', Buffer.from('{}'), 'application/json');
    expect((fake.commands[0] as PutObjectCommand).input).toMatchObject({ ServerSideEncryption: 'aws:kms', SSEKMSKeyId: 'alias/flacroncv-staging' });
  });

  it('deletes by prefixed key', async () => {
    const fake = fakeClient();
    const storage = new S3ObjectStorage({ bucket: 'b', region: 'us-east-1', prefix: 'staging', client: fake.client });
    await storage.delete('evidence/ws/c/item/obj');
    expect(fake.commands[0]).toBeInstanceOf(DeleteObjectCommand);
    expect((fake.commands[0] as DeleteObjectCommand).input).toEqual({ Bucket: 'b', Key: 'staging/evidence/ws/c/item/obj' });
  });

  it('turns S3 failures into provider_unavailable without the bucket, key, or account', async () => {
    const fake = fakeClient(true);
    const storage = new S3ObjectStorage({ bucket: 'flacroncv-staging-documents', region: 'us-east-1', client: fake.client });
    for (const run of [() => storage.put('a/b', Buffer.from('x'), 'text/plain'), () => storage.delete('a/b')]) {
      const error = await run().catch((caught: unknown) => caught);
      expect(error).toMatchObject({ code: 'provider_unavailable', details: { reason: 'storage_error' } });
      expect(JSON.stringify(error)).not.toMatch(/arn:|flacroncv-staging-documents|AccessDenied/);
    }
  });

  it('refuses unsafe keys before calling S3', async () => {
    const fake = fakeClient();
    const storage = new S3ObjectStorage({ bucket: 'b', region: 'us-east-1', client: fake.client });
    await expect(storage.put('../other-tenant/x', Buffer.from('x'), 'text/plain')).rejects.toMatchObject({ code: 'validation_error' });
    await expect(storage.delete('/abs')).rejects.toMatchObject({ code: 'validation_error' });
    expect(fake.commands).toHaveLength(0);
  });

  it('presigns a short GET with an attachment name, capped at one hour, and refuses an expired link', async () => {
    const client = new S3Client({ region: 'eu-west-3', credentials: FAKE_CREDENTIALS });
    const seen: number[] = [];
    const storage = new S3ObjectStorage({
      bucket: 'flacroncv-staging-documents',
      region: 'eu-west-3',
      prefix: 'staging',
      client,
      now: () => NOW,
      presign: (c, command, options) => {
        seen.push(options.expiresIn);
        return getSignedUrl(c, command, { ...options, signingDate: NOW });
      },
    });
    const url = new URL(
      await storage.signedUrl('evidence/ws/c/item/obj', new Date(NOW.getTime() + 5 * 60_000), {
        fileName: 'Résumé.pdf',
        contentType: 'application/pdf',
      }),
    );
    expect(url.host).toBe('flacroncv-staging-documents.s3.eu-west-3.amazonaws.com');
    expect(url.pathname).toBe('/staging/evidence/ws/c/item/obj');
    expect(url.searchParams.get('X-Amz-Expires')).toBe('300');
    expect(url.searchParams.get('response-content-disposition')).toBe(`attachment; filename="R_sum_.pdf"; filename*=UTF-8''R%C3%A9sum%C3%A9.pdf`);
    expect(url.searchParams.get('response-content-type')).toBe('application/pdf');
    expect(url.toString()).not.toContain(FAKE_CREDENTIALS.secretAccessKey);

    await storage.signedUrl('a/b', new Date(NOW.getTime() + 24 * 60 * 60_000));
    expect(seen[1]).toBe(MAX_SIGNED_URL_SECONDS);
    await expect(storage.signedUrl('a/b', new Date(NOW.getTime() - 1))).rejects.toMatchObject({ code: 'not_found' });
    expect(new GetObjectCommand({ Bucket: 'b', Key: 'k' })).toBeInstanceOf(GetObjectCommand);
  });

  it('needs a bucket and region from the environment but never static keys', () => {
    expect(() => S3ObjectStorage.fromEnv({})).toThrow('Missing required environment variable: OBJECT_STORAGE_BUCKET');
    expect(() => S3ObjectStorage.fromEnv({ OBJECT_STORAGE_BUCKET: 'b' })).toThrow('OBJECT_STORAGE_REGION');
    expect(S3ObjectStorage.fromEnv({ OBJECT_STORAGE_BUCKET: 'b', OBJECT_STORAGE_REGION: 'eu-west-3' })).toBeInstanceOf(S3ObjectStorage);
    expect(() => S3ObjectStorage.fromEnv({ OBJECT_STORAGE_BUCKET: 'b', AWS_REGION: 'us-east-1', OBJECT_STORAGE_PREFIX: '../x' })).toThrow();
  });
});
