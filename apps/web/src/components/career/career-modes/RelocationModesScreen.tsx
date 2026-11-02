'use client';

import { useCallback, useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import {
  isApiError,
  type ApiClient,
  type CandidateSpecialistMode,
  type LocationProfile,
  type SpecialistMode,
  type TargetTimeline,
  type WorkAuthorization,
  type RemoteFlexibility,
} from '@flacroncv/career-api-client';
import { SPECIALIST_MODES } from '@flacroncv/career-shared';
import {
  Badge,
  Button,
  Card,
  EmptyState,
  LoadingState,
  PermissionDeniedState,
  ProviderUnavailableState,
} from '@/components/career/ui';
import type { SignedInUser } from '@/lib/career/auth-gateway';
import { profileLoadFailure } from '@/lib/career/profile-load';

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
  const [load, setLoad] = useState<'loading' | 'permission' | 'unavailable' | 'signed-out' | 'ready'>('loading');
  const [activeTab, setActiveTab] = useState<'locations' | 'specialist'>('locations');
  
  // Locations State
  const [locations, setLocations] = useState<LocationProfile[]>([]);
  const [capacity, setCapacity] = useState<number>(1);
  const [allowedRadiusMiles, setAllowedRadiusMiles] = useState<number>(25);
  const [isAddingLocation, setIsAddingLocation] = useState(false);
  const [place, setPlace] = useState('');
  const [radiusMiles, setRadiusMiles] = useState(25);
  const [targetTimeline, setTargetTimeline] = useState<TargetTimeline>('exploring');
  const [isRelocation, setIsRelocation] = useState(false);
  const [workAuth, setWorkAuth] = useState<WorkAuthorization>('authorized');
  const [commuteMinutes, setCommuteMinutes] = useState(45);
  const [remoteFlex, setRemoteFlex] = useState<RemoteFlexibility>('hybrid');
  const [notes, setNotes] = useState('');
  const [submittingLocation, setSubmittingLocation] = useState(false);

  // Specialist Mode State
  const [specialistMode, setSpecialistMode] = useState<CandidateSpecialistMode | null>(null);
  const [selectedMode, setSelectedMode] = useState<SpecialistMode>('general');
  const [customGuidelines, setCustomGuidelines] = useState('');
  const [submittingMode, setSubmittingMode] = useState(false);
  const [specialistModeUpgradeRequired, setSpecialistModeUpgradeRequired] = useState(false);

  // Global Error & Feedback
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    setLoad('loading');
    setErrorMessage(null);
    try {
      const locRes = await api.locations();
      setLocations(locRes.items);
      setCapacity(locRes.capacity);
      setAllowedRadiusMiles(locRes.allowedRadiusMiles);
      setRadiusMiles(locRes.allowedRadiusMiles);

      try {
        const modeRes = await api.specialistMode();
        setSpecialistMode(modeRes);
        setSelectedMode(modeRes.mode);
        setCustomGuidelines(modeRes.customGuidelines ?? '');
        setSpecialistModeUpgradeRequired(false);
      } catch (err) {
        if (isApiError(err, 'plan_upgrade_required')) {
          setSpecialistModeUpgradeRequired(true);
        }
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

  const handleCreateLocation = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!place.trim()) return;
    setSubmittingLocation(true);
    setErrorMessage(null);
    setSuccessMessage(null);

    try {
      const created = await api.createLocation({
        place: place.trim(),
        radiusMiles,
        targetTimeline,
        isRelocation,
        workAuthorization: workAuth,
        commuteMinutesMax: commuteMinutes,
        remoteFlexibility: remoteFlex,
        notes: notes.trim() || null,
      });

      setLocations((prev) => [created, ...prev]);
      setIsAddingLocation(false);
      setPlace('');
      setNotes('');
      setSuccessMessage(t('location_created_success'));
    } catch (error) {
      if (isApiError(error, 'capacity_exceeded')) {
        setErrorMessage(t('capacity_exceeded'));
      } else if (isApiError(error, 'validation_error')) {
        setErrorMessage(t('radius_limit_exceeded'));
      } else {
        setErrorMessage(t('location_save_failed'));
      }
    } finally {
      setSubmittingLocation(false);
    }
  };

  const handleDeleteLocation = async (id: string) => {
    try {
      await api.deleteLocation(id);
      setLocations((prev) => prev.filter((l) => l.id !== id));
      setSuccessMessage(t('location_deleted_success'));
    } catch {
      setErrorMessage(t('delete_failed'));
    }
  };

  const handleSaveSpecialistMode = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmittingMode(true);
    setErrorMessage(null);
    setSuccessMessage(null);

    try {
      const updated = await api.setSpecialistMode({
        mode: selectedMode,
        customGuidelines: customGuidelines.trim() || null,
      });
      setSpecialistMode(updated);
      setSuccessMessage(t('specialist_mode_saved_success'));
    } catch (error) {
      if (isApiError(error, 'plan_upgrade_required')) {
        setErrorMessage(t('specialist_mode_upgrade_required'));
      } else {
        setErrorMessage(t('specialist_mode_save_failed'));
      }
    } finally {
      setSubmittingMode(false);
    }
  };

  if (!ready || load === 'loading') return <LoadingState label={t('loading')} />;
  if (load === 'permission') return <PermissionDeniedState title={t('permission_title')} body={t('permission_body')} />;
  if (load === 'unavailable') {
    return (
      <ProviderUnavailableState
        title={t('unavailable_title')}
        body={t('unavailable_body')}
        action={
          <Button type="button" onClick={() => void loadData()}>
            {t('retry')}
          </Button>
        }
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

  return (
    <div className="mx-auto max-w-7xl space-y-8 px-4 py-8">
      {/* Page Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-career-navy dark:text-white sm:text-3xl">{t('title')}</h1>
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">{t('subtitle')}</p>
        </div>

        {/* Tab Toggle */}
        <div className="flex items-center rounded-lg border border-career-line bg-career-surface p-1">
          <button
            type="button"
            onClick={() => setActiveTab('locations')}
            className={`rounded-md px-3 py-1.5 text-xs font-semibold transition-colors ${
              activeTab === 'locations'
                ? 'bg-career-navy text-white dark:bg-career-orange'
                : 'text-career-muted hover:text-career-ink'
            }`}
          >
            {t('tab_locations')} ({locations.length}/{capacity})
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('specialist')}
            className={`rounded-md px-3 py-1.5 text-xs font-semibold transition-colors ${
              activeTab === 'specialist'
                ? 'bg-career-navy text-white dark:bg-career-orange'
                : 'text-career-muted hover:text-career-ink'
            }`}
          >
            {t('tab_specialist')}
          </button>
        </div>
      </div>

      {/* Global Alerts */}
      {errorMessage && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800 dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-300">
          {errorMessage}
        </div>
      )}
      {successMessage && (
        <div className="rounded-lg border border-green-200 bg-green-50 p-4 text-sm text-green-800 dark:border-green-900/50 dark:bg-green-950/30 dark:text-green-300">
          {successMessage}
        </div>
      )}

      {/* TAB 1: LOCATION PROFILES & RELOCATION */}
      {activeTab === 'locations' && (
        <div className="space-y-6">
          <div className="flex items-center justify-between border-b border-career-line pb-4">
            <div>
              <h2 className="text-lg font-bold text-career-ink">{t('locations_heading')}</h2>
              <p className="text-xs text-career-muted">
                {t('locations_quota_hint', {
                  used: locations.length,
                  capacity,
                  radius: allowedRadiusMiles,
                })}
              </p>
            </div>
            {!isAddingLocation && (
              <Button
                type="button"
                onClick={() => setIsAddingLocation(true)}
                disabled={locations.length >= capacity}
              >
                {t('add_location')}
              </Button>
            )}
          </div>

          {/* Location Creation Form */}
          {isAddingLocation && (
            <Card className="border-career-navy/30 bg-career-navy/5 p-6 dark:bg-career-navy/10">
              <form onSubmit={handleCreateLocation} className="space-y-4">
                <div className="flex items-center justify-between border-b border-career-line pb-3">
                  <h3 className="text-base font-bold text-career-ink">{t('form_add_location_title')}</h3>
                  <span className="text-xs font-medium text-career-muted">
                    {t('max_radius_allowed', { radius: allowedRadiusMiles })}
                  </span>
                </div>

                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div>
                    <label htmlFor="locPlace" className="block text-xs font-semibold uppercase tracking-wider text-career-ink">
                      {t('field_place')} *
                    </label>
                    <input
                      id="locPlace"
                      type="text"
                      required
                      value={place}
                      onChange={(e) => setPlace(e.target.value)}
                      placeholder={t('field_place_placeholder')}
                      className="mt-1 w-full rounded-md border border-career-line bg-career-surface px-3 py-2 text-sm text-career-ink focus:border-career-navy focus:outline-none dark:focus:border-career-orange"
                    />
                  </div>

                  <div>
                    <label htmlFor="locRadius" className="block text-xs font-semibold uppercase tracking-wider text-career-ink">
                      {t('field_radius')} ({radiusMiles} {t('miles')})
                    </label>
                    <input
                      id="locRadius"
                      type="range"
                      min="5"
                      max={allowedRadiusMiles}
                      step="5"
                      value={radiusMiles}
                      onChange={(e) => setRadiusMiles(Number(e.target.value))}
                      className="mt-2 w-full accent-career-navy dark:accent-career-orange cursor-pointer"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                  <div>
                    <label htmlFor="locTimeline" className="block text-xs font-semibold uppercase tracking-wider text-career-ink">
                      {t('field_timeline')}
                    </label>
                    <select
                      id="locTimeline"
                      value={targetTimeline}
                      onChange={(e) => setTargetTimeline(e.target.value as TargetTimeline)}
                      className="mt-1 w-full rounded-md border border-career-line bg-career-surface px-3 py-2 text-sm text-career-ink focus:border-career-navy focus:outline-none dark:focus:border-career-orange"
                    >
                      <option value="immediate">{t('timeline_immediate')}</option>
                      <option value="1_to_3_months">{t('timeline_1_to_3_months')}</option>
                      <option value="3_to_6_months">{t('timeline_3_to_6_months')}</option>
                      <option value="exploring">{t('timeline_exploring')}</option>
                      <option value="not_relocating">{t('timeline_not_relocating')}</option>
                    </select>
                  </div>

                  <div>
                    <label htmlFor="locAuth" className="block text-xs font-semibold uppercase tracking-wider text-career-ink">
                      {t('field_work_auth')}
                    </label>
                    <select
                      id="locAuth"
                      value={workAuth}
                      onChange={(e) => setWorkAuth(e.target.value as WorkAuthorization)}
                      className="mt-1 w-full rounded-md border border-career-line bg-career-surface px-3 py-2 text-sm text-career-ink focus:border-career-navy focus:outline-none dark:focus:border-career-orange"
                    >
                      <option value="citizen">{t('auth_citizen')}</option>
                      <option value="permanent_resident">{t('auth_permanent_resident')}</option>
                      <option value="visa_holder">{t('auth_visa_holder')}</option>
                      <option value="needs_sponsorship">{t('auth_needs_sponsorship')}</option>
                      <option value="authorized">{t('auth_authorized')}</option>
                    </select>
                  </div>

                  <div>
                    <label htmlFor="locRemote" className="block text-xs font-semibold uppercase tracking-wider text-career-ink">
                      {t('field_remote_flex')}
                    </label>
                    <select
                      id="locRemote"
                      value={remoteFlex}
                      onChange={(e) => setRemoteFlex(e.target.value as RemoteFlexibility)}
                      className="mt-1 w-full rounded-md border border-career-line bg-career-surface px-3 py-2 text-sm text-career-ink focus:border-career-navy focus:outline-none dark:focus:border-career-orange"
                    >
                      <option value="hybrid">{t('remote_hybrid')}</option>
                      <option value="remote_only">{t('remote_remote_only')}</option>
                      <option value="onsite_only">{t('remote_onsite_only')}</option>
                      <option value="any">{t('remote_any')}</option>
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div>
                    <label htmlFor="locCommute" className="block text-xs font-semibold uppercase tracking-wider text-career-ink">
                      {t('field_commute_max')} ({commuteMinutes} {t('minutes')})
                    </label>
                    <input
                      id="locCommute"
                      type="range"
                      min="15"
                      max="120"
                      step="5"
                      value={commuteMinutes}
                      onChange={(e) => setCommuteMinutes(Number(e.target.value))}
                      className="mt-2 w-full accent-career-navy dark:accent-career-orange cursor-pointer"
                    />
                  </div>

                  <div className="flex items-center gap-2 pt-6">
                    <input
                      id="isRelocation"
                      type="checkbox"
                      checked={isRelocation}
                      onChange={(e) => setIsRelocation(e.target.checked)}
                      className="h-4 w-4 rounded border-career-line text-career-navy focus:ring-career-navy"
                    />
                    <label htmlFor="isRelocation" className="text-xs font-medium text-career-ink cursor-pointer">
                      {t('field_is_relocation_label')}
                    </label>
                  </div>
                </div>

                <div>
                  <label htmlFor="locNotes" className="block text-xs font-semibold uppercase tracking-wider text-career-ink">
                    {t('field_notes')}
                  </label>
                  <textarea
                    id="locNotes"
                    rows={2}
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    placeholder={t('field_notes_placeholder')}
                    className="mt-1 w-full rounded-md border border-career-line bg-career-surface px-3 py-2 text-sm text-career-ink focus:border-career-navy focus:outline-none dark:focus:border-career-orange"
                  />
                </div>

                <div className="flex items-center justify-end gap-3 pt-2">
                  <Button type="button" variant="secondary" onClick={() => setIsAddingLocation(false)}>
                    {t('cancel')}
                  </Button>
                  <Button type="submit" disabled={submittingLocation || !place.trim()}>
                    {submittingLocation ? t('saving') : t('save_location')}
                  </Button>
                </div>
              </form>
            </Card>
          )}

          {/* Locations List */}
          {locations.length === 0 ? (
            <EmptyState
              title={t('no_locations_title')}
              body={t('no_locations_body')}
              action={
                <Button type="button" onClick={() => setIsAddingLocation(true)}>
                  {t('add_location')}
                </Button>
              }
            />
          ) : (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {locations.map((loc) => (
                <Card key={loc.id} className="p-5 flex flex-col justify-between">
                  <div className="space-y-3">
                    <div className="flex items-start justify-between gap-2">
                      <h3 className="font-bold text-career-ink text-base">{loc.place}</h3>
                      <Badge tone={loc.isRelocation ? 'recommended' : 'neutral'}>
                        {loc.isRelocation ? t('relocation_target') : t('current_area')}
                      </Badge>
                    </div>

                    <div className="space-y-1.5 text-xs text-career-muted">
                      <p>
                        <span className="font-semibold text-career-ink">{t('radius')}:</span> ~{loc.radiusMiles} {t('miles')}
                      </p>
                      <p>
                        <span className="font-semibold text-career-ink">{t('timeline')}:</span>{' '}
                        {t(`timeline_${loc.targetTimeline}`)}
                      </p>
                      <p>
                        <span className="font-semibold text-career-ink">{t('work_auth')}:</span>{' '}
                        {t(`auth_${loc.workAuthorization}`)}
                      </p>
                      <p>
                        <span className="font-semibold text-career-ink">{t('commute')}:</span> ≤ {loc.commuteMinutesMax}{' '}
                        {t('minutes')} • {t(`remote_${loc.remoteFlexibility}`)}
                      </p>
                      {loc.notes && (
                        <p className="mt-2 rounded bg-career-wash p-2 text-career-ink/80 italic">"{loc.notes}"</p>
                      )}
                    </div>
                  </div>

                  <div className="mt-4 pt-3 border-t border-career-line flex justify-end">
                    <Button
                      type="button"
                      variant="secondary"
                      onClick={() => void handleDeleteLocation(loc.id)}
                    >
                      {t('delete')}
                    </Button>
                  </div>
                </Card>
              ))}
            </div>
          )}
        </div>
      )}

      {/* TAB 2: SPECIALIST CAREER MODES */}
      {activeTab === 'specialist' && (
        <div className="space-y-6">
          <div className="border-b border-career-line pb-4">
            <h2 className="text-lg font-bold text-career-ink">{t('specialist_heading')}</h2>
            <p className="text-xs text-career-muted">{t('specialist_subtitle')}</p>
          </div>

          {specialistModeUpgradeRequired ? (
            <Card className="border-career-orange/30 bg-career-orange/5 p-6 text-center dark:bg-career-orange/10">
              <h3 className="text-base font-bold text-career-ink">{t('upgrade_required_heading')}</h3>
              <p className="mt-1 text-xs text-career-muted max-w-md mx-auto">
                {t('upgrade_required_body')}
              </p>
              <div className="mt-4">
                <a href="/career/plans" className="btn-primary min-h-career-touch inline-flex items-center px-4 py-2 font-medium">
                  {t('view_plans')}
                </a>
              </div>
            </Card>
          ) : (
            <form onSubmit={handleSaveSpecialistMode} className="space-y-6">
              {/* Specialist Modes Grid */}
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {Object.values(SPECIALIST_MODES).map((mode) => {
                  const isSelected = selectedMode === mode.id;
                  return (
                    <button
                      key={mode.id}
                      type="button"
                      onClick={() => setSelectedMode(mode.id)}
                      className={`text-left rounded-lg border p-5 transition-all flex flex-col justify-between ${
                        isSelected
                          ? 'border-career-navy bg-career-navy/5 shadow-sm dark:border-career-orange dark:bg-career-orange/10 ring-2 ring-career-navy dark:ring-career-orange'
                          : 'border-career-line bg-career-surface hover:bg-career-wash'
                      }`}
                    >
                      <div className="space-y-2">
                        <div className="flex items-center justify-between">
                          <h4 className="font-bold text-career-ink text-sm">{mode.name}</h4>
                          {isSelected && <Badge tone="confirmed">{t('active')}</Badge>}
                        </div>
                        <p className="text-xs text-career-muted">{mode.description}</p>
                      </div>

                      <div className="mt-4 pt-3 border-t border-career-line space-y-1">
                        <p className="text-[10px] font-semibold uppercase tracking-wider text-career-muted">
                          {t('recommended_focus')}:
                        </p>
                        <div className="flex flex-wrap gap-1">
                          {mode.recommendedFocus.map((f) => (
                            <span
                              key={f}
                              className="rounded bg-career-line/60 px-1.5 py-0.5 text-[10px] font-medium text-career-ink"
                            >
                              {f}
                            </span>
                          ))}
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>

              {/* Guidelines Customization */}
              <Card className="p-6 space-y-4">
                <h3 className="text-base font-bold text-career-ink">{t('custom_guidelines_title')}</h3>
                <p className="text-xs text-career-muted">
                  {SPECIALIST_MODES[selectedMode]?.promptModifier}
                </p>
                <div>
                  <label htmlFor="customGuidelines" className="block text-xs font-semibold uppercase tracking-wider text-career-ink">
                    {t('field_custom_guidelines')}
                  </label>
                  <textarea
                    id="customGuidelines"
                    rows={3}
                    value={customGuidelines}
                    onChange={(e) => setCustomGuidelines(e.target.value)}
                    placeholder={t('field_custom_guidelines_placeholder')}
                    className="mt-1 w-full rounded-md border border-career-line bg-career-surface px-3 py-2 text-sm text-career-ink focus:border-career-navy focus:outline-none dark:focus:border-career-orange"
                  />
                </div>

                <div className="flex justify-end pt-2">
                  <Button type="submit" disabled={submittingMode}>
                    {submittingMode ? t('saving') : t('save_specialist_mode')}
                  </Button>
                </div>
              </Card>
            </form>
          )}
        </div>
      )}
    </div>
  );
}
