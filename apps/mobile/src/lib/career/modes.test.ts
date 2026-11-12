import { describe, expect, it } from 'vitest';
import { ApiError } from '../../../../../packages/career-api-client/src/client';
import type { LocationProfile } from '../../../../../packages/career-api-client/src/types';
import {
  canAddLocation,
  draftsEqual,
  draftToCreateInput,
  draftToPatch,
  emptyLocationDraft,
  guidelinesForSave,
  isPlanUpgradeRequired,
  locationBadge,
  locationLines,
  locationSaveError,
  locationToDraft,
  quotaHint,
  SPECIALIST_MODE_OPTIONS,
  specialistModeMeta,
  specialistSaveError,
  stepValue,
  validateLocationDraft,
} from './modes';

const loc: LocationProfile = {
  id: 'l1',
  workspaceId: 'w',
  candidateAuthUserId: 'u',
  place: 'Austin, TX',
  radiusMiles: 50,
  targetTimeline: '1_to_3_months',
  isRelocation: true,
  workAuthorization: 'needs_sponsorship',
  commuteMinutesMax: 30,
  remoteFlexibility: 'remote_only',
  notes: null,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

describe('location drafts', () => {
  it('starts like the website form, radius at the plan maximum', () => {
    expect(emptyLocationDraft(100)).toEqual({
      place: '',
      radiusMiles: 100,
      targetTimeline: 'exploring',
      isRelocation: false,
      workAuthorization: 'authorized',
      commuteMinutesMax: 45,
      remoteFlexibility: 'hybrid',
      notes: '',
    });
  });

  it('round-trips a location and detects edits', () => {
    const d = locationToDraft(loc);
    expect(d.notes).toBe('');
    expect(draftsEqual(d, locationToDraft(loc))).toBe(true);
    expect(draftsEqual({ ...d, radiusMiles: 55 }, d)).toBe(false);
  });

  it('validates place, radius and notes', () => {
    const d = emptyLocationDraft(25);
    expect(validateLocationDraft(d, 25)).toBe('Enter a location.');
    expect(validateLocationDraft({ ...d, place: '  ' }, 25)).toBe('Enter a location.');
    expect(validateLocationDraft({ ...d, place: 'x'.repeat(201) }, 25)).toMatch(/200/);
    expect(validateLocationDraft({ ...d, place: 'Leeds', radiusMiles: 30 }, 25)).toMatch(/25 miles/);
    expect(validateLocationDraft({ ...d, place: 'Leeds', notes: 'n'.repeat(2001) }, 25)).toMatch(/2000/);
    expect(validateLocationDraft({ ...d, place: 'Leeds' }, 25)).toBeNull();
  });

  it('creates with trimmed text and null notes when empty', () => {
    const input = draftToCreateInput({ ...emptyLocationDraft(50), place: '  Leeds ', notes: '   ' });
    expect(input.place).toBe('Leeds');
    expect(input.notes).toBeNull();
    expect(input.radiusMiles).toBe(50);
  });

  it('patches only changed fields', () => {
    const original = locationToDraft(loc);
    expect(draftToPatch(original, original)).toEqual({});
    expect(draftToPatch({ ...original, radiusMiles: 45, notes: ' near transit ' }, original)).toEqual({ radiusMiles: 45, notes: 'near transit' });
    expect(draftToPatch({ ...original, isRelocation: false }, original)).toEqual({ isRelocation: false });
  });

  it('steps within bounds', () => {
    expect(stepValue(25, 5, 5, 25)).toBe(25);
    expect(stepValue(5, -5, 5, 25)).toBe(5);
    expect(stepValue(20, 5, 5, 25)).toBe(25);
    expect(stepValue(45, -5, 15, 120)).toBe(40);
  });
});

describe('location view', () => {
  it('summarises a profile with website labels', () => {
    expect(locationLines(loc)).toEqual([
      'Radius: ~50 miles',
      'Timeline: 1 to 3 Months',
      'Work auth: Requires Visa Sponsorship',
      'Max commute: ≤ 30 min · Remote Only',
    ]);
    expect(locationBadge(loc)).toBe('RELOCATION TARGET');
    expect(locationBadge({ ...loc, isRelocation: false })).toBe('CURRENT LOCATION');
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
    expect(locationSaveError(new ApiError(400, 'validation_error', { code: 'validation_error' }))).toMatch(/check inputs/);
    expect(locationSaveError(new ApiError(0, 'network_error', { code: 'network_error' }))).toMatch(/No connection/);
    expect(locationSaveError(new Error('x'))).toMatch(/Failed to save location profile/);
  });
});

describe('specialist modes', () => {
  it('lists the six shared modes', () => {
    expect(SPECIALIST_MODE_OPTIONS.map((m) => m.id)).toEqual([
      'general',
      'technical_engineering',
      'executive_leadership',
      'creative_design',
      'academic_research',
      'career_transition',
    ]);
    expect(specialistModeMeta('creative_design').name).toBe('Creative & Design');
  });

  it('maps plan and save errors', () => {
    const upgrade = new ApiError(402, 'plan_upgrade_required', { code: 'plan_upgrade_required' });
    expect(isPlanUpgradeRequired(upgrade)).toBe(true);
    expect(isPlanUpgradeRequired(new Error('x'))).toBe(false);
    expect(specialistSaveError(upgrade)).toMatch(/not included/);
    expect(specialistSaveError(new Error('x'))).toBe('Failed to save specialist mode. Please try again.');
  });

  it('sends null for empty guidelines', () => {
    expect(guidelinesForSave('  ')).toBeNull();
    expect(guidelinesForSave(' focus on SRE ')).toBe('focus on SRE');
  });
});
