import { ApiError } from '../../../../../packages/career-api-client/src/client';
import {
  isSpecialistMode,
  locationDateProblem,
  LOCATION_NOTES_MAX,
  LOCATION_PLACE_MAX,
  MAX_ACTIVE_MODES,
  REMOTE_REGION_MAX,
  SPECIALIST_MODE_IDS,
  SPECIALIST_MODES,
  type CandidateSpecialistMode,
  type CreateLocationProfileInput,
  type LicenseTransfer,
  type LocationKind,
  type LocationProfile,
  type RemoteFlexibility,
  type SpecialistMode,
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
 * Truthfulness: work authorization and licence validity default to
 * "not stated" and are never inferred; a place is "current" or "future".
 *
 * Copy lives in the `careerModes` namespace. Option labels are getters, so
 * they read the current language each time they are shown.
 */

/** A choice whose label is read in the current language (`careerModes.<prefix>.<value>`). */
function option<T extends string>(prefix: string, value: T): { value: T; label: string } {
  return {
    value,
    get label() {
      return t(`careerModes.${prefix}.${value}`);
    },
  };
}

export const TIMELINE_OPTIONS: { value: TargetTimeline; label: string }[] = (
  ['immediate', '1_to_3_months', '3_to_6_months', 'exploring', 'not_relocating'] as const
).map((v) => option('location.timeline', v));

/** "Not stated" first: it is the default and authorization is never assumed. */
export const WORK_AUTH_OPTIONS: { value: WorkAuthorization; label: string }[] = (
  ['not_stated', 'citizen', 'permanent_resident', 'visa_holder', 'needs_sponsorship', 'authorized'] as const
).map((v) => option('location.workAuth', v));

export const REMOTE_OPTIONS: { value: RemoteFlexibility; label: string }[] = (
  ['hybrid', 'remote_only', 'onsite_only', 'any'] as const
).map((v) => option('location.remote', v));

export const LICENSE_OPTIONS: { value: LicenseTransfer; label: string }[] = (
  ['not_stated', 'confirmed', 'not_confirmed'] as const
).map((v) => option('location.license', v));

export const KIND_OPTIONS: { value: LocationKind; label: string }[] = [
  {
    value: 'current',
    get label() {
      return t('careerModes.editor.kindCurrent');
    },
  },
  {
    value: 'future',
    get label() {
      return t('careerModes.editor.kindFuture');
    },
  },
];

function labelOf<T extends string>(options: { value: T; label: string }[], value: T): string {
  return options.find((o) => o.value === value)?.label ?? value;
}

export const timelineLabel = (v: TargetTimeline) => labelOf(TIMELINE_OPTIONS, v);
export const workAuthLabel = (v: WorkAuthorization) => labelOf(WORK_AUTH_OPTIONS, v);
export const remoteLabel = (v: RemoteFlexibility) => labelOf(REMOTE_OPTIONS, v);
export const licenseLabel = (v: LicenseTransfer) => labelOf(LICENSE_OPTIONS, v);

/** Same steps as the website's sliders: radius 5..plan max by 5, commute 15..120 min by 5. */
export const RADIUS_MIN = 5;
export const RADIUS_STEP = 5;
export const COMMUTE_MIN = 15;
export const COMMUTE_MAX = 120;
export const COMMUTE_STEP = 5;
export const PLACE_MAX = LOCATION_PLACE_MAX;
export const NOTES_MAX = LOCATION_NOTES_MAX;
export const REGION_MAX = REMOTE_REGION_MAX;
export const GUIDELINES_MAX = 2000;
export const MAX_MODES = MAX_ACTIVE_MODES;

export function stepValue(value: number, delta: number, min: number, max: number): number {
  const next = value + delta;
  if (max < min) return Math.max(0, max);
  return Math.min(max, Math.max(min, next));
}

/** Form state; dates and the remote region are text ('' = not known). */
export interface LocationDraft {
  place: string;
  radiusMiles: number;
  kind: LocationKind;
  targetTimeline: TargetTimeline;
  moveDate: string;
  availableFrom: string;
  remoteRegion: string;
  workAuthorization: WorkAuthorization;
  licenseTransfer: LicenseTransfer;
  commuteMinutesMax: number;
  remoteFlexibility: RemoteFlexibility;
  notes: string;
}

/** The kind of a stored place; rows written by older clients only carry `isRelocation`. */
export function locationKind(location: Pick<LocationProfile, 'kind' | 'isRelocation'>): LocationKind {
  if (location.kind === 'current' || location.kind === 'future') return location.kind;
  return location.isRelocation ? 'future' : 'current';
}

/** New-place defaults; radius starts at the plan's maximum and nothing is assumed. */
export function emptyLocationDraft(allowedRadiusMiles: number, kind: LocationKind = 'current'): LocationDraft {
  return {
    place: '',
    radiusMiles: allowedRadiusMiles,
    kind,
    targetTimeline: kind === 'future' ? 'exploring' : 'not_relocating',
    moveDate: '',
    availableFrom: '',
    remoteRegion: '',
    workAuthorization: 'not_stated',
    licenseTransfer: 'not_stated',
    commuteMinutesMax: 45,
    remoteFlexibility: 'hybrid',
    notes: '',
  };
}

export function locationToDraft(location: LocationProfile): LocationDraft {
  return {
    place: location.place,
    radiusMiles: location.radiusMiles,
    kind: locationKind(location),
    targetTimeline: location.targetTimeline,
    moveDate: location.moveDate ?? '',
    availableFrom: location.availableFrom ?? '',
    remoteRegion: location.remoteRegion ?? '',
    workAuthorization: location.workAuthorization ?? 'not_stated',
    licenseTransfer: location.licenseTransfer ?? 'not_stated',
    commuteMinutesMax: location.commuteMinutesMax,
    remoteFlexibility: location.remoteFlexibility,
    notes: location.notes ?? '',
  };
}

const TEXT_FIELDS = ['place', 'moveDate', 'availableFrom', 'remoteRegion', 'notes'] as const;
const VALUE_FIELDS = [
  'radiusMiles',
  'kind',
  'targetTimeline',
  'workAuthorization',
  'licenseTransfer',
  'commuteMinutesMax',
  'remoteFlexibility',
] as const;

export function draftsEqual(a: LocationDraft, b: LocationDraft): boolean {
  return TEXT_FIELDS.every((k) => a[k].trim() === b[k].trim()) && VALUE_FIELDS.every((k) => a[k] === b[k]);
}

const orNull = (value: string): string | null => value.trim() || null;

/** Client-side check before sending; the career API checks again. */
export function validateLocationDraft(draft: LocationDraft, allowedRadiusMiles: number): string | null {
  const place = draft.place.trim();
  if (!place) return t('careerModes.location.validation.enterLocation');
  if (place.length > PLACE_MAX) return t('careerModes.location.validation.placeTooLong', { max: PLACE_MAX });
  if (draft.radiusMiles > allowedRadiusMiles) {
    return t('careerModes.location.validation.radiusTooLarge', { radius: allowedRadiusMiles });
  }
  // 2026-02-31 is refused here, not silently rolled over to March.
  if (locationDateProblem({ moveDate: orNull(draft.moveDate), availableFrom: orNull(draft.availableFrom) })) {
    return t('careerModes.location.validation.dateInvalid');
  }
  if (draft.remoteRegion.trim().length > REGION_MAX) {
    return t('careerModes.location.validation.remoteRegionTooLong', { max: REGION_MAX });
  }
  if (draft.notes.trim().length > NOTES_MAX) return t('careerModes.location.validation.notesTooLong', { max: NOTES_MAX });
  return null;
}

export function draftToCreateInput(draft: LocationDraft): CreateLocationProfileInput {
  return {
    place: draft.place.trim(),
    radiusMiles: draft.radiusMiles,
    kind: draft.kind,
    targetTimeline: draft.targetTimeline,
    moveDate: orNull(draft.moveDate),
    availableFrom: orNull(draft.availableFrom),
    remoteRegion: orNull(draft.remoteRegion),
    workAuthorization: draft.workAuthorization,
    licenseTransfer: draft.licenseTransfer,
    commuteMinutesMax: draft.commuteMinutesMax,
    remoteFlexibility: draft.remoteFlexibility,
    notes: orNull(draft.notes),
  };
}

/** Only the fields that changed, so an untouched field is never rewritten. */
export function draftToPatch(draft: LocationDraft, original: LocationDraft): UpdateLocationProfileInput {
  const patch: UpdateLocationProfileInput = {};
  if (draft.place.trim() !== original.place.trim()) patch.place = draft.place.trim();
  for (const key of ['moveDate', 'availableFrom', 'remoteRegion', 'notes'] as const) {
    if (draft[key].trim() !== original[key].trim()) patch[key] = orNull(draft[key]);
  }
  if (draft.radiusMiles !== original.radiusMiles) patch.radiusMiles = draft.radiusMiles;
  if (draft.kind !== original.kind) patch.kind = draft.kind;
  if (draft.targetTimeline !== original.targetTimeline) patch.targetTimeline = draft.targetTimeline;
  if (draft.workAuthorization !== original.workAuthorization) patch.workAuthorization = draft.workAuthorization;
  if (draft.licenseTransfer !== original.licenseTransfer) patch.licenseTransfer = draft.licenseTransfer;
  if (draft.commuteMinutesMax !== original.commuteMinutesMax) patch.commuteMinutesMax = draft.commuteMinutesMax;
  if (draft.remoteFlexibility !== original.remoteFlexibility) patch.remoteFlexibility = draft.remoteFlexibility;
  return patch;
}

export function quotaHint(used: number, capacity: number, radius: number): string {
  return t('careerModes.location.quotaHint', { used, capacity, radius });
}

export function canAddLocation(used: number, capacity: number): boolean {
  return used < capacity;
}

/** Current places first, then the places the person is moving to. */
export function groupLocations(items: LocationProfile[]): { current: LocationProfile[]; future: LocationProfile[] } {
  return {
    current: items.filter((l) => locationKind(l) === 'current'),
    future: items.filter((l) => locationKind(l) === 'future'),
  };
}

export function locationLines(location: LocationProfile): string[] {
  const notStated = t('careerModes.location.notStated');
  const lines = [
    t('careerModes.location.line.radius', { radius: location.radiusMiles }),
    t('careerModes.location.line.remoteRegion', { value: location.remoteRegion?.trim() || notStated }),
    t('careerModes.location.line.timeline', { value: timelineLabel(location.targetTimeline) }),
  ];
  // Dates are shown as entered (YYYY-MM-DD) so no time zone can shift the day.
  if (location.moveDate) lines.push(t('careerModes.location.line.moveDate', { value: location.moveDate }));
  if (location.availableFrom) lines.push(t('careerModes.location.line.availableFrom', { value: location.availableFrom }));
  lines.push(
    t('careerModes.location.line.workAuth', { value: workAuthLabel(location.workAuthorization ?? 'not_stated') }),
    t('careerModes.location.line.license', { value: licenseLabel(location.licenseTransfer ?? 'not_stated') }),
    t('careerModes.location.line.commute', {
      minutes: location.commuteMinutesMax,
      remote: remoteLabel(location.remoteFlexibility),
    }),
  );
  return lines;
}

export function locationBadge(location: LocationProfile): string {
  return locationKind(location) === 'future'
    ? t('careerModes.location.badge.relocation')
    : t('careerModes.location.badge.current');
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
      if (field === 'moveDate' || field === 'availableFrom') return t('careerModes.location.validation.dateInvalid');
      if (field === 'remoteRegion') return t('careerModes.location.validation.remoteRegionTooLong', { max: REGION_MAX });
      return t('careerModes.location.error.saveFailed');
    }
  }
  return careerErrorMessage(error, t('careerModes.location.error.saveFailed'));
}

export function locationDeleteError(error: unknown): string {
  return careerErrorMessage(error, t('careerModes.location.error.deleteFailed'));
}

// ---------------------------------------------------------------------------
// Specialist modes

export interface SpecialistModeOption {
  id: SpecialistMode;
  name: string;
  description: string;
}

function localizedMode(id: SpecialistMode): SpecialistModeOption {
  const base = `careerModes.specialist.modes.${id}`;
  // A mode added to the shared package without translations keeps its English text.
  if (!hasKey(`${base}.name`)) return { id, name: SPECIALIST_MODES[id].name, description: SPECIALIST_MODES[id].description };
  return { id, name: t(`${base}.name`), description: t(`${base}.description`) };
}

/** The nine spec modes in the shared package's order, in the current language. */
export function specialistModeOptions(): SpecialistModeOption[] {
  return SPECIALIST_MODE_IDS.map(localizedMode);
}

/** The saved selection, primary first; rows from older clients only carry `mode`. */
export function savedModes(saved: Pick<CandidateSpecialistMode, 'mode' | 'modes'> | undefined): SpecialistMode[] {
  if (!saved) return [];
  const raw = Array.isArray(saved.modes) && saved.modes.length > 0 ? saved.modes : saved.mode ? [saved.mode] : [];
  const out: SpecialistMode[] = [];
  for (const mode of raw) if (isSpecialistMode(mode) && !out.includes(mode)) out.push(mode);
  return out.slice(0, MAX_MODES);
}

/**
 * Adds or removes one mode. Adding past the maximum returns the selection
 * unchanged (the screen disables those choices and says why).
 */
export function toggleMode(selected: SpecialistMode[], mode: SpecialistMode): SpecialistMode[] {
  if (selected.includes(mode)) return selected.filter((m) => m !== mode);
  if (selected.length >= MAX_MODES) return selected;
  return [...selected, mode];
}

export function modesEqual(a: SpecialistMode[], b: SpecialistMode[]): boolean {
  return a.length === b.length && a.every((mode, i) => mode === b[i]);
}

/** The checklist for the selected situations (shared ids, translated here). */
export function modeChecklist(modes: SpecialistMode[]): { mode: SpecialistMode; id: string; label: string }[] {
  const out: { mode: SpecialistMode; id: string; label: string }[] = [];
  for (const mode of modes) {
    for (const id of SPECIALIST_MODES[mode].checklist) {
      const key = `careerModes.specialist.checklist.${id}`;
      out.push({ mode, id, label: hasKey(key) ? t(key) : id.replace(/_/g, ' ') });
    }
  }
  return out;
}

/** Search filters the opportunity search may preselect; information only, the person can change them. */
export function modeFilterLabels(modes: SpecialistMode[]): string[] {
  const out: string[] = [];
  for (const mode of modes) {
    for (const suggestion of SPECIALIST_MODES[mode].suggestedFilters) {
      const key = `careerModes.specialist.filters.${suggestion.filter}_${suggestion.value}`;
      const label = hasKey(key) ? t(key) : suggestion.value;
      if (!out.includes(label)) out.push(label);
    }
  }
  return out;
}

export function isPlanUpgradeRequired(error: unknown): boolean {
  return error instanceof ApiError && error.code === 'plan_upgrade_required';
}

export function specialistSaveError(error: unknown): string {
  if (isPlanUpgradeRequired(error)) return t('careerModes.specialist.upgradeRequired');
  if (error instanceof ApiError && error.code === 'validation_error') {
    const field = (error.body as { field?: unknown }).field;
    if (field === 'modes' || field === 'mode') return t('careerModes.specialist.pick', { max: MAX_MODES });
    return t('careerModes.specialist.guidelinesTooLong', { max: GUIDELINES_MAX });
  }
  return careerErrorMessage(error, t('careerModes.specialist.saveFailed'));
}

/** null for empty guidelines, as the website sends. */
export function guidelinesForSave(text: string): string | null {
  return text.trim() || null;
}
