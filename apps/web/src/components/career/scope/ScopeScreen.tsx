'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import {
  isApiError,
  newIdempotencyKey,
  type ApiClient,
  type HumanServiceList,
  type LearningLoopView,
  type MaintenanceView,
  type MapList,
  type ScenarioResult,
} from '@flacroncv/career-api-client';
import { Button, Card, EmptyState, FailedJobState, Input, LoadingState, PermissionDeniedState, PlanUpgradeState, QuotaExhaustedState } from '@/components/career/ui';
import type { SignedInUser } from '@/lib/career/auth-gateway';
import { profileLoadFailure } from '@/lib/career/profile-load';

export type ScopeMode = 'scenarios' | 'loop' | 'forms' | 'maintenance' | 'map' | 'business' | 'services' | 'recruiting' | 'developer';

const LOADED: ScopeMode[] = ['loop', 'map', 'maintenance', 'services'];

export function ScopeScreen({
  mode,
  api,
  user,
  ready,
  signInHref,
}: {
  mode: ScopeMode;
  api: ApiClient;
  user: SignedInUser | null;
  ready: boolean;
  signInHref: string;
}) {
  const t = useTranslations('career.scope');
  const [load, setLoad] = useState<'loading' | 'permission' | 'unavailable' | 'switched-off' | 'signed-out' | 'ready'>('loading');
  const [note, setNote] = useState<'upgrade' | 'quota' | 'failed' | 'closed' | 'attribution' | 'permission' | null>(null);
  const [busy, setBusy] = useState(false);
  const [scenario, setScenario] = useState<ScenarioResult | null>(null);
  const [routes, setRoutes] = useState([{ name: 'Stay', destination: 'London', wage: '' }]);
  const [report, setReport] = useState<LearningLoopView | null>(null);
  const [site, setSite] = useState('example-jobs.test');
  const [formId, setFormId] = useState<string | null>(null);
  const [formMessage, setFormMessage] = useState<string | null>(null);
  const [maintenanceView, setMaintenanceView] = useState<MaintenanceView | null>(null);
  const [goal, setGoal] = useState('');
  const [goalSaved, setGoalSaved] = useState(false);
  const [credentialName, setCredentialName] = useState('');
  const [expiresOn, setExpiresOn] = useState('');
  const [mapList, setMapList] = useState<MapList | null>(null);
  const [mapMinutes, setMapMinutes] = useState<number | null>(null);
  const [email, setEmail] = useState('');
  const [consent, setConsent] = useState(false);
  const [invited, setInvited] = useState(false);
  const [staffUser, setStaffUser] = useState('');
  const [staffAdded, setStaffAdded] = useState(false);
  const [candidateId, setCandidateId] = useState('');
  const [services, setServices] = useState<HumanServiceList | null>(null);
  const [discoverable, setDiscoverable] = useState(false);
  const [optInSaved, setOptInSaved] = useState(false);
  const [labels, setLabels] = useState<string[] | null>(null);
  const lock = useRef(false);
  const [token, setToken] = useState<string | null>(null);
  const [brand, setBrand] = useState('');
  const [attribution, setAttribution] = useState('');
  const [brandSaved, setBrandSaved] = useState(false);

  const loadData = useCallback(async () => {
    setLoad('loading');
    try {
      if (mode === 'loop') setReport(await api.learningLoop());
      if (mode === 'map') setMapList(await api.mapOpportunities());
      if (mode === 'maintenance') setMaintenanceView(await api.maintenance());
      if (mode === 'services') setServices(await api.humanServices());
      setLoad('ready');
    } catch (error) {
      // The operator switch is off for this feature: retrying cannot help.
      if (isApiError(error, 'feature_unavailable')) {
        setLoad('switched-off');
        return;
      }
      const failure = profileLoadFailure(error);
      setLoad(failure === 'signed-out' ? 'signed-out' : failure === 'permission' ? 'permission' : 'unavailable');
    }
  }, [api, mode]);

  useEffect(() => {
    if (!ready) return;
    if (!user) {
      setLoad('signed-out');
      return;
    }
    if (LOADED.includes(mode)) {
      void loadData();
      return;
    }
    setLoad('ready');
  }, [ready, user, mode, loadData]);

  function claim(): boolean {
    if (lock.current) return false;
    lock.current = true;
    setBusy(true);
    setNote(null);
    return true;
  }

  function release() {
    lock.current = false;
    setBusy(false);
  }

  function fail(error: unknown) {
    if (isApiError(error, 'plan_upgrade_required')) setNote('upgrade');
    else if (isApiError(error, 'quota_exhausted') || isApiError(error, 'capacity_exceeded')) setNote('quota');
    else if (isApiError(error, 'not_purchasable')) setNote('closed');
    else if (isApiError(error, 'permission_denied')) setNote('permission');
    else if (isApiError(error, 'validation_error') && error.body.field === 'attribution') setNote('attribution');
    else setNote('failed');
  }

  async function compare() {
    if (!claim()) return;
    setScenario(null);
    try {
      const options = routes
        .filter((route) => route.name.trim().length > 0 && route.destination.trim().length > 0)
        .slice(0, 3)
        .map((route) => ({
          name: route.name.trim(),
          destination: route.destination.trim(),
          costCents: 0,
          months: 12,
          wageCents: route.wage.trim() === '' ? null : Number(route.wage),
          source: 'user' as const,
        }));
      const paid = await api.createScenario(options, newIdempotencyKey());
      setScenario(paid.result);
    } catch (error) {
      fail(error);
    } finally {
      release();
    }
  }

  async function prepareForm() {
    if (!claim()) return;
    setFormMessage(null);
    try {
      const paid = await api.createForm(site, newIdempotencyKey());
      setFormId(paid.result.id);
    } catch (error) {
      fail(error);
    } finally {
      release();
    }
  }

  async function review() {
    if (!formId) return;
    if (!claim()) return;
    setFormMessage(null);
    try {
      const reviewed = await api.reviewForm(formId, true);
      const fill = await api.fillForm(formId);
      setFormMessage(fill.message || (reviewed.externalSubmitted ? null : reviewed.message));
    } catch (error) {
      fail(error);
    } finally {
      release();
    }
  }

  async function saveGoal() {
    if (!claim()) return;
    setGoalSaved(false);
    try {
      await api.addPromotionGoal(goal);
      setGoalSaved(true);
    } catch (error) {
      fail(error);
    } finally {
      release();
    }
  }

  async function saveCredential() {
    if (!claim()) return;
    try {
      const saved = await api.addCredential(credentialName, expiresOn);
      if (saved.due) {
        setMaintenanceView((current) =>
          current
            ? { ...current, credentials: [...current.credentials, saved] }
            : { achievements: [], promotionGoals: [], credentials: [saved] },
        );
      }
    } catch (error) {
      fail(error);
    } finally {
      release();
    }
  }

  async function saveStaff() {
    if (!claim()) return;
    setStaffAdded(false);
    try {
      await api.addStaff(staffUser, 'counselor');
      setStaffAdded(true);
    } catch (error) {
      fail(error);
    } finally {
      release();
    }
  }

  async function saveOptIn() {
    if (!claim()) return;
    setOptInSaved(false);
    try {
      await api.setRecruitingOptIn(discoverable);
      setOptInSaved(true);
    } catch (error) {
      fail(error);
    } finally {
      release();
    }
  }

  async function startMap() {
    if (!claim()) return;
    setMapMinutes(null);
    try {
      const paid = await api.startMap(newIdempotencyKey());
      setMapMinutes(paid.result.minutes);
    } catch (error) {
      fail(error);
    } finally {
      release();
    }
  }

  async function invite() {
    if (!claim()) return;
    setInvited(false);
    try {
      await api.inviteCandidate(email, consent);
      setInvited(true);
    } catch (error) {
      fail(error);
    } finally {
      release();
    }
  }

  async function openCandidate() {
    if (!claim()) return;
    try {
      await api.businessCandidate(candidateId);
    } catch (error) {
      fail(error);
    } finally {
      release();
    }
  }

  async function book(providerId: string) {
    if (!claim()) return;
    try {
      await api.bookHumanService(providerId);
    } catch (error) {
      fail(error);
    } finally {
      release();
    }
  }

  async function search() {
    if (!claim()) return;
    setLabels(null);
    try {
      const found = await api.recruitingSearch();
      setLabels(found.items.map((item) => item.label));
    } catch (error) {
      fail(error);
    } finally {
      release();
    }
  }

  async function checkout() {
    if (!claim()) return;
    try {
      await api.employerCheckout();
    } catch (error) {
      fail(error);
    } finally {
      release();
    }
  }

  async function createKey() {
    if (!claim()) return;
    setToken(null);
    try {
      const created = await api.createDeveloperKey();
      setToken(created.token);
    } catch (error) {
      fail(error);
    } finally {
      release();
    }
  }

  async function saveBrand() {
    if (!claim()) return;
    setBrandSaved(false);
    try {
      await api.setWhiteLabel(brand, attribution);
      setBrandSaved(true);
    } catch (error) {
      fail(error);
    } finally {
      release();
    }
  }

  if (!ready || load === 'loading') return <LoadingState label={t('loading')} />;
  if (load === 'permission') return <PermissionDeniedState title={t('permission_title')} body={t('permission_body')} />;
  if (load === 'switched-off') return <EmptyState title={t('off_title')} body={t('off_body')} />;
  if (load === 'unavailable') {
    return (
      <FailedJobState
        title={t('unavailable_title')}
        body={t('unavailable_body')}
        action={<Button onClick={() => void loadData()}>{t('retry')}</Button>}
      />
    );
  }
  if (load === 'signed-out' || !user) {
    return (
      <EmptyState
        title={t('signed_out_title')}
        body={t('signed_out_body')}
        action={
          <a className="inline-flex min-h-career-touch items-center rounded-md bg-career-navy px-4 text-sm font-semibold text-white" href={signInHref}>
            {t('go_sign_in')}
          </a>
        }
      />
    );
  }

  return (
    <div className="grid grid-cols-1 gap-6">
      {note === 'upgrade' ? <PlanUpgradeState title={t('upgrade_title')} body={t('upgrade_body')} /> : null}
      {note === 'quota' ? <QuotaExhaustedState title={t('quota_title')} body={t('quota_body')} /> : null}
      {note === 'failed' ? <FailedJobState title={t('failed_title')} body={t('failed_body')} /> : null}
      {note === 'closed' ? <FailedJobState title={t('closed_title')} body={t('closed_body')} /> : null}
      {note === 'permission' ? <PermissionDeniedState title={t('permission_title')} body={t('permission_body')} /> : null}
      {note === 'attribution' ? <FailedJobState title={t('attribution_title')} body={t('attribution_body')} /> : null}

      {mode === 'scenarios' ? (
        <Card>
          <h1 className="text-xl font-semibold text-career-navy">{t('scenarios_title')}</h1>
          <p className="mt-2 text-sm">{t('scenarios_help')}</p>
          <div className="mt-4 grid grid-cols-1 gap-3">
            {routes.map((route, index) => (
              <div key={index} className="grid grid-cols-1 gap-3">
                <Input
                  label={`${t('option_name')} ${index + 1}`}
                  value={route.name}
                  onChange={(event) => setRoutes((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, name: event.target.value } : item))}
                />
                <Input
                  label={`${t('destination')} ${index + 1}`}
                  value={route.destination}
                  onChange={(event) => setRoutes((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, destination: event.target.value } : item))}
                />
                <Input
                  label={`${t('wage')} ${index + 1}`}
                  value={route.wage}
                  hint={t('wage_help')}
                  onChange={(event) => setRoutes((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, wage: event.target.value } : item))}
                />
              </div>
            ))}
            <Button type="button" disabled={busy || routes.length >= 3} onClick={() => setRoutes((current) => current.length >= 3 ? current : [...current, { name: '', destination: '', wage: '' }])}>{t('add_route')}</Button>
            <Button type="button" disabled={busy} onClick={() => void compare()}>{t('compare')}</Button>
          </div>
          {scenario ? (
            <div className="mt-4">
              <p>{scenario.tradeoff}</p>
              <ul>
                {scenario.options.map((option) => (
                  <li key={option.name}>{option.wageCents === null ? t('wage_unknown') : option.name}</li>
                ))}
              </ul>
            </div>
          ) : null}
        </Card>
      ) : null}

      {mode === 'loop' && report ? (
        <Card>
          <h1 className="text-xl font-semibold text-career-navy">{t('loop_title')}</h1>
          <p className="mt-2">{report.statement}</p>
          {report.suggestion ? <p className="mt-2">{report.suggestion}</p> : null}
        </Card>
      ) : null}

      {mode === 'forms' ? (
        <Card>
          <h1 className="text-xl font-semibold text-career-navy">{t('forms_title')}</h1>
          <p className="mt-2 text-sm">{t('forms_help')}</p>
          <div className="mt-4 grid grid-cols-1 gap-3">
            <Input label={t('site')} value={site} onChange={(event) => setSite(event.target.value)} />
            <Button type="button" disabled={busy} onClick={() => void prepareForm()}>{t('preview')}</Button>
            {formId ? <Button type="button" disabled={busy} onClick={() => void review()}>{t('review')}</Button> : null}
          </div>
          {formMessage ? <p className="mt-4">{formMessage}</p> : null}
        </Card>
      ) : null}

      {mode === 'maintenance' ? (
        <Card>
          <h1 className="text-xl font-semibold text-career-navy">{t('maintenance_title')}</h1>
          <p className="mt-2 text-sm">{t('maintenance_help')}</p>
          <ul className="mt-3">
            {(maintenanceView?.credentials ?? []).filter((item) => item.due).map((item) => (
              <li key={item.id}>{t('due', { name: item.name })}</li>
            ))}
          </ul>
          <div className="mt-4 grid grid-cols-1 gap-3">
            <Input label={t('goal')} value={goal} onChange={(event) => setGoal(event.target.value)} />
            <Button type="button" disabled={busy} onClick={() => void saveGoal()}>{t('save_goal')}</Button>
            <Input label={t('credential_name')} value={credentialName} onChange={(event) => setCredentialName(event.target.value)} />
            <Input label={t('expires_on')} value={expiresOn} placeholder="YYYY-MM-DD" onChange={(event) => setExpiresOn(event.target.value)} />
            <Button type="button" disabled={busy} onClick={() => void saveCredential()}>{t('save_credential')}</Button>
          </div>
          {goalSaved ? <p className="mt-4">{t('goal_saved')}</p> : null}
        </Card>
      ) : null}

      {mode === 'map' ? (
        <Card>
          <h1 className="text-xl font-semibold text-career-navy">{t('map_title')}</h1>
          <p className="mt-2 text-sm">{t('no_tiles')}</p>
          <ul className="mt-3">
            {(mapList?.items ?? []).map((item) => (
              <li key={item.id}>{item.title}</li>
            ))}
          </ul>
          <Button type="button" className="mt-4" disabled={busy} onClick={() => void startMap()}>{t('start_map')}</Button>
          {mapMinutes !== null ? <p className="mt-4">{t('minutes', { minutes: mapMinutes })}</p> : null}
        </Card>
      ) : null}

      {mode === 'business' ? (
        <Card>
          <h1 className="text-xl font-semibold text-career-navy">{t('business_title')}</h1>
          <div className="mt-4 grid grid-cols-1 gap-3">
            <Input label={t('staff_user')} value={staffUser} onChange={(event) => setStaffUser(event.target.value)} />
            <Button type="button" disabled={busy} onClick={() => void saveStaff()}>{t('add_staff')}</Button>
            {staffAdded ? <p>{t('staff_added')}</p> : null}
            <Input label={t('email')} value={email} onChange={(event) => setEmail(event.target.value)} />
            <label className="flex min-h-career-touch items-center gap-2 text-sm">
              <input type="checkbox" checked={consent} onChange={(event) => setConsent(event.target.checked)} />
              {t('consent')}
            </label>
            <Button type="button" disabled={busy} onClick={() => void invite()}>{t('invite')}</Button>
            <Input label={t('candidate_id')} value={candidateId} onChange={(event) => setCandidateId(event.target.value)} />
            <Button type="button" disabled={busy} onClick={() => void openCandidate()}>{t('open_candidate')}</Button>
          </div>
          {invited ? <p className="mt-4">{t('invited')}</p> : null}
        </Card>
      ) : null}

      {mode === 'services' && services ? (
        <Card>
          <h1 className="text-xl font-semibold text-career-navy">{t('services_title')}</h1>
          <ul className="mt-3 space-y-3">
            {services.items.map((item) => (
              <li key={item.id}>
                <p>{item.note}</p>
                <Button type="button" className="mt-2" disabled={busy || item.bookingOpen} onClick={() => void book(item.id)}>{t('book')}</Button>
              </li>
            ))}
          </ul>
        </Card>
      ) : null}

      {mode === 'recruiting' ? (
        <Card>
          <h1 className="text-xl font-semibold text-career-navy">{t('recruiting_title')}</h1>
          <p className="mt-2 text-sm">{t('recruiting_help')}</p>
          <label className="mt-4 flex min-h-career-touch items-center gap-2 text-sm">
            <input type="checkbox" checked={discoverable} onChange={(event) => setDiscoverable(event.target.checked)} />
            {t('discoverable')}
          </label>
          <div className="mt-4 grid grid-cols-1 gap-3">
            <Button type="button" disabled={busy} onClick={() => void saveOptIn()}>{t('save_opt_in')}</Button>
            {optInSaved ? <p>{t('opt_in_saved')}</p> : null}
            <Button type="button" disabled={busy} onClick={() => void search()}>{t('search')}</Button>
            <Button type="button" disabled={busy} onClick={() => void checkout()}>{t('checkout')}</Button>
          </div>
          {labels ? (
            <ul className="mt-4">
              {labels.map((label) => (
                <li key={label}>{label}</li>
              ))}
            </ul>
          ) : null}
        </Card>
      ) : null}

      {mode === 'developer' ? (
        <Card>
          <h1 className="text-xl font-semibold text-career-navy">{t('developer_title')}</h1>
          <p className="mt-2 text-sm">{t('developer_help')}</p>
          <Button type="button" className="mt-4" disabled={busy} onClick={() => void createKey()}>{t('create_key')}</Button>
          {token ? (
            <p className="mt-4">
              {t('key_once')} <span>{token}</span>
            </p>
          ) : null}
          <div className="mt-4 grid grid-cols-1 gap-3">
            <Input label={t('brand')} value={brand} onChange={(event) => setBrand(event.target.value)} />
            <Input label={t('attribution')} value={attribution} onChange={(event) => setAttribution(event.target.value)} />
            <Button type="button" disabled={busy} onClick={() => void saveBrand()}>{t('save_brand')}</Button>
          </div>
          {brandSaved ? <p className="mt-4">{t('brand_saved')}</p> : null}
        </Card>
      ) : null}
    </div>
  );
}
