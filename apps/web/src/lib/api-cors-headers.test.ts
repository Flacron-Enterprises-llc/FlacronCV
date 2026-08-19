import { readFileSync } from 'fs';
import path from 'path';
import { describe, it, expect } from 'vitest';
import {
  CLIENT_CROSS_ORIGIN_HEADER_LIST,
  CLIENT_CROSS_ORIGIN_HEADERS,
} from './api-cors-headers';

/**
 * Parity: every header `lib/api.ts` can send on a cross-origin fetch must be
 * on the API CORS allowlist. The 2026-08-19 outage shipped X-Device-Token on
 * the client while allowedHeaders still listed only Content-Type / Authorization
 * / Accept-Language — preflight 204 on Origin alone, every real browser call blocked.
 *
 * Required names are derived from {@link CLIENT_CROSS_ORIGIN_HEADER_LIST}, which
 * is what `api.ts` uses when attaching headers. Adding a new client header
 * without extending `apps/api/src/cors-allowed-headers.ts` fails this suite.
 */
function readApiCorsAllowlist(): string[] {
  const allowlistPath = path.resolve(
    __dirname,
    '../../../api/src/cors-allowed-headers.ts',
  );
  const source = readFileSync(allowlistPath, 'utf8');
  const match = source.match(
    /export const CORS_ALLOWED_HEADERS\s*=\s*\[([\s\S]*?)\]\s*as const/,
  );
  if (!match) {
    throw new Error(`Could not parse CORS_ALLOWED_HEADERS from ${allowlistPath}`);
  }
  return [...match[1].matchAll(/'([^']+)'/g)].map((m) => m[1]);
}

describe('CORS header parity (client ↔ API allowlist)', () => {
  it('exports the four headers api.ts can attach', () => {
    expect(CLIENT_CROSS_ORIGIN_HEADER_LIST).toEqual(
      expect.arrayContaining([
        CLIENT_CROSS_ORIGIN_HEADERS.contentType,
        CLIENT_CROSS_ORIGIN_HEADERS.authorization,
        CLIENT_CROSS_ORIGIN_HEADERS.deviceToken,
        CLIENT_CROSS_ORIGIN_HEADERS.idempotencyKey,
      ]),
    );
    expect(CLIENT_CROSS_ORIGIN_HEADER_LIST).toHaveLength(4);
  });

  it('API CORS allowlist includes every header the web client can send', () => {
    const allowed = readApiCorsAllowlist().map((h) => h.toLowerCase());
    const missing = CLIENT_CROSS_ORIGIN_HEADER_LIST.filter(
      (h) => !allowed.includes(h.toLowerCase()),
    );
    expect(missing).toEqual([]);
  });

  it('api.ts does not hardcode cross-origin header names outside the catalog', () => {
    // Force new headers through CLIENT_CROSS_ORIGIN_HEADERS so the list above
    // stays the single source for what the client can send.
    const apiSource = readFileSync(path.join(__dirname, 'api.ts'), 'utf8');
    const forbiddenLiterals = [
      "'X-Device-Token'",
      '"X-Device-Token"',
      "'Idempotency-Key'",
      '"Idempotency-Key"',
      "'Authorization'",
      '"Authorization"',
      "'Content-Type'",
      '"Content-Type"',
    ];
    for (const lit of forbiddenLiterals) {
      expect(apiSource.includes(lit), `api.ts must not contain ${lit} — use CLIENT_CROSS_ORIGIN_HEADERS`).toBe(
        false,
      );
    }
    expect(apiSource).toContain('CLIENT_CROSS_ORIGIN_HEADERS');
  });
});
