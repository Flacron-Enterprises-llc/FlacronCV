import { BillingError } from '../billing/errors';

/**
 * Permitted evidence file types (spec: private uploads with permitted file
 * types and configurable size caps). The declared type must match the
 * file's own signature; this is a type check, not a malware scan.
 */
export const EVIDENCE_FILE_TYPES = {
  'application/pdf': { extension: 'pdf', matches: (b: Buffer) => b.subarray(0, 5).toString('latin1') === '%PDF-' },
  'image/png': { extension: 'png', matches: (b: Buffer) => b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) },
  'image/jpeg': { extension: 'jpg', matches: (b: Buffer) => b.length > 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': {
    extension: 'docx',
    matches: (b: Buffer) =>
      b.subarray(0, 4).equals(Buffer.from([0x50, 0x4b, 0x03, 0x04])) &&
      b.includes('[Content_Types].xml') &&
      b.includes('word/'),
  },
} as const;

export type EvidenceFileType = keyof typeof EVIDENCE_FILE_TYPES;
export const EVIDENCE_FILE_CONTENT_TYPES = Object.keys(EVIDENCE_FILE_TYPES) as EvidenceFileType[];

export const DEFAULT_EVIDENCE_UPLOAD_MAX_BYTES = 10 * 1024 * 1024;
const UPLOAD_MAX_CEILING = 25 * 1024 * 1024;

/** `EVIDENCE_UPLOAD_MAX_BYTES`, bounded to 1 KiB–25 MiB; 10 MiB when unset or invalid. */
export function evidenceUploadMaxBytes(env: NodeJS.ProcessEnv = process.env): number {
  const value = Number(env.EVIDENCE_UPLOAD_MAX_BYTES?.trim());
  if (!Number.isInteger(value) || value < 1024 || value > UPLOAD_MAX_CEILING) return DEFAULT_EVIDENCE_UPLOAD_MAX_BYTES;
  return value;
}

/** A download link for an evidence file lasts five minutes. */
export const EVIDENCE_LINK_TTL_MS = 5 * 60 * 1000;

export function isEvidenceFileType(value: string): value is EvidenceFileType {
  return Object.prototype.hasOwnProperty.call(EVIDENCE_FILE_TYPES, value);
}

/** `type/subtype; charset=...` → `type/subtype`, lower case. */
export function baseContentType(header: string | undefined): string {
  return (header ?? '').split(';')[0]?.trim().toLowerCase() ?? '';
}

/**
 * The display name only. Path parts, control characters, and quotes are
 * dropped; the extension is set from the verified type. Never used in a key.
 */
export function cleanFileName(raw: string | undefined, type: EvidenceFileType): string {
  const extension = EVIDENCE_FILE_TYPES[type].extension;
  const base = (raw ?? '')
    .split(/[\\/]/)
    .pop()!
    .replace(/[\u0000-\u001f\u007f"<>|*?:]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\.[A-Za-z0-9]{1,8}$/, '')
    .slice(0, 120)
    .trim();
  return `${base || 'evidence'}.${extension}`;
}

/** Validates type, size, and signature. Errors name the rule, not the file. */
export function verifyEvidenceFile(body: unknown, contentType: string, maxBytes: number): asserts body is Buffer {
  if (!isEvidenceFileType(contentType)) {
    throw new BillingError('validation_error', { field: 'file', reason: 'unsupported_type' });
  }
  if (!Buffer.isBuffer(body) || body.length === 0) {
    throw new BillingError('validation_error', { field: 'file', reason: 'empty' });
  }
  if (body.length > maxBytes) {
    throw new BillingError('validation_error', { field: 'file', reason: 'too_large', limit: maxBytes });
  }
  if (!EVIDENCE_FILE_TYPES[contentType].matches(body)) {
    throw new BillingError('validation_error', { field: 'file', reason: 'type_mismatch' });
  }
}
