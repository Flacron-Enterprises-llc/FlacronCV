import { createHmac, randomBytes, timingSafeEqual } from 'crypto';
import { mkdir, readFile, unlink, writeFile } from 'fs/promises';
import { join } from 'path';
import { BillingError } from '../billing/errors';
import { MemoryObjectStorage, UnconfiguredObjectStorage, assertObjectKey, type ObjectStorage, type SignedUrlOptions } from './object-storage';
import { S3ObjectStorage } from './s3-object-storage';

const TOKEN_TTL_MS = 60 * 60 * 1000;

export interface LocalSignedFile {
  body: Buffer;
  fileName: string;
  contentType: string;
}

/**
 * Private files on the local disk. Used only for development and tests.
 * The signed URL is an HMAC token, not a public path, and does not contain
 * the file bytes. The download name and type are signed with it.
 */
export class LocalDiskObjectStorage implements ObjectStorage {
  private readonly secret: string;
  private readonly origin: string;

  constructor(
    private readonly directory: string,
    secret?: string,
    origin?: string,
  ) {
    this.secret = secret ?? randomBytes(32).toString('hex');
    this.origin = (origin ?? 'http://127.0.0.1:4101').replace(/\/+$/, '');
  }

  async put(key: string, body: Buffer, _contentType?: string): Promise<void> {
    assertObjectKey(key);
    await mkdir(this.directory, { recursive: true });
    await writeFile(join(this.directory, encodeURIComponent(key)), body);
  }

  async signedUrl(key: string, expiresAt: Date, options: SignedUrlOptions = {}): Promise<string> {
    assertObjectKey(key);
    const exp = expiresAt.getTime();
    const name = options.fileName ?? '';
    const type = options.contentType ?? '';
    const sig = this.sign(key, exp, name, type);
    const query = new URLSearchParams({ key, exp: String(exp), name, type, sig });
    return `${this.origin}/api/career/v1/local-exports?${query.toString()}`;
  }

  async openSigned(key: string, exp: number, sig: string, name = '', type = ''): Promise<LocalSignedFile> {
    if (!Number.isFinite(exp) || Date.now() > exp) throw new BillingError('not_found');
    try {
      assertObjectKey(key);
    } catch {
      throw new BillingError('not_found');
    }
    const expected = this.sign(key, exp, name, type);
    const left = Buffer.from(expected, 'utf8');
    const right = Buffer.from(sig ?? '', 'utf8');
    if (left.length !== right.length || !timingSafeEqual(left, right)) throw new BillingError('not_found');
    try {
      const body = await readFile(join(this.directory, encodeURIComponent(key)));
      return { body, fileName: name, contentType: type || 'application/octet-stream' };
    } catch {
      throw new BillingError('not_found');
    }
  }

  async delete(key: string): Promise<void> {
    assertObjectKey(key);
    try {
      await unlink(join(this.directory, encodeURIComponent(key)));
    } catch {
      return;
    }
  }

  private sign(key: string, exp: number, name: string, type: string): string {
    return createHmac('sha256', this.secret).update(JSON.stringify([key, exp, name, type])).digest('hex');
  }
}

/**
 * `OBJECT_STORAGE`: `s3` (hosted), `local` (development disk), `memory`
 * (tests). Anything else refuses every file operation.
 */
export function createObjectStorage(env: NodeJS.ProcessEnv = process.env): ObjectStorage {
  const mode = env.OBJECT_STORAGE?.trim().toLowerCase() ?? '';
  if (mode === 'memory') return new MemoryObjectStorage();
  if (mode === 's3') return S3ObjectStorage.fromEnv(env);
  if (mode === 'local') {
    const directory = env.OBJECT_STORAGE_DIR?.trim() || join(process.cwd(), '.data', 'exports');
    const origin = (env.NEXT_PUBLIC_API_URL?.trim() || `http://127.0.0.1:${env.PORT?.trim() || '4101'}`).replace(/\/+$/, '');
    return new LocalDiskObjectStorage(directory, env.OBJECT_STORAGE_SECRET?.trim() || 'local-dev-export', origin);
  }
  return new UnconfiguredObjectStorage();
}

export function exportLinkTtlMs(): number {
  return TOKEN_TTL_MS;
}
