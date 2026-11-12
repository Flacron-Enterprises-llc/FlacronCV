import { ApiError } from '../../../../../packages/career-api-client/src/client';
import {
  SPECIALIST_MODES,
  type CreateLocationProfileInput,
  type LocationProfile,
  type RemoteFlexibility,
  type SpecialistMode,
  type SpecialistModeMetadata,
  type TargetTimeline,
  type UpdateLocationProfileInput,
  type WorkAuthorization,
} from '../../../../../packages/career-shared/src/career-modes';
import { careerErrorMessage } from '../career-view';

/**
 * Pure view logic for the relocation and specialist career modes screen
 * (website: /career/relocation, RelocationModesScreen). These are career-mode
 * location profiles (`/career-modes/locations`), not alert locations. The
 * career API checks capacity and the plan's radius; nothing here grants it.
 */

export const TIMELINE_OPTIONS: { value: TargetTimeline; label: string }[] = [
  { value: 'immediate', label: 'Immediate (Active Move)' },
  { value: '1_to_3_months', label: '1 to 3 Months' },
  { value: '3_to_6_months', label: '3 to 6 Months' },
  { value: 'exploring', label: 'Exploring Possibilities' },
  { value: 'not_relocating', label: 'Current Location (Not Relocating)' },
];

export const WORK_AUTH_OPTIONS: { value: WorkAuthorization; label: string }[] = [
  { value: 'citizen', label: 'Citizen' },
  { value: 'permanent_resident', label: 'Permanent Resident / Green Card' },
  { value: 'visa_holder', label: 'Current Work Visa' },
  { value: 'needs_sponsorship', label: 'Requires Visa Sponsorship' },
  { value: 'authorized', label: 'Authorized to Work' },
];

export const REMOTE_OPTIONS: { value: RemoteFlexibility; label: string }[] = [
  { value: 'hybrid', label: 'Hybrid Preferred' },
  { value: 'remote_only', label: 'Remote Only' },
  { value: 'onsite_only', label: 'Onsite Only' },
  { value: 'any', label: 'Any Arrangement' },
];

function labelOf<T extends string>(options: { value: T; label: string }[], value: T): string {
  return options.find((o) => o.value === value)?.label ?? value;
}

export const timelineLabel = (v: TargetTimeline) => labelOf(TIMELINE_OPTIONS, v);
export const workAuthLabel = (v: WorkAuthorization) => labelOf(WORK_AUTH_OPTIONS, v);
export const remoteLabel = (v: RemoteFlexibility) => labelOf(REMOTE_OPTIONS, v);

/** Same steps as the website's sliders: radius 5..plan max by 5, commute 15..120 min by 5. */
export const RADIUS_MIN = 5;
export const RADIUS_STEP = 5;
export const COMMUTE_MIN = 15;
export const COMMUTE_MAX = 120;
export const COMMUTE_STEP = 5;
export const PLACE_MAX = 200;
export const NOTES_MAX = 2000;
export const GUIDELINES_MAX = 2000;

export function stepValue(value: number, delta: number, min: number, max: number): number {
  const next = value + delta;
  if (max < min) return Math.max(0, max);
  return Math.min(max, Math.max(min, next));
}

export interface LocationDraft {
  place: string;
  radiusMiles: number;
  targetTimeline: TargetTimeline;
  isRelocation: boolean;
  workAuthorization: WorkAuthorization;
  commuteMinutesMax: number;
  remoteFlexibility: RemoteFlexibility;
  notes: string;
}

/** The website's new-location defaults; radius starts at the plan's maximum. */
export function emptyLocationDraft(allowedRadiusMiles: number): LocationDraft {
  return {
    place: '',
    radiusMiles: allowedRadiusMiles,
    targetTimeline: 'exploring',
    isRelocation: false,
    workAuthorization: 'authorized',
    commuteMinutesMax: 45,
    remoteFlexibility: 'hybrid',
    notes: '',
  };
}

export function locationToDraft(location: LocationProfile): LocationDraft {
  return {
    place: location.place,
    radiusMiles: location.radiusMiles,
    targetTimeline: location.targetTimeline,
    isRelocation: location.isRelocation,
    workAuthorization: location.workAuthorization,
    commuteMinutesMax: location.commuteMinutesMax,
    remoteFlexibility: location.remoteFlexibility,
    notes: location.notes ?? '',
  };
}

export function draftsEqual(a: LocationDraft, b: LocationDraft): boolean {
  return (
    a.place === b.place &&
    a.radiusMiles === b.radiusMiles &&
    a.targetTimeline === b.targetTimeline &&
    a.isRelocation === b.isRelocation &&
    a.workAuthorization === b.workAuthorization &&
    a.commuteMinutesMax === b.commuteMinutesMax &&
    a.remoteFlexibility === b.remoteFlexibility &&
    a.notes === b.notes
  );
}

/** Client-side check before sending; the career API checks again. */
export function validateLocationDraft(draft: LocationDraft, allowedRadiusMiles: number): string | null {
  const place = draft.place.trim();
  if (!place) return 'Enter a location.';
  if (place.length > PLACE_MAX) return `Keep the location under ${PLACE_MAX} characters.`;
  if (draft.radiusMiles > allowedRadiusMiles) return `Your plan allows a radius of up to ${allowedRadiusMiles} miles.`;
  if (draft.notes.trim().length > NOTES_MAX) return `Keep the notes under ${NOTES_MAX} characters.`;
  return null;
}

export function draftToCreateInput(draft: LocationDraft): CreateLocationProfileInput {
  return {
    place: draft.place.trim(),
    radiusMiles: draft.radiusMiles,
    targetTimeline: draft.targetTimeline,
    isRelocation: draft.isRelocation,
    workAuthorization: draft.workAuthorization,
    commuteMinutesMax: draft.commuteMinutesMax,
    remoteFlexibility: draft.remoteFlexibility,
    notes: draft.notes.trim() || null,
  };
}

/** Only the fields that changed, so an untouched field is never rewritten. */
export function draftToPatch(draft: LocationDraft, original: LocationDraft): UpdateLocationProfileInput {
  const patch: UpdateLocationProfileInput = {};
  if (draft.place.trim() !== original.place.trim()) patch.place = draft.place.trim();
  if (draft.radiusMiles !== original.radiusMiles) patch.radiusMiles = draft.radiusMiles;
  if (draft.targetTimeline !== original.targetTimeline) patch.targetTimeline = draft.targetTimeline;
  if (draft.isRelocation !== original.isRelocation) patch.isRelocation = draft.isRelocation;
  if (draft.workAuthorization !== original.workAuthorization) patch.workAuthorization = draft.workAuthorization;
  if (draft.commuteMinutesMax !== original.commuteMinutesMax) patch.commuteMinutesMax = draft.commuteMinutesMax;
  if (draft.remoteFlexibility !== original.remoteFlexibility) patch.remoteFlexibility = draft.remoteFlexibility;
  if (draft.notes.trim() !== original.notes.trim()) patch.notes = draft.notes.trim() || null;
  return patch;
}

export function quotaHint(used: number, capacity: number, radius: number): string {
  return `Using ${used} of ${capacity} location profiles. Plan local search radius: up to ${radius} miles.`;
}

export function canAddLocation(used: number, capacity: number): boolean {
  return used < capacity;
}

export function locationLines(location: LocationProfile): string[] {
  return [
    `Radius: ~${location.radiusMiles} miles`,
    `Timeline: ${timelineLabel(location.targetTimeline)}`,
    `Work auth: ${workAuthLabel(location.workAuthorization)}`,
    `Max commute: ≤ ${location.commuteMinutesMax} min · ${remoteLabel(location.remoteFlexibility)}`,
  ];
}

export function locationBadge(location: LocationProfile): string {
  return location.isRelocation ? 'RELOCATION TARGET' : 'CURRENT LOCATION';
}

/** Website wording for a failed location save. */
export function locationSaveError(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.code === 'capacity_exceeded') {
      return 'Plan location profile capacity reached. Delete a location profile to add another.';
    }
    if (error.code === 'validation_error') {
      const field = (error.body as { field?: unknown }).field;
      if (field === 'radiusMiles') return 'Radius exceeds your plan allowance.';
      if (field === 'place') return 'Enter a location under 200 characters.';
      if (field === 'notes') return 'Keep the notes under 2000 characters.';
      return 'Failed to save location profile. Please check inputs and try again.';
    }
  }
  return careerErrorMessage(error, 'Failed to save location profile. Please check inputs and try again.');
}

export function locationDeleteError(error: unknown): string {
  return careerErrorMessage(error, 'Failed to delete location profile.');
}

export type SpecialistModeOption = SpecialistModeMetadata;

export const SPECIALIST_MODE_OPTIONS: SpecialistModeOption[] = Object.values(SPECIALIST_MODES);

export function specialistModeMeta(mode: SpecialistMode): SpecialistModeOption {
  return SPECIALIST_MODES[mode] ?? SPECIALIST_MODES.general;
}

export function isPlanUpgradeRequired(error: unknown): boolean {
  return error instanceof ApiError && error.code === 'plan_upgrade_required';
}

export function specialistSaveError(error: unknown): string {
  if (isPlanUpgradeRequired(error)) return 'Specialist career modes are not included in your current plan.';
  if (error instanceof ApiError && error.code === 'validation_error') {
    return `Keep the custom guidelines under ${GUIDELINES_MAX} characters.`;
  }
  return careerErrorMessage(error, 'Failed to save specialist mode. Please try again.');
}

/** null for empty guidelines, as the website sends. */
export function guidelinesForSave(text: string): string | null {
  return text.trim() || null;
}
