import { t } from '../../i18n';
import type { HumanServiceList } from '../../../../../packages/career-api-client/src/types';

/**
 * Human review services (website: /career/services). Read-only: booking stays
 * closed until commercial terms are set (the career API answers a booking with
 * 409 not_purchasable), so the app shows no booking, price or purchase action.
 */

/** Copy in `careerModes.services`; the getters read the current language on each use. */
export const SERVICES_COPY = {
  get title() {
    return t('careerModes.services.title');
  },
  get intro() {
    return t('careerModes.services.intro');
  },
  get closedLabel() {
    return t('careerModes.services.closedLabel');
  },
  get closedBody() {
    return t('careerModes.services.closedBody');
  },
  get empty() {
    return t('careerModes.services.empty');
  },
};

export interface ServiceRow {
  id: string;
  name: string;
  scope: string;
  note: string;
  bookable: false;
}

/** The one provider the career service ships is described in every language (website ServicesPanel). */
const KNOWN_PROVIDER = 'review-not-open';

/** Every row is shown as not bookable, whatever the payload says, until booking opens server-side and in the app. */
export function serviceRows(list: HumanServiceList | undefined): ServiceRow[] {
  return (list?.items ?? []).map((item) => {
    const known = item.id === KNOWN_PROVIDER;
    return {
      id: item.id,
      name: known ? t('careerBusiness.scope.servicesReviewName') : item.name,
      scope: known ? t('careerBusiness.scope.servicesReviewScope') : item.scope,
      note: known ? t('careerBusiness.scope.servicesNote') : item.note || SERVICES_COPY.closedBody,
      bookable: false,
    };
  });
}
