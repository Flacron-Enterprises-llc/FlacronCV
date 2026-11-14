'use client';

import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import {
  isApiError,
  type ApiClient,
  type CandidateSpecialistMode,
  type CreateLocationProfileInput,
  type LicenseTransfer,
  type LocationKind,
  type LocationProfile,
  type RemoteFlexibility,
  type SpecialistMode,
  type TargetTimeline,
  type WorkAuthorization,
} from '@flacroncv/career-api-client';
import {
  LICENSE_TRANSFERS,
  MAX_ACTIVE_MODES,
  REMOTE_FLEXIBILITIES,
  SPECIALIST_MODES,
  SPECIALIST_MODE_IDS,
  TARGET_TIMELINES,
  WORK_AUTHORIZATIONS,
  isCalendarDate,
} from '@flacroncv/career-shared';
import {
  Badge,
  Button,
  Card,
  ConfirmDialog,
  EmptyState,
  Input,
  LoadingState,
  PageHeader,
  PermissionDeniedState,
  ProviderUnavailableState,
  ScreenStack,
} from '@/components/career/ui';
import type { SignedInUser } from '@/lib/career/auth-gateway';
import { profileLoadFailure } from '@/lib/career/profile-load';

/** One editable location. Work authorization starts as "not stated": it is never assumed. */
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

export function emptyDraft(allowedRadiusMiles: number, kind: LocationKind = 'current'): LocationDraft {
  return {
    place: '',
    radiusMiles: Math.min(25, allowedRadiusMiles),
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

export function draftFrom(location: LocationProfile): LocationDraft {
  return {
    place: location.place,
    radiusMiles: location.radiusMiles,
    kind: location.kind,
    targetTimeline: location.targetTimeline,
    moveDate: location.moveDate ?? '',
    availableFrom: location.availableFrom ?? '',
    remoteRegion: location.remoteRegion ?? '',
    workAuthorization: location.workAuthorization,
    licenseTransfer: location.licenseTransfer,
    commuteMinutesMax: location.commuteMinutesMax,
    remoteFlexibility: location.remoteFlexibility,
    notes: location.notes ?? '',
  };
}

/** The first problem as a `career.career_modes` key, or null. */
export function draftProblem(draft: LocationDraft, allowedRadiusMiles: number): string | null {
  if (!draft.place.trim()) return 'place_required';
  if (draft.radiusMiles > allowedRadiusMiles) return 'radius_limit_exceeded';
  if ((draft.moveDate && !isCalendarDate(draft.moveDate)) || (draft.availableFrom && !isCalendarDate(draft.availableFrom))) return 'date_invalid';
  return null;
}

export function draftToInput(draft: LocationDraft): CreateLocationProfileInput {
  return {
    place: draft.place.trim(),
    radiusMiles: draft.radiusMiles,
    kind: draft.kind,
    targetTimeline: draft.targetTimeline,
    moveDate: draft.moveDate || null,
    availableFrom: draft.availableFrom || null,
    remoteRegion: draft.remoteRegion.trim() || null,
    workAuthorization: draft.workAuthorization,
    licenseTransfer: draft.licenseTransfer,
    commuteMinutesMax: draft.commuteMinutesMax,
    remoteFlexibility: draft.remoteFlexibility,
    notes: draft.notes.trim() || null,
  };
}

const fieldClass =
  'mt-1 w-full rounded-md border border-career-line bg-career-surface px-3 py-2 text-sm text-career-ink focus:border-career-navy focus:outline-none dark:focus:border-career-orange';
const labelClass = 'block text-xs font-semibold uppercase tracking-wider text-career-ink';

export function RelocationModesScreen({
  api,
  user,
  ready,
  signInHref,
}: {
  api: ApiClient;
  user: SignedInUser | null;
  ready: boolean;
  signInHref: string;
}) {
  const t = useTranslations('career.career_modes');
  const locale = useLocale();
  const [load, setLoad] = useState<'loading' | 'permission' | 'unavailable' | 'signed-out' | 'ready'>('loading');
  const [activeTab, setActiveTab] = useState<'locations' | 'specialist'>('locations');

  const [locations, setLocations] = useState<LocationProfile[]>([]);
  const [capacity, setCapacity] = useState<number>(1);
  const [allowedRadiusMiles, setAllowedRadiusMiles] = useState<number>(25);
  const [editing, setEditing] = useState<string | 'new' | null>(null);
  const [draft, setDraft] = useState<LocationDraft>(emptyDraft(25));
  const [deleting, setDeleting] = useState<LocationProfile | null>(null);
  // Radii are stored in miles; most interface languages read kilometres.
  const [unit, setUnit] = useState<'km' | 'mi'>(() => (locale === 'en' ? 'mi' : 'km'));
  const shown = (miles: number) => (unit === 'km' ? Math.round(miles * 1.609344) : miles);
  const unitLabel = unit === 'km' ? t('unit_km') : t('miles');

  const [modeState, setModeState] = useState<(CandidateSpecialistMode & { available?: boolean }) | null>(null);
  const [selectedModes, setSelectedModes] = useState<SpecialistMode[]>([]);
  const [customGuidelines, setCustomGuidelines] = useState('');

  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    setLoad('loading');
    setErrorMessage(null);
    try {
      const list = await api.locations();
      setLocations(list.items);
      setCapacity(list.capacity);
      setAllowedRadiusMiles(list.allowedRadiusMiles);
      try {
        const modes = await api.specialistMode();
        setModeState(modes);
        setSelectedModes(modes.modes ?? (modes.mode ? [modes.mode] : []));
        setCustomGuidelines(modes.customGuidelines ?? '');
      } catch {
        setModeState(null);
      }
      setLoad('ready');
    } catch (error) {
      const failure = profileLoadFailure(error);
      setLoad(failure === 'signed-out' ? 'signed-out' : failure === 'permission' ? 'permission' : 'unavailable');
    }
  }, [api]);

  useEffect(() => {
    if (!ready) return;
    if (!user) {
      setLoad('signed-out');
      return;
    }
    void loadData();
  }, [ready, user, loadData]);

  function startNew(kind: LocationKind) {
    setEditing('new');
    setDraft(emptyDraft(allowedRadiusMiles, kind));
    setErrorMessage(null);
    setSuccessMessage(null);
  }

  async function saveLocation(event: FormEvent) {
    event.preventDefault();
    setErrorMessage(null);
    setSuccessMessage(null);
    const problem = draftProblem(draft, allowedRadiusMiles);
    if (problem) {
      setErrorMessage(t(problem));
      return;
    }
    setSubmitting(true);
    try {
      if (editing && editing !== 'new') {
        const saved = await api.updateLocation(editing, draftToInput(draft));
        setLocations((current) => current.map((item) => (item.id === saved.id ? saved : item)));
        setSuccessMessage(t('location_updated_success'));
      } else {
        const saved = await api.createLocation(draftToInput(draft));
        setLocations((current) => [...current, saved]);
        setSuccessMessage(t('location_created_success'));
      }
      setEditing(null);
    } catch (error) {
      if (isApiError(error, 'capacity_exceeded')) setErrorMessage(t('capacity_exceeded'));
      else if (isApiError(error, 'validation_error') && error.body.field === 'radiusMiles') setErrorMessage(t('radius_limit_exceeded'));
      else if (isApiError(error, 'validation_error') && (error.body.field === 'moveDate' || error.body.field === 'availableFrom')) setErrorMessage(t('date_invalid'));
      else if (isApiError(error, 'plan_upgrade_required')) setErrorMessage(t('locations_upgrade_required'));
      else setErrorMessage(t('location_save_failed'));
    } finally {
      setSubmitting(false);
    }
  }

  async function removeLocation() {
    if (!deleting) return;
    const target = deleting;
    setDeleting(null);
    try {
      await api.deleteLocation(target.id);
      setLocations((current) => current.filter((item) => item.id !== target.id));
      setSuccessMessage(t('location_deleted_success'));
    } catch {
      setErrorMessage(t('delete_failed'));
    }
  }

  function toggleMode(mode: SpecialistMode) {
    setSelectedModes((current) => {
      if (current.includes(mode)) return current.filter((item) => item !== mode);
      if (current.length >= MAX_ACTIVE_MODES) return current;
      return [...current, mode];
    });
  }

  async function saveModes(event: FormEvent) {
    event.preventDefault();
    setSubmitting(true);
    setErrorMessage(null);
    setSuccessMessage(null);
    try {
      const updated = await api.setSpecialistMode({ modes: selectedModes, customGuidelines: customGuidelines.trim() || null });
      setModeState(updated);
      setSuccessMessage(t('specialist_mode_saved_success'));
    } catch (error) {
      setErrorMessage(isApiError(error, 'plan_upgrade_required') ? t('specialist_mode_upgrade_required') : t('specialist_mode_save_failed'));
    } finally {
      setSubmitting(false);
    }
  }

  if (!ready || load === 'loading') return <LoadingState label={t('loading')} />;
  if (load === 'permission') return <PermissionDeniedState title={t('permission_title')} body={t('permission_body')} />;
  if (load === 'unavailable') {
    return (
      <ProviderUnavailableState
        title={t('unavailable_title')}
        body={t('unavailable_body')}
        action={<Button type="button" onClick={() => void loadData()}>{t('retry')}</Button>}
      />
    );
  }
  if (load === 'signed-out') {
    return (
      <EmptyState
        title={t('signed_out_title')}
        body={t('signed_out_body')}
        action={
          <a href={signInHref} className="btn-primary min-h-career-touch inline-flex items-center px-4 py-2 font-medium">
            {t('sign_in')}
          </a>
        }
      />
    );
  }

  const date = (value: string) => new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeZone: 'UTC' }).format(new Date(`${value}T00:00:00Z`));
  const modesAvailable = modeState?.available !== false && modeState !== null;
  const groups: Array<[LocationKind, LocationProfile[]]> = [
    ['current', locations.filter((item) => item.kind === 'current')],
    ['future', locations.filter((item) => item.kind === 'future')],
  ];
  const full = locations.length >= capacity;

  return (
    <ScreenStack>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <PageHeader title={t('title')} description={t('subtitle')} />
        <label className="flex items-center gap-2 text-xs font-semibold text-career-muted">
          {t('unit_label')}
          <select
            className="h-9 rounded-md border border-career-line bg-career-surface px-2 text-sm text-career-ink"
            value={unit}
            onChange={(event) => setUnit(event.target.value === 'mi' ? 'mi' : 'km')}
          >
            <option value="km">{t('unit_km')}</option>
            <option value="mi">{t('miles')}</option>
          </select>
        </label>
      </div>

      <div className="flex w-fit items-center rounded-lg border border-career-line bg-career-surface p-1" role="tablist">
        {(['locations', 'specialist'] as const).map((tab) => (
          <button
            key={tab}
            type="button"
            role="tab"
            aria-selected={activeTab === tab}
            onClick={() => setActiveTab(tab)}
            className={`rounded-md px-3 py-1.5 text-xs font-semibold transition-colors ${
              activeTab === tab ? 'bg-career-navy text-white dark:bg-career-orange' : 'text-career-muted hover:text-career-ink'
            }`}
          >
            {tab === 'locations' ? `${t('tab_locations')} (${locations.length}/${capacity})` : t('tab_specialist')}
          </button>
        ))}
      </div>

      {errorMessage ? (
        <div role="alert" className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800 dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-300">
          {errorMessage}
        </div>
      ) : null}
      {successMessage ? (
        <div role="status" className="rounded-lg border border-green-200 bg-green-50 p-4 text-sm text-green-800 dark:border-green-900/50 dark:bg-green-950/30 dark:text-green-300">
          {successMessage}
        </div>
      ) : null}

      {activeTab === 'locations' ? (
        <div className="space-y-6">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-career-line pb-4">
            <div>
              <h2 className="text-lg font-bold text-career-ink">{t('locations_heading')}</h2>
              <p className="text-xs text-career-muted">
                {t('locations_quota_hint', { used: locations.length, capacity, radius: shown(allowedRadiusMiles), unit: unitLabel })}
              </p>
              <p className="mt-1 text-xs text-career-muted">{t('authorization_never_assumed')}</p>
            </div>
            {editing ? null : (
              <div className="flex flex-wrap gap-2">
                <Button type="button" disabled={full} onClick={() => startNew('current')}>{t('add_current')}</Button>
                <Button type="button" variant="secondary" disabled={full} onClick={() => startNew('future')}>{t('add_future')}</Button>
              </div>
            )}
          </div>

          {editing ? (
            <Card className="border-career-navy/30 bg-career-navy/5 p-6 dark:bg-career-navy/10">
              <form onSubmit={(event) => void saveLocation(event)} className="space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-career-line pb-3">
                  <h3 className="text-base font-bold text-career-ink">{editing === 'new' ? t('form_add_location_title') : t('form_edit_location_title')}</h3>
                  <span className="text-xs font-medium text-career-muted">{t('max_radius_allowed', { radius: shown(allowedRadiusMiles), unit: unitLabel })}</span>
                </div>

                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div>
                    <label htmlFor="locKind" className={labelClass}>{t('field_kind')}</label>
                    <select id="locKind" className={fieldClass} value={draft.kind} onChange={(e) => setDraft({ ...draft, kind: e.target.value as LocationKind })}>
                      <option value="current">{t('kind_current')}</option>
                      <option value="future">{t('kind_future')}</option>
                    </select>
                  </div>
                  <div>
                    <label htmlFor="locPlace" className={labelClass}>{t('field_place')} *</label>
                    <input id="locPlace" type="text" required maxLength={200} value={draft.place} onChange={(e) => setDraft({ ...draft, place: e.target.value })} placeholder={t('field_place_placeholder')} className={fieldClass} />
                  </div>
                  <div>
                    <label htmlFor="locRadius" className={labelClass}>{t('field_radius')} ({shown(draft.radiusMiles)} {unitLabel})</label>
                    <input
                      id="locRadius"
                      type="range"
                      min="0"
                      max={allowedRadiusMiles}
                      step="5"
                      value={draft.radiusMiles}
                      onChange={(e) => setDraft({ ...draft, radiusMiles: Number(e.target.value) })}
                      className="mt-2 w-full cursor-pointer accent-career-navy dark:accent-career-orange"
                    />
                  </div>
                  <div>
                    <label htmlFor="locRemoteRegion" className={labelClass}>{t('field_remote_region')}</label>
                    <input id="locRemoteRegion" type="text" maxLength={120} value={draft.remoteRegion} onChange={(e) => setDraft({ ...draft, remoteRegion: e.target.value })} placeholder={t('field_remote_region_placeholder')} className={fieldClass} />
                    <p className="mt-1 text-xs text-career-muted">{t('field_remote_region_hint')}</p>
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                  <div>
                    <label htmlFor="locTimeline" className={labelClass}>{t('field_timeline')}</label>
                    <select id="locTimeline" className={fieldClass} value={draft.targetTimeline} onChange={(e) => setDraft({ ...draft, targetTimeline: e.target.value as TargetTimeline })}>
                      {TARGET_TIMELINES.map((value) => <option key={value} value={value}>{t(`timeline_${value}`)}</option>)}
                    </select>
                  </div>
                  <Input label={t('field_move_date')} type="date" value={draft.moveDate} error={draft.moveDate && !isCalendarDate(draft.moveDate) ? t('date_invalid') : undefined} onChange={(e) => setDraft({ ...draft, moveDate: e.target.value })} />
                  <Input label={t('field_available_from')} type="date" value={draft.availableFrom} error={draft.availableFrom && !isCalendarDate(draft.availableFrom) ? t('date_invalid') : undefined} onChange={(e) => setDraft({ ...draft, availableFrom: e.target.value })} />
                </div>

                <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                  <div>
                    <label htmlFor="locAuth" className={labelClass}>{t('field_work_auth')}</label>
                    <select id="locAuth" className={fieldClass} value={draft.workAuthorization} onChange={(e) => setDraft({ ...draft, workAuthorization: e.target.value as WorkAuthorization })}>
                      {WORK_AUTHORIZATIONS.map((value) => <option key={value} value={value}>{t(`auth_${value}`)}</option>)}
                    </select>
                  </div>
                  <div>
                    <label htmlFor="locLicense" className={labelClass}>{t('field_license_transfer')}</label>
                    <select id="locLicense" className={fieldClass} value={draft.licenseTransfer} onChange={(e) => setDraft({ ...draft, licenseTransfer: e.target.value as LicenseTransfer })}>
                      {LICENSE_TRANSFERS.map((value) => <option key={value} value={value}>{t(`license_${value}`)}</option>)}
                    </select>
                  </div>
                  <div>
                    <label htmlFor="locRemote" className={labelClass}>{t('field_remote_flex')}</label>
                    <select id="locRemote" className={fieldClass} value={draft.remoteFlexibility} onChange={(e) => setDraft({ ...draft, remoteFlexibility: e.target.value as RemoteFlexibility })}>
                      {REMOTE_FLEXIBILITIES.map((value) => <option key={value} value={value}>{t(`remote_${value}`)}</option>)}
                    </select>
                  </div>
                </div>
                <p className="text-xs text-career-muted">{t('license_never_assumed')}</p>

                <div>
                  <label htmlFor="locCommute" className={labelClass}>{t('field_commute_max')} ({draft.commuteMinutesMax} {t('minutes')})</label>
                  <input
                    id="locCommute"
                    type="range"
                    min="0"
                    max="120"
                    step="5"
                    value={draft.commuteMinutesMax}
                    onChange={(e) => setDraft({ ...draft, commuteMinutesMax: Number(e.target.value) })}
                    className="mt-2 w-full cursor-pointer accent-career-navy dark:accent-career-orange"
                  />
                </div>

                <div>
                  <label htmlFor="locNotes" className={labelClass}>{t('field_notes')}</label>
                  <textarea id="locNotes" rows={2} maxLength={2000} value={draft.notes} onChange={(e) => setDraft({ ...draft, notes: e.target.value })} placeholder={t('field_notes_placeholder')} className={fieldClass} />
                </div>

                <div className="flex items-center justify-end gap-3 pt-2">
                  <Button type="button" variant="secondary" onClick={() => setEditing(null)}>{t('cancel')}</Button>
                  <Button type="submit" disabled={submitting || !draft.place.trim()}>{submitting ? t('saving') : t('save_location')}</Button>
                </div>
              </form>
            </Card>
          ) : null}

          {locations.length === 0 && !editing ? (
            <EmptyState
              title={t('no_locations_title')}
              body={t('no_locations_body')}
              action={<Button type="button" onClick={() => startNew('current')}>{t('add_current')}</Button>}
            />
          ) : (
            groups.map(([kind, items]) =>
              items.length === 0 ? null : (
                <section key={kind} className="space-y-3">
                  <h3 className="text-base font-semibold text-career-ink">{t(kind === 'current' ? 'group_current' : 'group_future')}</h3>
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                    {items.map((loc) => (
                      <Card key={loc.id} className="flex flex-col justify-between p-5">
                        <div className="space-y-3">
                          <div className="flex items-start justify-between gap-2">
                            <h4 className="text-base font-bold text-career-ink" dir="auto">{loc.place}</h4>
                            <Badge tone={loc.kind === 'future' ? 'recommended' : 'neutral'}>{loc.kind === 'future' ? t('relocation_target') : t('current_area')}</Badge>
                          </div>
                          <div className="space-y-1.5 text-xs text-career-muted">
                            <p><span className="font-semibold text-career-ink">{t('radius')}:</span> ~{shown(loc.radiusMiles)} {unitLabel}</p>
                            <p>
                              <span className="font-semibold text-career-ink">{t('remote_region')}:</span>{' '}
                              {loc.remoteRegion ? <span dir="auto">{loc.remoteRegion}</span> : t('not_stated')}
                            </p>
                            <p><span className="font-semibold text-career-ink">{t('timeline')}:</span> {t(`timeline_${loc.targetTimeline}`)}</p>
                            {loc.moveDate ? <p><span className="font-semibold text-career-ink">{t('move_date')}:</span> {date(loc.moveDate)}</p> : null}
                            {loc.availableFrom ? <p><span className="font-semibold text-career-ink">{t('available_from')}:</span> {date(loc.availableFrom)}</p> : null}
                            <p><span className="font-semibold text-career-ink">{t('work_auth')}:</span> {t(`auth_${loc.workAuthorization}`)}</p>
                            <p><span className="font-semibold text-career-ink">{t('license_transfer')}:</span> {t(`license_${loc.licenseTransfer}`)}</p>
                            <p>
                              <span className="font-semibold text-career-ink">{t('commute')}:</span> ≤ {loc.commuteMinutesMax} {t('minutes')} • {t(`remote_${loc.remoteFlexibility}`)}
                            </p>
                            {loc.notes ? <p className="mt-2 rounded bg-career-wash p-2 italic text-career-ink/80" dir="auto">{loc.notes}</p> : null}
                          </div>
                        </div>
                        <div className="mt-4 flex justify-end gap-2 border-t border-career-line pt-3">
                          <Button type="button" variant="secondary" onClick={() => { setEditing(loc.id); setDraft(draftFrom(loc)); }}>{t('edit')}</Button>
                          <Button type="button" variant="secondary" onClick={() => setDeleting(loc)}>{t('delete')}</Button>
                        </div>
                      </Card>
                    ))}
                  </div>
                </section>
              ),
            )
          )}
          <ConfirmDialog
            open={deleting !== null}
            title={t('delete_title')}
            body={deleting ? t('delete_body', { place: deleting.place }) : undefined}
            confirmLabel={t('delete')}
            cancelLabel={t('cancel')}
            danger
            onConfirm={() => void removeLocation()}
            onCancel={() => setDeleting(null)}
          />
        </div>
      ) : (
        <div className="space-y-6">
          <div className="border-b border-career-line pb-4">
            <h2 className="text-lg font-bold text-career-ink">{t('specialist_heading')}</h2>
            <p className="text-xs text-career-muted">{t('specialist_subtitle')}</p>
            <p className="mt-1 text-xs text-career-muted">{t('modes_no_quota')}</p>
          </div>

          {!modesAvailable ? (
            <Card className="border-career-orange/30 bg-career-orange/5 p-6 text-center dark:bg-career-orange/10">
              <h3 className="text-base font-bold text-career-ink">{t('upgrade_required_heading')}</h3>
              <p className="mx-auto mt-1 max-w-md text-xs text-career-muted">{t('upgrade_required_body')}</p>
              <div className="mt-4">
                <a href={`/${locale}/settings/billing`} className="btn-primary min-h-career-touch inline-flex items-center px-4 py-2 font-medium">{t('view_plans')}</a>
              </div>
            </Card>
          ) : (
            <form onSubmit={(event) => void saveModes(event)} className="space-y-6">
              <p className="text-sm text-career-muted">{t('modes_pick', { max: MAX_ACTIVE_MODES })}</p>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {SPECIALIST_MODE_IDS.map((mode) => {
                  const selected = selectedModes.includes(mode);
                  return (
                    <button
                      key={mode}
                      type="button"
                      aria-pressed={selected}
                      onClick={() => toggleMode(mode)}
                      disabled={!selected && selectedModes.length >= MAX_ACTIVE_MODES}
                      className={`flex flex-col justify-between rounded-lg border p-5 text-start transition-all disabled:opacity-60 ${
                        selected
                          ? 'border-career-navy bg-career-navy/5 shadow-sm ring-2 ring-career-navy dark:border-career-orange dark:bg-career-orange/10 dark:ring-career-orange'
                          : 'border-career-line bg-career-surface hover:bg-career-wash'
                      }`}
                    >
                      <div className="space-y-2">
                        <div className="flex items-center justify-between gap-2">
                          <h4 className="text-sm font-bold text-career-ink">{t(`mode_${mode}_name`)}</h4>
                          {selected ? <Badge tone="confirmed">{t('active')}</Badge> : null}
                        </div>
                        <p className="text-xs text-career-muted">{t(`mode_${mode}_description`)}</p>
                      </div>
                    </button>
                  );
                })}
              </div>

              {selectedModes.length > 0 ? (
                <Card className="space-y-4 p-6">
                  <h3 className="text-base font-bold text-career-ink">{t('mode_checklist_heading')}</h3>
                  {selectedModes.map((mode) => (
                    <div key={mode}>
                      <h4 className="text-sm font-semibold text-career-ink">{t(`mode_${mode}_name`)}</h4>
                      <ul className="mt-1 list-disc space-y-1 ps-5 text-sm text-career-ink">
                        {SPECIALIST_MODES[mode].checklist.map((item) => <li key={item}>{t(`check_${item}`)}</li>)}
                      </ul>
                      <p className="mt-2 text-xs text-career-muted">
                        {t('suggested_filters')}{' '}
                        {SPECIALIST_MODES[mode].suggestedFilters.map((filter) => t(`filter_${filter.filter}_${filter.value}`)).join(' · ')}
                      </p>
                    </div>
                  ))}
                </Card>
              ) : null}

              <Card className="space-y-4 p-6">
                <h3 className="text-base font-bold text-career-ink">{t('custom_guidelines_title')}</h3>
                <div>
                  <label htmlFor="customGuidelines" className={labelClass}>{t('field_custom_guidelines')}</label>
                  <textarea
                    id="customGuidelines"
                    rows={3}
                    maxLength={2000}
                    value={customGuidelines}
                    onChange={(e) => setCustomGuidelines(e.target.value)}
                    placeholder={t('field_custom_guidelines_placeholder')}
                    className={fieldClass}
                  />
                </div>
                <div className="flex justify-end pt-2">
                  <Button type="submit" disabled={submitting}>{submitting ? t('saving') : t('save_specialist_mode')}</Button>
                </div>
              </Card>
            </form>
          )}
        </div>
      )}
    </ScreenStack>
  );
}
