import type { HumanServiceList } from '../../../../../packages/career-api-client/src/types';

/**
 * Human review services (website: /career/services). Read-only: booking stays
 * closed until commercial terms are set (the career API answers a booking with
 * 409 not_purchasable), so the app shows no booking, price or purchase action.
 */

export const SERVICES_COPY = {
  title: 'Human review',
  intro: 'A person would review selected material. This is not AI feedback.',
  closedLabel: 'BOOKING CLOSED',
  closedBody: 'Booking stays closed until commercial terms are set. Nothing can be booked or bought yet.',
  empty: 'No human review services are listed yet.',
} as const;

export interface ServiceRow {
  id: string;
  name: string;
  scope: string;
  note: string;
  bookable: false;
}

/** Every row is shown as not bookable, whatever the payload says, until booking opens server-side and in the app. */
export function serviceRows(list: HumanServiceList | undefined): ServiceRow[] {
  return (list?.items ?? []).map((item) => ({
    id: item.id,
    name: item.name,
    scope: item.scope,
    note: item.note || SERVICES_COPY.closedBody,
    bookable: false,
  }));
}
