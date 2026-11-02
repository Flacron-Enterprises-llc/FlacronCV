import {
  CareerErasureNeedsFreshSignIn,
  eraseCareerDataBeforeAccountDeletion,
  type CareerErasure,
} from '../../../../packages/career-api-client/src/account-deletion';
import type { ApiClient } from '../../../../packages/career-api-client/src/client';

export { CareerErasureNeedsFreshSignIn };

/**
 * In-app account deletion, same order as the website's settings page:
 * 1. erase career data (when the build has career tools), stopping only if the
 *    career service wants a fresh sign-in;
 * 2. V1 `DELETE /users/me`, which also cancels billing (V1 and career add-on)
 *    and soft-deletes the account;
 * 3. clear the local session.
 * If the career service is unreachable, V1 deletion still goes ahead and the
 * career service's closure sweep erases the rest.
 */
export async function deleteAccountEverywhere(deps: {
  careerEnabled: boolean;
  careerApi: ApiClient;
  freshIdToken: () => Promise<string>;
  deleteV1Account: () => Promise<unknown>;
  signOutLocally: () => Promise<void>;
}): Promise<CareerErasure> {
  const career = await eraseCareerDataBeforeAccountDeletion(deps.careerApi, deps.careerEnabled, deps.freshIdToken);
  await deps.deleteV1Account();
  try {
    await deps.signOutLocally();
  } catch {
    // The server already revoked the session; nothing left to keep.
  }
  return career;
}
