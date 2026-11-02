import { isApiError, type ApiClient } from './client';

export type CareerErasure = 'erased' | 'none' | 'deferred' | 'disabled';

/** The person must sign in again: the career service only erases after a recent sign-in. */
export class CareerErasureNeedsFreshSignIn extends Error {
  constructor() {
    super('career_erasure_needs_fresh_sign_in');
    this.name = 'CareerErasureNeedsFreshSignIn';
  }
}

/**
 * Shared by the V1 web app and the V1 mobile app.
 *
 * Runs before V1's own `DELETE /users/me`, so closing a V1 account also erases
 * its career data.
 *
 * - `disabled`: the career integration is off in this build; V1 behaves as before.
 * - `none`: the person never had career data.
 * - `erased`: career data is gone.
 * - `deferred`: the career service could not be reached or failed. V1's
 *   deletion goes ahead; the career service's closure sweep erases the data
 *   once it sees the V1 account closed (it re-checks every account daily).
 * - A stale sign-in throws `CareerErasureNeedsFreshSignIn`, and V1's deletion
 *   should stop so the person can sign in again and retry immediately.
 */
export async function eraseCareerDataBeforeAccountDeletion(
  api: ApiClient,
  enabled: boolean,
  freshIdToken: () => Promise<string>,
): Promise<CareerErasure> {
  if (!enabled) return 'disabled';
  try {
    await api.deleteAccount({ idToken: await freshIdToken(), confirm: 'DELETE' });
    return 'erased';
  } catch (error) {
    if (isApiError(error, 'not_found')) return 'none';
    if (isApiError(error, 'validation_error') && error.body.reason === 'stale') throw new CareerErasureNeedsFreshSignIn();
    return 'deferred';
  }
}
