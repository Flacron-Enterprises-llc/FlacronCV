import { ApiError } from '../../../../../packages/career-api-client/src/client';
import type { MaintenanceView } from '../../../../../packages/career-api-client/src/types';
import { getLocale, hasKey, intlLocale, t } from '../../i18n';
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

/** Translation key part for each field noun the screen passes as `what`. */
const TITLE_KIND: Record<string, string> = {
  achievement: 'achievement',
  'promotion goal': 'promotionGoal',
  'credential name': 'credentialName',
};

function titleMessage(kind: 'empty' | 'tooLong', what: string): string {
  const field = TITLE_KIND[what];
  const key = `careerPlans.maintenance.check.${kind}.${field}`;
  if (field && hasKey(key)) return t(key, { max: MAX_TITLE });
  return kind === 'empty'
    ? t('careerPlans.maintenance.check.emptyOther', { what })
    : t('careerPlans.maintenance.check.tooLongOther', { what, max: MAX_TITLE });
}

export function checkTitle(raw: string, what: string): TextCheck {
  const value = raw.trim();
  if (value.length === 0) return { ok: false, message: titleMessage('empty', what) };
  if (value.length > MAX_TITLE) return { ok: false, message: titleMessage('tooLong', what) };
  return { ok: true, value };
}

/**
 * A real calendar day written YYYY-MM-DD (the format the server requires).
 * Rejects impossible days such as 2026-02-30 that the format alone allows.
 */
export function checkExpiryDate(raw: string): TextCheck {
  const value = raw.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return { ok: false, message: t('careerPlans.maintenance.check.dateFormat') };
  const [y, m, d] = value.split('-').map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  if (y < 1900 || date.getUTCFullYear() !== y || date.getUTCMonth() !== m - 1 || date.getUTCDate() !== d) {
    return { ok: false, message: t('careerPlans.maintenance.check.dateMissing') };
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

/** "31 March 2027" (English; other languages use their own format) for a YYYY-MM-DD day, read as a calendar day (no time-zone shift). */
export function formatExpiry(day: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(day);
  if (!match) return day;
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
  return date.toLocaleDateString(getLocale() === 'en' ? 'en-GB' : intlLocale(), { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });
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
      if (error.body.field === 'expiresOn') return t('careerPlans.maintenance.errors.dateFormat');
      return t('careerPlans.maintenance.errors.checkText');
    }
    if (error.code === 'plan_upgrade_required') return t('careerPlans.maintenance.errors.planUpgrade');
    if (error.code === 'feature_unavailable') return t('careerPlans.maintenance.errors.featureOff');
  }
  return careerErrorMessage(error, t('careerPlans.maintenance.errors.saveFailed'));
}
