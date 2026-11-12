import { ApiError } from '../../../../../packages/career-api-client/src/client';
import type { RecruitingSearch } from '../../../../../packages/career-api-client/src/types';
import { careerErrorMessage } from '../career-view';

/**
 * Recruiting opt-in (website: /career/recruiting). The candidate decides
 * whether employers may see that they opted in; the email is never shown.
 * Employer checkout is not for sale (commercial terms are not set), so the app
 * offers no purchase, price or checkout of any kind.
 */

export const RECRUITING_COPY = {
  title: 'Recruiting opt-in',
  help: 'Search shows only people who opted in, and it does not show their email.',
  consent: 'Employers may see that I opted in. My email stays private.',
  save: 'Save preference',
  saved: 'Preference saved.',
  closed: 'Employer access is not for sale. It stays closed until commercial terms are set.',
} as const;

/**
 * There is no "read my opt-in" endpoint. The opted-in list holds only
 * candidates who chose to be discoverable, so the current choice is whether
 * the signed-in user is on it. Nothing else from the list is shown.
 */
export function isDiscoverable(search: RecruitingSearch | undefined, uid: string | null): boolean | null {
  if (!search || !uid) return null;
  return search.items.some((item) => item.candidateAuthUserId === uid);
}

export function statusLine(current: boolean | null): string {
  if (current === null) return 'Your current choice could not be read. Saving sets it.';
  return current ? 'You are discoverable: employers may see that you opted in.' : 'You are not discoverable. Employers cannot see you.';
}

export function optInSaveError(error: unknown): string {
  if (error instanceof ApiError && error.code === 'not_purchasable') return RECRUITING_COPY.closed;
  return careerErrorMessage(error, 'That change was not saved. Try again.');
}
