import { ApiError } from '../../../../../packages/career-api-client/src/client';
import type { MaintenanceView } from '../../../../../packages/career-api-client/src/types';
import { careerErrorMessage } from '../career-view';

/**
 * Pure logic for the mobile career-maintenance screen (tested in maintenance.test.ts).
 * Same server rules as the website: titles are trimmed, non-empty and at most
 * 200 characters; a credential's expiry is a YYYY-MM-DD day; the server marks
 * credentials due within 90 days. A promotion goal is not a confirmed fact.
 * Entries cannot be edited or removed through the API.
 */

export const MAX_TITLE = 200;

export type TextCheck = { ok: true; value: string } | { ok: false; message: string };

export function checkTitle(raw: string, what: string): TextCheck {
  const value = raw.trim();
  if (value.length === 0) return { ok: false, message: `Enter a ${what}.` };
  if (value.length > MAX_TITLE) return { ok: false, message: `Keep the ${what} under ${MAX_TITLE} characters.` };
  return { ok: true, value };
}

/**
 * A real calendar day written YYYY-MM-DD (the format the server requires).
 * Rejects impossible days such as 2026-02-30 that the format alone allows.
 */
export function checkExpiryDate(raw: string): TextCheck {
  const value = raw.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return { ok: false, message: 'Write the expiry date as YYYY-MM-DD, for example 2027-03-31.' };
  const [y, m, d] = value.split('-').map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  if (y < 1900 || date.getUTCFullYear() !== y || date.getUTCMonth() !== m - 1 || date.getUTCDate() !== d) {
    return { ok: false, message: 'That date does not exist. Check the month and day.' };
  }
  return { ok: true, value };
}

export function checkCredential(name: string, expiresOn: string): { ok: true; name: string; expiresOn: string } | { ok: false; field: 'name' | 'expiresOn'; message: string } {
  const n = checkTitle(name, 'credential name');
  if (!n.ok) return { ok: false, field: 'name', message: n.message };
  const e = checkExpiryDate(expiresOn);
  if (!e.ok) return { ok: false, field: 'expiresOn', message: e.message };
  return { ok: true, name: n.value, expiresOn: e.value };
}

/** "31 March 2027" for a YYYY-MM-DD day, read as a calendar day (no time-zone shift). */
export function formatExpiry(day: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(day);
  if (!match) return day;
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
  return date.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });
}

export function dueCredentials(view: MaintenanceView | undefined): MaintenanceView['credentials'] {
  return (view?.credentials ?? []).filter((c) => c.due);
}

export function isEmpty(view: MaintenanceView | undefined): boolean {
  return !view || view.achievements.length + view.promotionGoals.length + view.credentials.length === 0;
}

/** Same refusals the website's maintenance page distinguishes. Never claims a save. */
export function maintenanceErrorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.code === 'validation_error') {
      if (error.body.field === 'expiresOn') return 'Write the expiry date as YYYY-MM-DD. Nothing was saved.';
      return 'Check the text you entered. Nothing was saved.';
    }
    if (error.code === 'plan_upgrade_required') return 'This starts on a higher career plan. Nothing was saved.';
    if (error.code === 'feature_unavailable') return 'Career maintenance is not open yet. Nothing was saved.';
  }
  return careerErrorMessage(error, 'That change was not saved. Please try again.');
}
