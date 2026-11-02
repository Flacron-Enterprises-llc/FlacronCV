import { isApiError } from '@flacroncv/career-api-client';

export type ProfileLoadFailure = 'permission' | 'signed-out' | 'unavailable';

/** Which of the screen states a failed profile load is. */
export function profileLoadFailure(error: unknown): ProfileLoadFailure {
  if (isApiError(error, 'permission_denied')) return 'permission';
  if (isApiError(error, 'unauthenticated') || (isApiError(error) && error.status === 401)) return 'signed-out';
  return 'unavailable';
}
