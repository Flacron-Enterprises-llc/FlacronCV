import type { CareerReminder, ReminderList } from '../../../../../packages/career-api-client/src/types';
import { hasKey, intlLocale, t } from '../../i18n';
import { formatListingDay } from './opportunity-search';

/**
 * Career reminders (website: the alert centre's RemindersCard). Reminders
 * never use alert items. Tracker dates are pushed first with
 * `POST /reminders/tracker-sync` (best effort), then the list is read.
 */

/** "Listing deadline 3 Dec 2026", "Follow-up due …": the kind always names what the date is. */
export function reminderLine(reminder: Pick<CareerReminder, 'kind' | 'dueDate'>, locale: string = intlLocale()): string {
  const key = `careerAlerts.centre.reminder_${reminder.kind}`;
  const date = formatListingDay(reminder.dueDate, locale);
  return hasKey(key) ? t(key, { date }) : date;
}

/** Website reminder links → app routes. Anything the app has no screen for opens nothing. */
export function reminderRoute(link: string | null): string | null {
  if (!link || !link.startsWith('/')) return null;
  const path = link.split(/[?#]/)[0].replace(/\/+$/, '');
  if (path === '/jobs') return '/(dashboard)/jobs';
  const job = /^\/jobs\/([A-Za-z0-9_-]+)$/.exec(path);
  if (job) return `/(dashboard)/jobs/${job[1]}`;
  const listing = /^\/career\/opportunities\/([A-Za-z0-9_-]+)$/.exec(path);
  if (listing) return `/(dashboard)/career/opportunities/${listing[1]}`;
  const known = ['/career/opportunities', '/career/alerts', '/career/maintenance', '/career/profile', '/career/learning', '/career/interviews'];
  if (known.includes(path)) return `/(dashboard)${path}`;
  return null;
}

/** After marking one read: same list with that entry read and the unread count lowered once. */
export function markedRead(list: ReminderList, reminderId: string): ReminderList {
  const target = list.upcoming.find((entry) => entry.id === reminderId);
  return {
    ...list,
    unread: Math.max(0, list.unread - (target && !target.read ? 1 : 0)),
    upcoming: list.upcoming.map((entry) => (entry.id === reminderId ? { ...entry, read: true } : entry)),
  };
}
