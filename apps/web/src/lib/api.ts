import { auth } from './firebase';
import { getOrCreateDeviceToken } from './device-token';
import { track } from './analytics';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000/api/v1';

// A hung request must not wedge the UI (e.g. the auth loading state) forever.
// Ordinary CRUD is quick, so it keeps a tight budget — but AI-backed endpoints
// call an LLM and legitimately take much longer. Giving those the default 15s
// cut generation off mid-flight, which is the "resume import stuck / too slow"
// symptom: the browser aborted before the model finished, so the user retried
// into the same wall.
//
// This 60s must stay ABOVE the server's own AI budget (OpenAIProvider: one 40s
// attempt, no retry) so the server always fails first with a real, explainable
// error instead of the browser aborting a request that is still in flight.
const REQUEST_TIMEOUT_MS = 15000;
const AI_TIMEOUT_MS = 60000;

/**
 * Longer budget for LLM-backed endpoints.
 *
 * Note this must cover routes that call the model *indirectly*, not just the
 * `/ai/*` namespace: creating a cover letter with `generateWithAI` runs a full
 * generation inside `POST /cover-letters`, and importing a resume runs one
 * inside `POST /cvs/import`. Those callers also pass an explicit `timeoutMs`,
 * but matching here means a missed override degrades to "slow" rather than to a
 * spurious timeout.
 */
function timeoutForEndpoint(endpoint: string, override?: number): number {
  if (typeof override === 'number') return override;
  if (
    endpoint.includes('/ai/') ||
    endpoint.startsWith('/cvs/import') ||
    endpoint.startsWith('/cover-letters/generate')
  ) {
    return AI_TIMEOUT_MS;
  }
  return REQUEST_TIMEOUT_MS;
}

export type ApiErrorKind = 'timeout' | 'offline' | 'network' | 'http';

/**
 * Error carrying enough context for the UI to decide what to offer the user.
 * It extends Error, so every existing `(e as Error).message` call site keeps
 * working unchanged; `retryable` lets a caller show a Retry action only when
 * retrying could actually help.
 */
export class ApiError extends Error {
  readonly kind: ApiErrorKind;
  readonly status?: number;
  readonly retryable: boolean;
  readonly code?: string;

  constructor(
    message: string,
    opts: { kind: ApiErrorKind; status?: number; retryable?: boolean; code?: string },
  ) {
    super(message);
    this.name = 'ApiError';
    this.kind = opts.kind;
    this.status = opts.status;
    this.retryable = opts.retryable ?? false;
    this.code = opts.code;
  }
}

async function getAuthHeaders(): Promise<Record<string, string>> {
  if (!auth) return {};
  const user = auth.currentUser;
  if (!user) return {};

  try {
    const token = await user.getIdToken();
    return { Authorization: `Bearer ${token}` };
  } catch {
    return {};
  }
}

function getDeviceHeaders(): Record<string, string> {
  const token = getOrCreateDeviceToken();
  return token ? { 'X-Device-Token': token } : {};
}

const inFlightIdempotency = new Map<string, string>();

function isAiGeneratePath(endpoint: string, method?: string): boolean {
  if (method && method !== 'POST') return false;
  return endpoint.includes('/ai/') || /\/cover-letters\/[^/]+\/ai\/generate/.test(endpoint);
}

function idempotencyHeaders(endpoint: string, method: string | undefined, body: string | undefined): Record<string, string> {
  if (!isAiGeneratePath(endpoint, method ?? 'POST')) return {};
  const fingerprint = `${endpoint}:${body ?? ''}`;
  const existing = inFlightIdempotency.get(fingerprint);
  if (existing) return { 'Idempotency-Key': existing };
  const key =
    typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  inFlightIdempotency.set(fingerprint, key);
  return { 'Idempotency-Key': key };
}

function trackAbuseCode(code: string | undefined, status: number): void {
  if (!code) {
    if (status === 429) track('abuse_rate_limited', { reason: 'http_429' });
    return;
  }
  if (code === 'ABUSE_GRANT_BLOCKED') track('abuse_grant_blocked', { reason: code });
  else if (code === 'ABUSE_STEP_UP') track('abuse_step_up', { reason: code });
  else if (code === 'ABUSE_EMAIL_UNVERIFIED') track('abuse_email_unverified', { reason: code });
  else if (code === 'ABUSE_NETWORK_CREATE_CAP' || code === 'ABUSE_UID_RATE_LIMIT') {
    track('abuse_rate_limited', { reason: code });
  }
}

async function request<T>(
  endpoint: string,
  options: RequestInit & { timeoutMs?: number } = {},
): Promise<T> {
  const { timeoutMs, ...init } = options;
  const authHeaders = await getAuthHeaders();
  const deviceHeaders = getDeviceHeaders();
  const method = (init.method as string | undefined) ?? 'GET';
  const bodyText = typeof init.body === 'string' ? init.body : undefined;
  const idemHeaders = idempotencyHeaders(endpoint, method, bodyText);
  const fingerprint = `${endpoint}:${bodyText ?? ''}`;

  let response: Response;
  try {
    response = await fetch(`${API_URL}${endpoint}`, {
      signal: init.signal ?? AbortSignal.timeout(timeoutForEndpoint(endpoint, timeoutMs)),
      ...init,
      headers: {
        'Content-Type': 'application/json',
        ...authHeaders,
        ...deviceHeaders,
        ...idemHeaders,
        ...init.headers,
      },
    });
  } catch (error) {
    const name = (error as Error)?.name;
    if (name === 'TimeoutError' || name === 'AbortError') {
      // Distinguish the two failure modes the user can actually act on: the
      // request was still running and we gave up (retry may well succeed), vs.
      // the device is offline (retrying now cannot succeed). A bare "the server
      // did not respond" told the user neither.
      // `typeof` guard, not `navigator?.` — optional chaining still throws a
      // ReferenceError on an undeclared global during SSR.
      const offline = typeof navigator !== 'undefined' && navigator.onLine === false;
      throw new ApiError(
        offline
          ? 'You appear to be offline. Your work is saved — reconnect and try again.'
          : 'This is taking longer than expected. Your work is saved — please try again.',
        { kind: offline ? 'offline' : 'timeout', retryable: true },
      );
    }
    // fetch() rejects with a TypeError for DNS/CORS/connection-refused.
    if (name === 'TypeError') {
      throw new ApiError("Couldn't reach the server. Please check your connection and try again.", {
        kind: 'network',
        retryable: true,
      });
    }
    throw error;
  } finally {
    inFlightIdempotency.delete(fingerprint);
  }

  if (!response.ok) {
    const body = (await response.json().catch(() => ({}))) as { message?: string; code?: string };
    const message = typeof body.message === 'string' ? body.message : `Request failed (HTTP ${response.status})`;
    trackAbuseCode(body.code, response.status);
    throw new ApiError(message, {
      kind: 'http',
      status: response.status,
      retryable: response.status >= 500 || response.status === 429,
      code: typeof body.code === 'string' ? body.code : undefined,
    });
  }

  if (response.status === 204 || response.headers.get('content-length') === '0') {
    return null as T;
  }

  const data = await response.json();
  return data.data !== undefined ? data.data : data;
}

export const api = {
  get: <T>(endpoint: string, opts?: { timeoutMs?: number }) =>
    request<T>(endpoint, { timeoutMs: opts?.timeoutMs }),

  post: <T>(endpoint: string, body?: unknown, opts?: { timeoutMs?: number }) =>
    request<T>(endpoint, {
      method: 'POST',
      body: body ? JSON.stringify(body) : undefined,
      timeoutMs: opts?.timeoutMs,
    }),

  put: <T>(endpoint: string, body?: unknown, opts?: { timeoutMs?: number }) =>
    request<T>(endpoint, {
      method: 'PUT',
      body: body ? JSON.stringify(body) : undefined,
      timeoutMs: opts?.timeoutMs,
    }),

  patch: <T>(endpoint: string, body?: unknown, opts?: { timeoutMs?: number }) =>
    request<T>(endpoint, {
      method: 'PATCH',
      body: body ? JSON.stringify(body) : undefined,
      timeoutMs: opts?.timeoutMs,
    }),

  delete: <T>(endpoint: string, opts?: { timeoutMs?: number }) =>
    request<T>(endpoint, { method: 'DELETE', timeoutMs: opts?.timeoutMs }),
};
