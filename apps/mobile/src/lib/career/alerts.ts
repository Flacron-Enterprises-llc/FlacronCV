import { ApiError } from '../../../../../packages/career-api-client/src/client';
import type {
  AlertItem,
  AlertList,
  AlertLocation,
  AlertSettings,
  SavedSearch,
} from '../../../../../packages/career-api-client/src/types';
import { hasKey, t } from '../../i18n';
import { careerErrorMessage, formatDay, labelMap } from '../career-view';

/**
 * Pure view logic for the mobile Alerts screen (tested in alerts.test.ts).
 * Copy lives in the `careerAlerts` namespace (the website's `career.alerts` strings). Delivery by email, push
 * or Telegram is not connected in this environment: alerts are listed in the
 * app only, and the copy says so. The server checks every limit; nothing here
 * grants anything.
 */

export function channelNotConnected(): string {
  return t('careerAlerts.channelNotConnected');
}

export function notAScore(): string {
  return t('careerAlerts.notAScore');
}

export function reasonText(code: AlertItem['reason']['code']): string {
  if (code === 'material_update') return t('careerAlerts.reason.material_update');
  if (code === 'followed_company') return t('careerAlerts.reason.followed_company');
  return t('careerAlerts.reason.saved_search');
}

export function fitText(fit: AlertItem['reason']['fit']): string | null {
  switch (fit) {
    case 'blocked':
      return t('careerAlerts.fit.blocked');
    case 'none':
      return t('careerAlerts.fit.none');
    case 'partial':
      return t('careerAlerts.fit.partial');
    case 'strong':
      return t('careerAlerts.fit.strong');
    default:
      return null;
  }
}

export function fitTone(fit: AlertItem['reason']['fit']): 'default' | 'warning' | 'success' | 'brand' {
  if (fit === 'strong') return 'success';
  if (fit === 'partial') return 'brand';
  if (fit === 'blocked') return 'warning';
  return 'default';
}

/** Alert items left this period (included + packs). */
export function alertBalance(list: Pick<AlertList, 'alertItem'>): { remaining: number; renews: string | null } {
  return {
    remaining: Math.max(0, list.alertItem.includedRemaining) + Math.max(0, list.alertItem.packRemaining),
    renews: formatDay(list.alertItem.renewalDate),
  };
}

const DIGEST_LABEL = labelMap('careerAlerts.digest', ['weekly', 'daily', 'immediate'] as const);
const SCHEDULE_LABEL = labelMap('careerAlerts.schedule', ['weekly', 'daily', 'every_6_hours', 'hourly'] as const);

/** Digest choices; `label` is read in the current language. */
export const DIGEST_OPTIONS: { value: AlertSettings['digest']; label: string }[] = (['weekly', 'daily', 'immediate'] as const).map((value) => ({
  value,
  get label() {
    return DIGEST_LABEL[value];
  },
}));

/** Schedule choices; `label` is read in the current language. */
export const SCHEDULE_OPTIONS: { value: SavedSearch['schedule']; label: string }[] = (['weekly', 'daily', 'every_6_hours', 'hourly'] as const).map(
  (value) => ({
    value,
    get label() {
      return SCHEDULE_LABEL[value];
    },
  }),
);

export function scheduleLabel(schedule: SavedSearch['schedule'] | string): string {
  return SCHEDULE_OPTIONS.find((o) => o.value === schedule)?.label ?? schedule;
}

/** The schedule inside a sentence ("up to daily"). */
function scheduleInSentence(schedule: string): string {
  return hasKey(`careerAlerts.scheduleLower.${schedule}`) ? t(`careerAlerts.scheduleLower.${schedule}`) : schedule.toLowerCase();
}

const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;

/** English value of {@link quietInvalid} (kept for tests and comparisons). */
export const QUIET_INVALID = 'Quiet hours need a start and an end (HH:MM, UTC), and they cannot be the same time.';

export function quietInvalid(): string {
  return t('careerAlerts.quietInvalid');
}

/** Same rule as the server: both empty, or both HH:MM (24h) and different. */
export function validateQuietHours(
  startText: string,
  endText: string,
): { ok: true; start: string | null; end: string | null } | { ok: false; message: string } {
  const start = startText.trim();
  const end = endText.trim();
  if (start.length === 0 && end.length === 0) return { ok: true, start: null, end: null };
  if (!HHMM.test(start) || !HHMM.test(end) || start === end) return { ok: false, message: quietInvalid() };
  return { ok: true, start, end };
}

/** Editable copy of the alert settings; quiet hours as text fields. */
export interface SettingsDraft {
  email: boolean;
  push: boolean;
  telegram: boolean;
  digest: AlertSettings['digest'];
  quietStart: string;
  quietEnd: string;
  paused: boolean;
}

export function settingsDraft(settings: AlertSettings): SettingsDraft {
  return {
    email: settings.email,
    push: settings.push,
    telegram: settings.telegram,
    digest: settings.digest,
    quietStart: settings.quietStart ?? '',
    quietEnd: settings.quietEnd ?? '',
    paused: settings.paused,
  };
}

export function settingsDirty(draft: SettingsDraft, settings: AlertSettings): boolean {
  const saved = settingsDraft(settings);
  return (Object.keys(saved) as (keyof SettingsDraft)[]).some((key) =>
    typeof saved[key] === 'string' ? String(draft[key]).trim() !== saved[key] : draft[key] !== saved[key],
  );
}

/** The full patch the website sends on "Save alert settings", or the quiet-hours message. */
export function settingsPatch(draft: SettingsDraft): { ok: true; patch: AlertSettings } | { ok: false; message: string } {
  const quiet = validateQuietHours(draft.quietStart, draft.quietEnd);
  if (!quiet.ok) return quiet;
  return {
    ok: true,
    patch: {
      email: draft.email,
      push: draft.push,
      telegram: draft.telegram,
      digest: draft.digest,
      quietStart: quiet.start,
      quietEnd: quiet.end,
      paused: draft.paused,
    },
  };
}

export function anySearch(): string {
  return t('careerAlerts.anySearch');
}

/** Title and detail line for a saved search. */
export function searchSummary(search: SavedSearch, locations: AlertLocation[] | undefined): { title: string; detail: string } {
  const title = search.q?.trim() || search.category?.trim() || anySearch();
  const parts: string[] = [scheduleLabel(search.schedule)];
  if (search.locationProfileId) {
    const place = locations?.find((l) => l.id === search.locationProfileId);
    parts.push(place ? locationLabel(place) : t('careerAlerts.savedLocation'));
  }
  return { title, detail: parts.join(' · ') };
}

export function locationLabel(location: Pick<AlertLocation, 'place' | 'radiusMiles'>): string {
  return location.radiusMiles > 0 ? t('careerAlerts.locationWithin', { place: location.place, miles: location.radiusMiles }) : location.place;
}

export const RADIUS_MAX = 10000;

/** Whole miles, 0–10000 (the API's bounds; the plan limit is checked by the server). */
export function parseRadius(text: string): { ok: true; miles: number } | { ok: false; message: string } {
  const trimmed = text.trim();
  if (!/^\d{1,5}$/.test(trimmed)) return { ok: false, message: t('careerAlerts.radius.format') };
  const miles = Number(trimmed);
  if (miles > RADIUS_MAX) return { ok: false, message: t('careerAlerts.radius.max', { max: RADIUS_MAX }) };
  return { ok: true, miles };
}

/** Optional careers-page link for a followed company: empty, or an http(s) address. */
export function parseSourceUrl(text: string): { ok: true; url: string | undefined } | { ok: false; message: string } {
  const trimmed = text.trim();
  if (trimmed.length === 0) return { ok: true, url: undefined };
  if (trimmed.length > 2000 || !/^https?:\/\/[^\s/]+\.[^\s]+$/i.test(trimmed)) {
    return { ok: false, message: t('careerAlerts.sourceUrlInvalid') };
  }
  return { ok: true, url: trimmed };
}

export type AlertAction = 'settings' | 'search' | 'location' | 'company' | 'load';

/** Messages for alert API failures, with the website's wording where it has one. Never claims a write happened. */
export function alertErrorMessage(error: unknown, action: AlertAction): string {
  if (error instanceof ApiError) {
    const field = typeof error.body?.field === 'string' ? error.body.field : undefined;
    const reason = typeof error.body?.reason === 'string' ? error.body.reason : undefined;
    const limit = error.body?.limit;
    if (error.code === 'plan_upgrade_required') {
      return action === 'settings'
        ? t('careerAlerts.errors.settingsPlan')
        : t('careerAlerts.errors.plan');
    }
    if (error.code === 'capacity_exceeded') {
      if (action === 'search') return t('careerAlerts.errors.capacitySearch');
      if (action === 'location') return t('careerAlerts.errors.capacityLocation');
      if (action === 'company') return t('careerAlerts.errors.capacityCompany');
    }
    if (error.code === 'validation_error') {
      if (field === 'quietHours') return quietInvalid();
      if (field === 'schedule' && reason === 'above_plan') {
        return typeof limit === 'string'
          ? t('careerAlerts.errors.scheduleAboveLimit', { limit: scheduleInSentence(limit) })
          : t('careerAlerts.errors.scheduleAbove');
      }
      if (field === 'radiusMiles' && reason === 'above_plan') {
        return typeof limit === 'number' ? t('careerAlerts.errors.radiusAboveLimit', { limit }) : t('careerAlerts.errors.radiusAbove');
      }
      if (field === 'radiusMiles') return t('careerAlerts.radius.format');
      if (field === 'q') return t('careerAlerts.errors.q');
      if (field === 'place') return t('careerAlerts.errors.place');
      if (field === 'name') return t('careerAlerts.errors.name');
      if (field === 'digest') return t('careerAlerts.errors.digest');
      return t('careerAlerts.errors.check');
    }
  }
  const fallback: Record<AlertAction, string> = labelMap('careerAlerts.fallback', ['settings', 'search', 'location', 'company', 'load'] as const);
  return careerErrorMessage(error, fallback[action]);
}

/** The operator switch for a section is off (`/access` features). Missing means not reported, i.e. on. */
export function featureOff(features: Record<string, boolean> | undefined, key: string): boolean {
  return features?.[key] === false;
}
