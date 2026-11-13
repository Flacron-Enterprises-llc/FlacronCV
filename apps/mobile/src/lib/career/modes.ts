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
import { hasKey, t } from '../../i18n';
import { careerErrorMessage } from '../career-view';

/**
 * Pure view logic for the relocation and specialist career modes screen
 * (website: /career/relocation, RelocationModesScreen). These are career-mode
 * location profiles (`/career-modes/locations`), not alert locations. The
 * career API checks capacity and the plan's radius; nothing here grants it.
 *
 * Copy lives in the `careerModes` namespace. Option labels are getters, so
 * they read the current language each time they are shown.
 */

/** A choice whose label is read in the current language (`careerModes.location.<group>.<value>`). */
function option<T extends string>(group: 'timeline' | 'workAuth' | 'remote', value: T): { value: T; label: string } {
  return {
    value,
    get label() {
      return t(`careerModes.location.${group}.${value}`);
    },
  };
}

export const TIMELINE_OPTIONS: { value: TargetTimeline; label: string }[] = (
  ['immediate', '1_to_3_months', '3_to_6_months', 'exploring', 'not_relocating'] as const
).map((v) => option('timeline', v));

export const WORK_AUTH_OPTIONS: { value: WorkAuthorization; label: string }[] = (
  ['citizen', 'permanent_resident', 'visa_holder', 'needs_sponsorship', 'authorized'] as const
).map((v) => option('workAuth', v));

export const REMOTE_OPTIONS: { value: RemoteFlexibility; label: string }[] = (
  ['hybrid', 'remote_only', 'onsite_only', 'any'] as const
).map((v) => option('remote', v));

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
  if (!place) return t('careerModes.location.validation.enterLocation');
  if (place.length > PLACE_MAX) return t('careerModes.location.validation.placeTooLong', { max: PLACE_MAX });
  if (draft.radiusMiles > allowedRadiusMiles) {
    return t('careerModes.location.validation.radiusTooLarge', { radius: allowedRadiusMiles });
  }
  if (draft.notes.trim().length > NOTES_MAX) return t('careerModes.location.validation.notesTooLong', { max: NOTES_MAX });
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
  return t('careerModes.location.quotaHint', { used, capacity, radius });
}

export function canAddLocation(used: number, capacity: number): boolean {
  return used < capacity;
}

export function locationLines(location: LocationProfile): string[] {
  return [
    t('careerModes.location.line.radius', { radius: location.radiusMiles }),
    t('careerModes.location.line.timeline', { value: timelineLabel(location.targetTimeline) }),
    t('careerModes.location.line.workAuth', { value: workAuthLabel(location.workAuthorization) }),
    t('careerModes.location.line.commute', {
      minutes: location.commuteMinutesMax,
      remote: remoteLabel(location.remoteFlexibility),
    }),
  ];
}

export function locationBadge(location: LocationProfile): string {
  return location.isRelocation ? t('careerModes.location.badge.relocation') : t('careerModes.location.badge.current');
}

/** Website wording for a failed location save. */
export function locationSaveError(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.code === 'capacity_exceeded') {
      return t('careerModes.location.error.capacity');
    }
    if (error.code === 'validation_error') {
      const field = (error.body as { field?: unknown }).field;
      if (field === 'radiusMiles') return t('careerModes.location.error.radius');
      if (field === 'place') return t('careerModes.location.validation.placeInvalid', { max: PLACE_MAX });
      if (field === 'notes') return t('careerModes.location.validation.notesTooLong', { max: NOTES_MAX });
      return t('careerModes.location.error.saveFailed');
    }
  }
  return careerErrorMessage(error, t('careerModes.location.error.saveFailed'));
}

export function locationDeleteError(error: unknown): string {
  return careerErrorMessage(error, t('careerModes.location.error.deleteFailed'));
}

export type SpecialistModeOption = SpecialistModeMetadata;

/** The shared (English) metadata, in the shared package's order. Show {@link specialistModeOptions} instead. */
export const SPECIALIST_MODE_OPTIONS: SpecialistModeOption[] = Object.values(SPECIALIST_MODES);

/**
 * The metadata in the current language (`careerModes.specialist.modes.<id>`).
 * A mode added to the shared package without translations keeps its English text.
 */
function localizedMode(meta: SpecialistModeMetadata): SpecialistModeOption {
  const base = `careerModes.specialist.modes.${meta.id}`;
  if (!hasKey(`${base}.name`)) return meta;
  return {
    ...meta,
    name: t(`${base}.name`),
    description: t(`${base}.description`),
    recommendedFocus: meta.recommendedFocus.map((focus, i) => {
      const key = `${base}.focus${i + 1}`;
      return hasKey(key) ? t(key) : focus;
    }),
    promptModifier: t(`${base}.promptModifier`),
  };
}

/** The specialist modes to show, in the current language. */
export function specialistModeOptions(): SpecialistModeOption[] {
  return SPECIALIST_MODE_OPTIONS.map(localizedMode);
}

export function specialistModeMeta(mode: SpecialistMode): SpecialistModeOption {
  return localizedMode(SPECIALIST_MODES[mode] ?? SPECIALIST_MODES.general);
}

export function isPlanUpgradeRequired(error: unknown): boolean {
  return error instanceof ApiError && error.code === 'plan_upgrade_required';
}

export function specialistSaveError(error: unknown): string {
  if (isPlanUpgradeRequired(error)) return t('careerModes.specialist.upgradeRequired');
  if (error instanceof ApiError && error.code === 'validation_error') {
    return t('careerModes.specialist.guidelinesTooLong', { max: GUIDELINES_MAX });
  }
  return careerErrorMessage(error, t('careerModes.specialist.saveFailed'));
}

/** null for empty guidelines, as the website sends. */
export function guidelinesForSave(text: string): string | null {
  return text.trim() || null;
}
