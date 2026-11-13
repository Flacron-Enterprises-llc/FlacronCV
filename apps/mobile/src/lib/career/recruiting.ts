import { ApiError } from '../../../../../packages/career-api-client/src/client';
import type { RecruitingSearch } from '../../../../../packages/career-api-client/src/types';
import { t } from '../../i18n';
import { careerErrorMessage } from '../career-view';

/**
 * Recruiting opt-in (website: /career/recruiting). The candidate decides
 * whether employers may see that they opted in; the email is never shown.
 * Employer checkout is not for sale (commercial terms are not set), so the app
 * offers no purchase, price or checkout of any kind.
 *
 * Copy lives in `careerModes.recruiting`; the consent line is the website's
 * own wording (`career.scope.discoverable`) in every language. The getters
 * read the current language on each use.
 */

export const RECRUITING_COPY = {
  get title() {
    return t('careerModes.recruiting.title');
  },
  get help() {
    return t('careerModes.recruiting.help');
  },
  get consent() {
    return t('careerModes.recruiting.consent');
  },
  get save() {
    return t('careerModes.recruiting.save');
  },
  get saved() {
    return t('careerModes.recruiting.saved');
  },
  get closed() {
    return t('careerModes.recruiting.closed');
  },
};

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
  if (current === null) return t('careerModes.recruiting.status.unknown');
  return current ? t('careerModes.recruiting.status.on') : t('careerModes.recruiting.status.off');
}

export function optInSaveError(error: unknown): string {
  if (error instanceof ApiError && error.code === 'not_purchasable') return RECRUITING_COPY.closed;
  return careerErrorMessage(error, t('careerModes.recruiting.saveFailed'));
}
