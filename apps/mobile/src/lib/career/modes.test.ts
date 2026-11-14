import { describe, expect, it } from 'vitest';
import { ApiError } from '../../../../../packages/career-api-client/src/client';
import type { LocationProfile } from '../../../../../packages/career-api-client/src/types';
import {
  canAddLocation,
  draftsEqual,
  draftToCreateInput,
  draftToPatch,
  emptyLocationDraft,
  groupLocations,
  guidelinesForSave,
  isPlanUpgradeRequired,
  locationBadge,
  locationKind,
  locationLines,
  locationSaveError,
  locationToDraft,
  modeChecklist,
  modeFilterLabels,
  modesEqual,
  quotaHint,
  savedModes,
  specialistModeOptions,
  specialistSaveError,
  stepValue,
  toggleMode,
  validateLocationDraft,
  WORK_AUTH_OPTIONS,
} from './modes';

const loc: LocationProfile = {
  id: 'l1',
  workspaceId: 'w',
  candidateAuthUserId: 'u',
  place: 'Austin, TX',
  radiusMiles: 50,
  kind: 'future',
  targetTimeline: '1_to_3_months',
  isRelocation: true,
  moveDate: '2027-03-01',
  availableFrom: '2027-03-15',
  remoteRegion: 'United States',
  workAuthorization: 'needs_sponsorship',
  licenseTransfer: 'not_stated',
  commuteMinutesMax: 30,
  remoteFlexibility: 'remote_only',
  notes: null,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

describe('location drafts', () => {
  it('starts with nothing assumed: authorization and licence not stated, radius at the plan maximum', () => {
    expect(emptyLocationDraft(100)).toEqual({
      place: '',
      radiusMiles: 100,
      kind: 'current',
      targetTimeline: 'not_relocating',
      moveDate: '',
      availableFrom: '',
      remoteRegion: '',
      workAuthorization: 'not_stated',
      licenseTransfer: 'not_stated',
      commuteMinutesMax: 45,
      remoteFlexibility: 'hybrid',
      notes: '',
    });
    expect(emptyLocationDraft(25, 'future')).toMatchObject({ kind: 'future', targetTimeline: 'exploring' });
    expect(WORK_AUTH_OPTIONS[0]).toMatchObject({ value: 'not_stated', label: 'Not stated' });
  });

  it('reads the kind from older rows that only carry isRelocation', () => {
    const legacy = { ...loc, kind: undefined as unknown as LocationProfile['kind'] };
    expect(locationKind(legacy)).toBe('future');
    expect(locationKind({ ...legacy, isRelocation: false })).toBe('current');
    expect(locationKind({ ...loc, kind: 'current', isRelocation: true })).toBe('current');
  });

  it('round-trips a location and detects edits', () => {
    const d = locationToDraft(loc);
    expect(d).toMatchObject({ kind: 'future', moveDate: '2027-03-01', remoteRegion: 'United States', notes: '' });
    expect(draftsEqual(d, locationToDraft(loc))).toBe(true);
    expect(draftsEqual({ ...d, radiusMiles: 55 }, d)).toBe(false);
    expect(draftsEqual({ ...d, licenseTransfer: 'confirmed' }, d)).toBe(false);
    expect(draftsEqual({ ...d, remoteRegion: ' United States ' }, d)).toBe(true);
  });

  it('validates place, radius, dates, remote region and notes', () => {
    const d = emptyLocationDraft(25);
    expect(validateLocationDraft(d, 25)).toBe('Enter a location.');
    expect(validateLocationDraft({ ...d, place: '  ' }, 25)).toBe('Enter a location.');
    expect(validateLocationDraft({ ...d, place: 'x'.repeat(201) }, 25)).toMatch(/200/);
    expect(validateLocationDraft({ ...d, place: 'Leeds', radiusMiles: 30 }, 25)).toMatch(/25 miles/);
    expect(validateLocationDraft({ ...d, place: 'Leeds', moveDate: '2026-02-31' }, 25)).toMatch(/real date/);
    expect(validateLocationDraft({ ...d, place: 'Leeds', availableFrom: '15/03/2027' }, 25)).toMatch(/real date/);
    expect(validateLocationDraft({ ...d, place: 'Leeds', remoteRegion: 'r'.repeat(121) }, 25)).toMatch(/120/);
    expect(validateLocationDraft({ ...d, place: 'Leeds', notes: 'n'.repeat(2001) }, 25)).toMatch(/2000/);
    expect(validateLocationDraft({ ...d, place: 'Leeds', moveDate: '2028-02-29', availableFrom: '' }, 25)).toBeNull();
  });

  it('creates with trimmed text and null for unknown values', () => {
    const input = draftToCreateInput({ ...emptyLocationDraft(50, 'future'), place: '  Leeds ', notes: '   ', moveDate: ' 2027-01-10 ' });
    expect(input).toMatchObject({
      place: 'Leeds',
      kind: 'future',
      radiusMiles: 50,
      moveDate: '2027-01-10',
      availableFrom: null,
      remoteRegion: null,
      notes: null,
      workAuthorization: 'not_stated',
      licenseTransfer: 'not_stated',
    });
    expect(input).not.toHaveProperty('isRelocation');
  });

  it('patches only changed fields and clears emptied ones', () => {
    const original = locationToDraft(loc);
    expect(draftToPatch(original, original)).toEqual({});
    expect(draftToPatch({ ...original, radiusMiles: 45, notes: ' near transit ' }, original)).toEqual({ radiusMiles: 45, notes: 'near transit' });
    expect(draftToPatch({ ...original, kind: 'current' }, original)).toEqual({ kind: 'current' });
    expect(draftToPatch({ ...original, moveDate: '', remoteRegion: 'EU' }, original)).toEqual({ moveDate: null, remoteRegion: 'EU' });
    expect(draftToPatch({ ...original, licenseTransfer: 'confirmed' }, original)).toEqual({ licenseTransfer: 'confirmed' });
  });

  it('steps within bounds', () => {
    expect(stepValue(25, 5, 5, 25)).toBe(25);
    expect(stepValue(5, -5, 5, 25)).toBe(5);
    expect(stepValue(20, 5, 5, 25)).toBe(25);
    expect(stepValue(45, -5, 15, 120)).toBe(40);
  });
});

describe('location view', () => {
  it('summarises a profile, remote region separate from the radius', () => {
    expect(locationLines(loc)).toEqual([
      'Radius: ~50 miles',
      'Remote region: United States',
      'Timeline: 1 to 3 Months',
      'Moving: 2027-03-01',
      'Available from: 2027-03-15',
      'Work auth: Requires Visa Sponsorship',
      'Licences valid here: Not stated',
      'Max commute: ≤ 30 min · Remote Only',
    ]);
    const bare = { ...loc, kind: 'current' as const, isRelocation: false, moveDate: null, availableFrom: null, remoteRegion: null, workAuthorization: 'not_stated' as const };
    expect(locationLines(bare)).toEqual([
      'Radius: ~50 miles',
      'Remote region: Not stated',
      'Timeline: 1 to 3 Months',
      'Work auth: Not stated',
      'Licences valid here: Not stated',
      'Max commute: ≤ 30 min · Remote Only',
    ]);
    expect(locationBadge(loc)).toBe('RELOCATION TARGET');
    expect(locationBadge(bare)).toBe('CURRENT LOCATION');
  });

  it('groups current and future places', () => {
    const current = { ...loc, id: 'c', kind: 'current' as const, isRelocation: false };
    const groups = groupLocations([loc, current]);
    expect(groups.current.map((l) => l.id)).toEqual(['c']);
    expect(groups.future.map((l) => l.id)).toEqual(['l1']);
  });

  it('shows quota and capacity', () => {
    expect(quotaHint(1, 5, 100)).toBe('Using 1 of 5 location profiles. Plan local search radius: up to 100 miles.');
    expect(canAddLocation(4, 5)).toBe(true);
    expect(canAddLocation(5, 5)).toBe(false);
  });

  it('maps save errors without offering a purchase', () => {
    const capacity = locationSaveError(new ApiError(409, 'capacity_exceeded', { code: 'capacity_exceeded' }));
    expect(capacity).toMatch(/capacity reached/);
    expect(capacity).not.toMatch(/add-on|upgrade|buy/i);
    expect(locationSaveError(new ApiError(400, 'validation_error', { code: 'validation_error', field: 'radiusMiles' }))).toBe(
      'Radius exceeds your plan allowance.',
    );
    expect(locationSaveError(new ApiError(400, 'validation_error', { code: 'validation_error', field: 'moveDate' }))).toMatch(/real date/);
    expect(locationSaveError(new ApiError(400, 'validation_error', { code: 'validation_error', field: 'availableFrom' }))).toMatch(/real date/);
    expect(locationSaveError(new ApiError(400, 'validation_error', { code: 'validation_error' }))).toMatch(/check inputs/);
    expect(locationSaveError(new ApiError(0, 'network_error', { code: 'network_error' }))).toMatch(/No connection/);
    expect(locationSaveError(new Error('x'))).toMatch(/Failed to save location profile/);
  });
});

describe('specialist modes', () => {
  it('lists the nine spec modes in the shared order with translated names', () => {
    const options = specialistModeOptions();
    expect(options.map((m) => m.id)).toEqual([
      'students_graduates',
      'career_changers',
      'experienced_professionals',
      'freelancers',
      'returning_workers',
      'veterans',
      'military_spouses',
      'international_candidates',
      'trades_licensed',
    ]);
    expect(options.find((m) => m.id === 'military_spouses')?.name).toBe('Military spouses');
  });

  it('reads the saved selection, with no fallback mode', () => {
    expect(savedModes(undefined)).toEqual([]);
    expect(savedModes({ mode: null, modes: [] })).toEqual([]);
    expect(savedModes({ mode: 'veterans', modes: [] })).toEqual(['veterans']);
    expect(savedModes({ mode: 'veterans', modes: ['veterans', 'freelancers'] })).toEqual(['veterans', 'freelancers']);
    expect(savedModes({ mode: null, modes: ['general' as never, 'freelancers'] })).toEqual(['freelancers']);
  });

  it('selects up to three and keeps order', () => {
    let selected = toggleMode([], 'veterans');
    selected = toggleMode(selected, 'freelancers');
    selected = toggleMode(selected, 'career_changers');
    expect(toggleMode(selected, 'trades_licensed')).toBe(selected);
    expect(toggleMode(selected, 'freelancers')).toEqual(['veterans', 'career_changers']);
    expect(modesEqual(['veterans'], ['veterans'])).toBe(true);
    expect(modesEqual(['veterans', 'freelancers'], ['freelancers', 'veterans'])).toBe(false);
  });

  it('builds the translated checklist and filter hints for the selection', () => {
    const checklist = modeChecklist(['trades_licensed']);
    expect(checklist.map((c) => c.id)).toEqual(['credential_tracking', 'expiry_reminders', 'license_regions', 'license_transfer_check']);
    expect(checklist[3].label).toMatch(/never assumed/);
    expect(modeFilterLabels(['military_spouses', 'returning_workers'])).toEqual([
      'Remote',
      'Flexible hours',
      'Published military-spouse pathways',
    ]);
    expect(modeChecklist([])).toEqual([]);
  });

  it('maps plan and save errors', () => {
    const upgrade = new ApiError(402, 'plan_upgrade_required', { code: 'plan_upgrade_required' });
    expect(isPlanUpgradeRequired(upgrade)).toBe(true);
    expect(isPlanUpgradeRequired(new Error('x'))).toBe(false);
    expect(specialistSaveError(upgrade)).toMatch(/not included/);
    expect(specialistSaveError(new ApiError(400, 'validation_error', { code: 'validation_error', field: 'modes' }))).toMatch(/up to 3/);
    expect(specialistSaveError(new Error('x'))).toBe('Failed to save specialist mode. Please try again.');
  });

  it('sends null for empty guidelines', () => {
    expect(guidelinesForSave('  ')).toBeNull();
    expect(guidelinesForSave(' focus on SRE ')).toBe('focus on SRE');
  });
});
