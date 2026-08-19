/**
 * Explicit CORS Access-Control-Allow-Headers for the Nest API.
 *
 * Keep this list explicit — do NOT reflect arbitrary request headers.
 * Every non-safelisted header the web client may send must appear here;
 * `apps/web/src/lib/api-cors-headers.ts` + its parity test guard that.
 */
export const CORS_ALLOWED_HEADERS = [
  'Content-Type',
  'Authorization',
  'Accept-Language',
  'X-Device-Token',
  'Idempotency-Key',
] as const;

export type CorsAllowedHeader = (typeof CORS_ALLOWED_HEADERS)[number];
