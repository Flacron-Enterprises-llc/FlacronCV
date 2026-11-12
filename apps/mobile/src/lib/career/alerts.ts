import { ApiError } from '../../../../../packages/career-api-client/src/client';
import type {
  AlertItem,
  AlertList,
  AlertLocation,
  AlertSettings,
  SavedSearch,
} from '../../../../../packages/career-api-client/src/types';
import { careerErrorMessage, formatDay } from '../career-view';

/**
 * Pure view logic for the mobile Alerts screen (tested in alerts.test.ts).
 * Copy follows the website's `career.alerts` strings. Delivery by email, push
 * or Telegram is not connected in this environment: alerts are listed in the
 * app only, and the copy says so. The server checks every limit; nothing here
 * grants anything.
 */

export const CHANNEL_NOT_CONNECTED = 'Not connected yet: these alerts are shown here in the app only.';
export const NOT_A_SCORE = 'This is not a hiring probability.';

export function reasonText(code: AlertItem['reason']['code']): string {
  if (code === 'material_update') return 'The listing changed. This update used one alert.';
  if (code === 'followed_company') return 'This listing is from a company you follow.';
  return 'This listing matches a saved search.';
}

export function fitText(fit: AlertItem['reason']['fit']): string | null {
  switch (fit) {
    case 'blocked':
      return 'Blocked';
    case 'none':
      return 'No overlap with your confirmed facts';
    case 'partial':
      return 'Partial overlap with your confirmed facts';
    case 'strong':
      return 'Strong overlap with your confirmed facts';
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

export const DIGEST_OPTIONS: { value: AlertSettings['digest']; label: string }[] = [
  { value: 'weekly', label: 'Weekly email' },
  { value: 'daily', label: 'Daily email' },
  { value: 'immediate', label: 'As they are found' },
];

export const SCHEDULE_OPTIONS: { value: SavedSearch['schedule']; label: string }[] = [
  { value: 'weekly', label: 'Weekly' },
  { value: 'daily', label: 'Daily' },
  { value: 'every_6_hours', label: 'Every 6 hours' },
  { value: 'hourly', label: 'Hourly' },
];

export function scheduleLabel(schedule: SavedSearch['schedule'] | string): string {
  return SCHEDULE_OPTIONS.find((o) => o.value === schedule)?.label ?? schedule;
}

const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;

export const QUIET_INVALID = 'Quiet hours need a start and an end (HH:MM, UTC), and they cannot be the same time.';

/** Same rule as the server: both empty, or both HH:MM (24h) and different. */
export function validateQuietHours(
  startText: string,
  endText: string,
): { ok: true; start: string | null; end: string | null } | { ok: false; message: string } {
  const start = startText.trim();
  const end = endText.trim();
  if (start.length === 0 && end.length === 0) return { ok: true, start: null, end: null };
  if (!HHMM.test(start) || !HHMM.test(end) || start === end) return { ok: false, message: QUIET_INVALID };
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

export const ANY_SEARCH = 'All opportunities';

/** Title and detail line for a saved search. */
export function searchSummary(search: SavedSearch, locations: AlertLocation[] | undefined): { title: string; detail: string } {
  const title = search.q?.trim() || search.category?.trim() || ANY_SEARCH;
  const parts: string[] = [scheduleLabel(search.schedule)];
  if (search.locationProfileId) {
    const place = locations?.find((l) => l.id === search.locationProfileId);
    parts.push(place ? locationLabel(place) : 'Saved location');
  }
  return { title, detail: parts.join(' · ') };
}

export function locationLabel(location: Pick<AlertLocation, 'place' | 'radiusMiles'>): string {
  return location.radiusMiles > 0 ? `${location.place} · within ${location.radiusMiles} mi` : location.place;
}

export const RADIUS_MAX = 10000;

/** Whole miles, 0–10000 (the API's bounds; the plan limit is checked by the server). */
export function parseRadius(text: string): { ok: true; miles: number } | { ok: false; message: string } {
  const trimmed = text.trim();
  if (!/^\d{1,5}$/.test(trimmed)) return { ok: false, message: 'Enter the radius as whole miles, for example 25.' };
  const miles = Number(trimmed);
  if (miles > RADIUS_MAX) return { ok: false, message: `The radius can be at most ${RADIUS_MAX} miles.` };
  return { ok: true, miles };
}

/** Optional careers-page link for a followed company: empty, or an http(s) address. */
export function parseSourceUrl(text: string): { ok: true; url: string | undefined } | { ok: false; message: string } {
  const trimmed = text.trim();
  if (trimmed.length === 0) return { ok: true, url: undefined };
  if (trimmed.length > 2000 || !/^https?:\/\/[^\s/]+\.[^\s]+$/i.test(trimmed)) {
    return { ok: false, message: 'Enter a full web address starting with https://, or leave it empty.' };
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
        ? 'That choice is not on your plan. Your plan includes the weekly email. Nothing was changed.'
        : 'Your career plan does not include this. Nothing was changed.';
    }
    if (error.code === 'capacity_exceeded') {
      if (action === 'search') return 'This plan has no room for another saved search.';
      if (action === 'location') return 'This plan has no room for another alert location.';
      if (action === 'company') return 'This plan has no room for another followed company.';
    }
    if (error.code === 'validation_error') {
      if (field === 'quietHours') return QUIET_INVALID;
      if (field === 'schedule' && reason === 'above_plan') {
        return `That schedule is more frequent than your plan allows${typeof limit === 'string' ? ` (up to ${scheduleLabel(limit).toLowerCase()})` : ''}.`;
      }
      if (field === 'radiusMiles' && reason === 'above_plan') {
        return `That radius is larger than your plan allows${typeof limit === 'number' ? ` (up to ${limit} miles)` : ''}.`;
      }
      if (field === 'radiusMiles') return 'Enter the radius as whole miles, for example 25.';
      if (field === 'q') return 'Enter what to search for.';
      if (field === 'place') return 'Enter a place.';
      if (field === 'name') return 'Enter a company name.';
      if (field === 'digest') return 'Choose a digest.';
      return 'Check the details and try again. Nothing was changed.';
    }
  }
  const fallback: Record<AlertAction, string> = {
    settings: 'Alert settings were not saved. Try again.',
    search: 'The saved search was not changed. Try again.',
    location: 'The alert location was not changed. Try again.',
    company: 'The followed company was not changed. Try again.',
    load: 'Alerts could not be loaded. Nothing was changed. Try again.',
  };
  return careerErrorMessage(error, fallback[action]);
}

/** The operator switch for a section is off (`/access` features). Missing means not reported, i.e. on. */
export function featureOff(features: Record<string, boolean> | undefined, key: string): boolean {
  return features?.[key] === false;
}
