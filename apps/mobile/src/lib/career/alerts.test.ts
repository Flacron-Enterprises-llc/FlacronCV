import { describe, expect, it } from 'vitest';
import { ApiError } from '../../../../../packages/career-api-client/src/client';
import type { AlertSettings, SavedSearch } from '../../../../../packages/career-api-client/src/types';
import {
  alertBalance,
  alertErrorMessage,
  featureOff,
  fitText,
  locationLabel,
  parseRadius,
  parseSourceUrl,
  QUIET_INVALID,
  reasonText,
  searchSummary,
  settingsDirty,
  settingsDraft,
  settingsPatch,
  validateQuietHours,
} from './alerts';

const settings: AlertSettings = {
  email: true,
  push: false,
  telegram: false,
  digest: 'weekly',
  quietStart: null,
  quietEnd: null,
  paused: false,
};

const search: SavedSearch = {
  id: 's1',
  q: 'analyst',
  category: null,
  locationProfileId: null,
  radiusMiles: null,
  schedule: 'daily',
  paused: false,
};

describe('alert copy', () => {
  it('uses the website reason and fit wording', () => {
    expect(reasonText('saved_search')).toBe('This listing matches a saved search.');
    expect(reasonText('followed_company')).toBe('This listing is from a company you follow.');
    expect(reasonText('material_update')).toContain('used one alert');
    expect(fitText('strong')).toBe('Strong overlap with your confirmed facts');
    expect(fitText('blocked')).toBe('Blocked');
    expect(fitText(null)).toBeNull();
  });

  it('adds included and pack alert items', () => {
    const b = alertBalance({ alertItem: { includedRemaining: 3, packRemaining: 2, renewalDate: '2026-12-01T00:00:00.000Z' } });
    expect(b.remaining).toBe(5);
    expect(b.renews).toBe('December 1, 2026');
    expect(alertBalance({ alertItem: { includedRemaining: 0, packRemaining: 0, renewalDate: null } })).toEqual({ remaining: 0, renews: null });
  });
});

describe('quiet hours', () => {
  it('accepts both empty or two different HH:MM times', () => {
    expect(validateQuietHours('', ' ')).toEqual({ ok: true, start: null, end: null });
    expect(validateQuietHours('22:00', '07:30')).toEqual({ ok: true, start: '22:00', end: '07:30' });
    expect(validateQuietHours(' 00:00 ', '23:59')).toEqual({ ok: true, start: '00:00', end: '23:59' });
  });

  it('rejects one side, bad formats, and equal times', () => {
    for (const [a, b] of [
      ['22:00', ''],
      ['', '07:00'],
      ['24:00', '07:00'],
      ['7:00', '08:00'],
      ['22:60', '07:00'],
      ['10:00', '10:00'],
      ['ab:cd', '07:00'],
    ]) {
      expect(validateQuietHours(a, b)).toEqual({ ok: false, message: QUIET_INVALID });
    }
  });
});

describe('settings draft', () => {
  it('round-trips and detects edits', () => {
    const draft = settingsDraft(settings);
    expect(settingsDirty(draft, settings)).toBe(false);
    expect(settingsDirty({ ...draft, push: true }, settings)).toBe(true);
    expect(settingsDirty({ ...draft, quietStart: '  ' }, settings)).toBe(false);
    expect(settingsDirty({ ...draft, quietStart: '22:00' }, settings)).toBe(true);
  });

  it('builds the full website patch, or refuses invalid quiet hours', () => {
    const ok = settingsPatch({ ...settingsDraft(settings), digest: 'daily', quietStart: '22:00', quietEnd: '06:00', paused: true });
    expect(ok).toEqual({
      ok: true,
      patch: { email: true, push: false, telegram: false, digest: 'daily', quietStart: '22:00', quietEnd: '06:00', paused: true },
    });
    expect(settingsPatch({ ...settingsDraft(settings), quietStart: '22:00' })).toEqual({ ok: false, message: QUIET_INVALID });
  });
});

describe('saved searches and locations', () => {
  it('summarises a search with schedule and location', () => {
    expect(searchSummary(search, [])).toEqual({ title: 'analyst', detail: 'Daily' });
    const withPlace = { ...search, q: null, category: null, locationProfileId: 'l1', schedule: 'every_6_hours' as const };
    expect(searchSummary(withPlace, [{ id: 'l1', place: 'Leeds', radiusMiles: 25 }])).toEqual({
      title: 'All opportunities',
      detail: 'Every 6 hours · Leeds · within 25 mi',
    });
    expect(searchSummary(withPlace, undefined).detail).toBe('Every 6 hours · Saved location');
    expect(locationLabel({ place: 'Remote', radiusMiles: 0 })).toBe('Remote');
  });

  it('parses a whole-mile radius within API bounds', () => {
    expect(parseRadius(' 25 ')).toEqual({ ok: true, miles: 25 });
    expect(parseRadius('0')).toEqual({ ok: true, miles: 0 });
    expect(parseRadius('10001').ok).toBe(false);
    expect(parseRadius('2.5').ok).toBe(false);
    expect(parseRadius('-1').ok).toBe(false);
    expect(parseRadius('').ok).toBe(false);
  });

  it('accepts an empty or http(s) careers link only', () => {
    expect(parseSourceUrl('  ')).toEqual({ ok: true, url: undefined });
    expect(parseSourceUrl(' https://example.com/careers ')).toEqual({ ok: true, url: 'https://example.com/careers' });
    expect(parseSourceUrl('javascript:alert(1)').ok).toBe(false);
    expect(parseSourceUrl('example.com').ok).toBe(false);
  });
});

describe('alert errors', () => {
  const err = (code: string, extra: Record<string, unknown> = {}, status = 400) => new ApiError(status, code, { code, ...extra });

  it('maps server refusals to honest messages', () => {
    expect(alertErrorMessage(err('validation_error', { field: 'quietHours', reason: 'invalid' }), 'settings')).toBe(QUIET_INVALID);
    expect(alertErrorMessage(err('plan_upgrade_required', {}, 403), 'settings')).toContain('weekly email');
    expect(alertErrorMessage(err('capacity_exceeded', {}, 403), 'search')).toBe('This plan has no room for another saved search.');
    expect(alertErrorMessage(err('capacity_exceeded', {}, 403), 'company')).toContain('followed company');
    expect(alertErrorMessage(err('validation_error', { field: 'schedule', reason: 'above_plan', limit: 'daily' }), 'search')).toContain('(up to daily)');
    expect(alertErrorMessage(err('validation_error', { field: 'radiusMiles', reason: 'above_plan', limit: 50 }), 'location')).toContain('(up to 50 miles)');
    expect(alertErrorMessage(err('network_error', {}, 0), 'load')).toContain('No connection');
    expect(alertErrorMessage(new Error('boom'), 'load')).toBe('Alerts could not be loaded. Nothing was changed. Try again.');
  });

  it('treats a missing feature flag as on', () => {
    expect(featureOff(undefined, 'savedSearches')).toBe(false);
    expect(featureOff({ savedSearches: true }, 'savedSearches')).toBe(false);
    expect(featureOff({ savedSearches: false }, 'savedSearches')).toBe(true);
  });
});
