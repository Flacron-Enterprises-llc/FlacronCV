import { BillingError } from '../billing/errors';
import { V1_FIREBASE_PROJECT_ID } from '../env/deploy-env';

/**
 * Removes the person's own Firebase sign-in when their V2 account is deleted.
 * It acts only on the account the fresh ID token belongs to, and only in
 * V2's own Firebase project; V1's project is refused before any call.
 */
export interface SignInDeleter {
  /** Resolves when the sign-in is gone, including when it was already gone. */
  deleteSignIn(idToken: string): Promise<void>;
}

type FetchLike = (url: string, init: { method: string; headers: Record<string, string>; body: string; signal?: AbortSignal }) => Promise<{
  ok: boolean;
  status: number;
  json(): Promise<unknown>;
}>;

/**
 * Identity Toolkit `accounts:delete` with the person's own ID token (the
 * client-side call Firebase's `deleteUser` makes), so the API needs no
 * Admin credential that could reach other users. `USER_NOT_FOUND` counts as
 * done, so a retry after a lost response succeeds.
 */
export class IdentityToolkitSignInDeleter implements SignInDeleter {
  constructor(
    private readonly projectId: string,
    private readonly webApiKey: string,
    private readonly baseUrl = 'https://identitytoolkit.googleapis.com',
    private readonly fetchFn: FetchLike = fetch as unknown as FetchLike,
    private readonly timeoutMs = 10_000,
  ) {
    if (!projectId || projectId === V1_FIREBASE_PROJECT_ID) throw new Error('IdentityToolkitSignInDeleter needs a V2 project id');
    if (!webApiKey) throw new Error('IdentityToolkitSignInDeleter needs FIREBASE_WEB_API_KEY');
  }

  async deleteSignIn(idToken: string): Promise<void> {
    let response: Awaited<ReturnType<FetchLike>>;
    try {
      response = await this.fetchFn(`${this.baseUrl}/v1/accounts:delete?key=${encodeURIComponent(this.webApiKey)}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ idToken }),
        signal: AbortSignal.timeout(this.timeoutMs),
      });
    } catch {
      throw new BillingError('provider_unavailable', { reason: 'sign_in_deletion_failed' });
    }
    if (response.ok) return;
    const message = await response.json().then(errorMessage, () => '');
    if (message === 'USER_NOT_FOUND') return;
    if (message === 'INVALID_ID_TOKEN' || message === 'TOKEN_EXPIRED' || message.startsWith('CREDENTIAL_TOO_OLD')) {
      throw new BillingError('validation_error', { field: 'idToken', reason: 'stale' });
    }
    throw new BillingError('provider_unavailable', { reason: 'sign_in_deletion_failed' });
  }
}

/** No sign-in deletion is configured: account deletion refuses before it changes anything. */
export class UnconfiguredSignInDeleter implements SignInDeleter {
  async deleteSignIn(): Promise<void> {
    throw new BillingError('provider_unavailable', { reason: 'sign_in_deletion_not_configured' });
  }
}

/** Records the tokens it was asked to delete. Tests only. */
export class RecordingSignInDeleter implements SignInDeleter {
  readonly deleted: string[] = [];
  failNext = 0;

  async deleteSignIn(idToken: string): Promise<void> {
    if (this.failNext > 0) {
      this.failNext -= 1;
      throw new BillingError('provider_unavailable', { reason: 'sign_in_deletion_failed' });
    }
    this.deleted.push(idToken);
  }
}

/**
 * V1 integration: the sign-in belongs to FlacronCV V1. V1's own account
 * deletion (`DELETE /users/me`) disables it and revokes its tokens, and V1
 * keeps the records its retention rules require. The career service erases
 * only career data and never deletes or disables the sign-in.
 */
export class RetainedByV1SignInDeleter implements SignInDeleter {
  async deleteSignIn(): Promise<void> {
    // Intentionally nothing: V1 owns the sign-in.
  }
}

/**
 * The deleter for this process. Inside V1 it is always
 * `RetainedByV1SignInDeleter`: V2's own-project deletion
 * (`IdentityToolkitSignInDeleter`, which still refuses V1's project) is not
 * used, so the career service cannot remove a V1 customer's login.
 */
export function createSignInDeleter(_env: NodeJS.ProcessEnv = process.env): SignInDeleter {
  return new RetainedByV1SignInDeleter();
}

function errorMessage(body: unknown): string {
  const error = typeof body === 'object' && body !== null ? (body as { error?: { message?: unknown } }).error : undefined;
  return typeof error?.message === 'string' ? error.message.split(' ')[0] : '';
}
