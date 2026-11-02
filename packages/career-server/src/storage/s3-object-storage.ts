import type * as ClientS3 from '@aws-sdk/client-s3';
import type { GetObjectCommand, S3Client } from '@aws-sdk/client-s3';
import type * as Presigner from '@aws-sdk/s3-request-presigner';
import { BillingError } from '../billing/errors';
import { assertObjectKey, attachmentDisposition, type ObjectStorage, type SignedUrlOptions } from './object-storage';

/**
 * The SDK is loaded on first use. Every app bundles this package, but only
 * the API ever builds an S3 store, so the worker needs neither the SDK
 * installed nor any storage access.
 */
let clientS3: typeof ClientS3 | null = null;
let presigner: typeof Presigner | null = null;
const s3 = (): typeof ClientS3 => (clientS3 ??= require('@aws-sdk/client-s3') as typeof ClientS3);
const signer = (): typeof Presigner => (presigner ??= require('@aws-sdk/s3-request-presigner') as typeof Presigner);

/** A presigned GET never outlives this, whatever the caller asks for. */
export const MAX_SIGNED_URL_SECONDS = 60 * 60;

export interface S3StorageOptions {
  bucket: string;
  region: string;
  /** Optional key prefix inside the bucket, for example `staging/`. */
  prefix?: string;
  /** Encrypt with this KMS key instead of S3-managed keys. */
  kmsKeyId?: string;
  /** Tests pass a fake. Production builds one with the default credential provider chain. */
  client?: Pick<S3Client, 'send'>;
  /** Tests may pass a presigner; the default signs locally and makes no request. */
  presign?: (client: S3Client, command: GetObjectCommand, options: { expiresIn: number }) => Promise<string>;
  now?: () => Date;
}

/**
 * Private objects in one S3 bucket. Credentials are never passed in: the AWS
 * SDK's default provider chain finds them (ECS task role, instance profile,
 * web identity, SSO or a named profile locally). Buckets must block public
 * access; nothing here sets an ACL or makes an object public.
 */
export class S3ObjectStorage implements ObjectStorage {
  private readonly client: Pick<S3Client, 'send'>;
  private readonly prefix: string;
  private readonly presign: NonNullable<S3StorageOptions['presign']>;
  private readonly now: () => Date;

  constructor(private readonly options: S3StorageOptions) {
    this.client = options.client ?? new (s3().S3Client)({ region: options.region });
    this.prefix = normalizePrefix(options.prefix);
    this.presign = options.presign ?? ((client, command, opts) => signer().getSignedUrl(client, command, opts));
    this.now = options.now ?? (() => new Date());
  }

  static fromEnv(env: NodeJS.ProcessEnv): S3ObjectStorage {
    const bucket = env.OBJECT_STORAGE_BUCKET?.trim() ?? '';
    if (!bucket) throw new Error('Missing required environment variable: OBJECT_STORAGE_BUCKET');
    const region = env.OBJECT_STORAGE_REGION?.trim() || env.AWS_REGION?.trim() || '';
    if (!region) throw new Error('Missing required environment variable: OBJECT_STORAGE_REGION (or AWS_REGION)');
    return new S3ObjectStorage({
      bucket,
      region,
      prefix: env.OBJECT_STORAGE_PREFIX,
      kmsKeyId: env.OBJECT_STORAGE_KMS_KEY_ID?.trim() || undefined,
    });
  }

  async put(key: string, body: Buffer, contentType: string): Promise<void> {
    assertObjectKey(key);
    await this.call(() =>
      this.client.send(
        new (s3().PutObjectCommand)({
          Bucket: this.options.bucket,
          Key: this.prefix + key,
          Body: body,
          ContentType: contentType,
          ContentLength: body.length,
          CacheControl: 'private, no-store',
          ...(this.options.kmsKeyId
            ? { ServerSideEncryption: 'aws:kms' as const, SSEKMSKeyId: this.options.kmsKeyId }
            : { ServerSideEncryption: 'AES256' as const }),
        }),
      ),
    );
  }

  async signedUrl(key: string, expiresAt: Date, options: SignedUrlOptions = {}): Promise<string> {
    assertObjectKey(key);
    const seconds = Math.ceil((expiresAt.getTime() - this.now().getTime()) / 1000);
    if (!Number.isFinite(seconds) || seconds <= 0) throw new BillingError('not_found');
    const command = new (s3().GetObjectCommand)({
      Bucket: this.options.bucket,
      Key: this.prefix + key,
      ResponseContentDisposition: attachmentDisposition(options.fileName),
      ...(options.contentType ? { ResponseContentType: options.contentType } : {}),
      ResponseCacheControl: 'private, no-store',
    });
    return this.call(() =>
      this.presign(this.client as S3Client, command, { expiresIn: Math.min(seconds, MAX_SIGNED_URL_SECONDS) }),
    );
  }

  /** S3 treats a missing key as deleted, so a repeat delete succeeds. */
  async delete(key: string): Promise<void> {
    assertObjectKey(key);
    await this.call(() => this.client.send(new (s3().DeleteObjectCommand)({ Bucket: this.options.bucket, Key: this.prefix + key })));
  }

  /** SDK errors can name the bucket, key, or account; none of that leaves the server. */
  private async call<T>(operation: () => Promise<T>): Promise<T> {
    try {
      return await operation();
    } catch (error) {
      if (error instanceof BillingError) throw error;
      throw new BillingError('provider_unavailable', { reason: 'storage_error' });
    }
  }
}

function normalizePrefix(value: string | undefined): string {
  const trimmed = (value ?? '').trim().replace(/^\/+|\/+$/g, '');
  if (!trimmed) return '';
  assertObjectKey(trimmed);
  return `${trimmed}/`;
}
