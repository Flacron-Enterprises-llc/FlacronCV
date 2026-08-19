/**
 * Cross-origin request headers that `lib/api.ts` can attach to a browser fetch
 * against the API. CORS-safelisted headers alone do not trigger a preflight
 * failure mode; these do (or are always set with `Content-Type: application/json`).
 *
 * The API allowlist in `apps/api/src/cors-allowed-headers.ts` must include every
 * value here. The parity test fails the suite if a new header is added on the
 * client without extending that allowlist — the 2026-08-19 production outage
 * class.
 */
export const CLIENT_CROSS_ORIGIN_HEADERS = {
  contentType: 'Content-Type',
  authorization: 'Authorization',
  deviceToken: 'X-Device-Token',
  idempotencyKey: 'Idempotency-Key',
} as const;

export type ClientCrossOriginHeader =
  (typeof CLIENT_CROSS_ORIGIN_HEADERS)[keyof typeof CLIENT_CROSS_ORIGIN_HEADERS];

/** Flat list for parity checks (order does not matter). */
export const CLIENT_CROSS_ORIGIN_HEADER_LIST: readonly ClientCrossOriginHeader[] =
  Object.values(CLIENT_CROSS_ORIGIN_HEADERS);
