import { BillingError } from '../billing/errors';

/** How a short-lived download link presents the file. Values are already validated by the caller. */
export interface SignedUrlOptions {
  /** Shown as the download name (`Content-Disposition: attachment`). */
  fileName?: string;
  contentType?: string;
}

/**
 * Private files. Every object is private: callers check ownership in the
 * database first and only then ask for a short-lived link. Local disk and
 * memory serve development and tests; S3 serves hosted environments.
 */
export interface ObjectStorage {
  put(key: string, body: Buffer, contentType: string): Promise<void>;
  signedUrl(key: string, expiresAt: Date, options?: SignedUrlOptions): Promise<string>;
  delete(key: string): Promise<void>;
}

const KEY_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]*(\/[A-Za-z0-9][A-Za-z0-9._-]*)*$/;
const KEY_MAX = 512;

/**
 * Object keys are built by the server from ids, never from a user's file
 * name. This refuses anything else: empty, absolute, `..`, or unusual
 * characters.
 */
export function assertObjectKey(key: string): void {
  if (typeof key !== 'string' || key.length === 0 || key.length > KEY_MAX || !KEY_PATTERN.test(key) || key.split('/').includes('..')) {
    throw new BillingError('validation_error', { field: 'key', reason: 'invalid' });
  }
}

/** `attachment; filename="..."; filename*=UTF-8''...` with an ASCII fallback. */
export function attachmentDisposition(fileName: string | undefined): string {
  const name = (fileName ?? '').trim() || 'download';
  const ascii = name.replace(/[^A-Za-z0-9._ -]/g, '_').slice(0, 120) || 'download';
  return `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(name)}`;
}

/** In-process stand-in. The URL does not contain the file. */
export class MemoryObjectStorage implements ObjectStorage {
  readonly objects = new Map<string, Buffer>();
  readonly contentTypes = new Map<string, string>();

  async put(key: string, body: Buffer, contentType: string): Promise<void> {
    assertObjectKey(key);
    this.objects.set(key, Buffer.from(body));
    this.contentTypes.set(key, contentType);
  }

  async signedUrl(key: string, expiresAt: Date): Promise<string> {
    assertObjectKey(key);
    if (!this.objects.has(key)) throw new BillingError('not_found');
    return `https://exports.example.test/${encodeURIComponent(key)}?exp=${expiresAt.getTime()}`;
  }

  async delete(key: string): Promise<void> {
    assertObjectKey(key);
    this.objects.delete(key);
    this.contentTypes.delete(key);
  }
}

/** Binding when no storage is configured. Nothing is uploaded. */
export class UnconfiguredObjectStorage implements ObjectStorage {
  async put(): Promise<void> {
    throw new BillingError('provider_unavailable', { reason: 'storage_not_configured' });
  }

  async signedUrl(): Promise<string> {
    throw new BillingError('provider_unavailable', { reason: 'storage_not_configured' });
  }

  async delete(): Promise<void> {
    throw new BillingError('provider_unavailable', { reason: 'storage_not_configured' });
  }
}
