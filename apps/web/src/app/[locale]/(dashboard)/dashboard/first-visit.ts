import type { User } from '@flacroncv/shared-types';
import { toDate } from '@/lib/format-date';

const ONE_DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Whether the dashboard should greet with "Welcome" rather than "Welcome
 * back": a brand-new account was being told "Welcome back" on its very first
 * visit.
 *
 * The account's age decides when it is known (created within the last day).
 * Only when `createdAt` is missing or unreadable does the app tour stand in:
 * an account that has never seen the tour has not been here before. Not the
 * tour alone, because accounts older than the tour have no tour record either.
 */
export function isFirstVisit(user: Pick<User, 'createdAt' | 'preferences'> | null, now = Date.now()): boolean {
  if (!user) return false;
  const created = toDate(user.createdAt);
  if (created) return now - created.getTime() < ONE_DAY_MS;
  return !user.preferences?.appTour;
}
