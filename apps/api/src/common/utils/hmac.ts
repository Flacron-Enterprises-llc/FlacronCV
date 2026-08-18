import { createHmac } from 'crypto';

/**
 * HMAC-SHA256 hex digest of `value` with `secret`.
 *
 * Returns null when the secret is missing or blank so callers can fail SOFT —
 * a missing env var must never block a real signup. Never log `value` or
 * `secret`; the digest is the only thing that may be stored or printed.
 */
export function hmacHex(secret: string | undefined | null, value: string): string | null {
  const key = secret?.trim();
  if (!key) return null;
  if (!value) return null;
  return createHmac('sha256', key).update(value, 'utf8').digest('hex');
}

export function isHmacSecretConfigured(secret: string | undefined | null): boolean {
  return Boolean(secret?.trim());
}
