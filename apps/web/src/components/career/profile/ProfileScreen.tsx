'use client';

import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { useTranslations } from 'next-intl';
import {
  EMPTY_PREFERENCES,
  FACT_TYPES,
  PAY_PERIODS,
  SCHEDULES,
  SENIORITIES,
  WORK_ARRANGEMENTS,
  countFacts,
  validatePreferences,
} from '@flacroncv/career-shared';
import type { CareerPreferences, FactType, Locale } from '@flacroncv/career-shared';
import { fieldErrors, isApiError, type ApiClient, type Fact, type FactRevision, type ImportAllowance, type Me } from '@flacroncv/career-api-client';
import { Badge, Button, Card, EmptyState, FailedJobState, Input, LoadingState, PermissionDeniedState, ProviderUnavailableState } from '@/components/career/ui';
import type { SignedInUser } from '@/lib/career/auth-gateway';
import { extractResumeText, RESUME_UPLOAD_ACCEPT, ResumeExtractError, type ExtractedResume } from '@/lib/career/extract-resume';
import { factTitle } from '@/lib/career/fact-draft';
import { profileLoadFailure } from '@/lib/career/profile-load';
import { FactEditor } from './FactEditor';

type ImportProblem = 'failed' | 'unavailable' | null;

interface Ready {
  me: Me;
  facts: Fact[];
  allowance: ImportAllowance;
  preferences: CareerPreferences;
  profileVersion: number;
}

export function ProfileScreen({
  api,
  user,
  ready,
  locale,
  signInHref,
  extract = extractResumeText,
  onLocale,
  onResendVerification,
}: {
  api: ApiClient;
  user: SignedInUser | null;
  ready: boolean;
  locale: Locale;
  signInHref: string;
  extract?: (file: File) => Promise<ExtractedResume>;
  onLocale: (locale: Locale) => void;
  onResendVerification: () => Promise<void>;
}) {
  const t = useTranslations('career.profile');
  const [load, setLoad] = useState<'loading' | 'permission' | 'signed-out' | 'unavailable' | 'ready'>('loading');
  const [data, setData] = useState<Ready | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [newType, setNewType] = useState<FactType>('experience');
  const [pending, setPending] = useState(false);
  const [importProblem, setImportProblem] = useState<ImportProblem>(null);
  const [extractError, setExtractError] = useState<string | null>(null);
  const [missingImport, setMissingImport] = useState<FactType[] | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [serverErrors, setServerErrors] = useState<Array<{ field: string; reason: string }>>([]);
  const [revisions, setRevisions] = useState<FactRevision[] | null>(null);
  const [prefError, setPrefError] = useState<string | null>(null);

  const loadProfile = useCallback(async () => {
    setLoad('loading');
    try {
      const [me, facts, profile, allowance] = await Promise.all([
        api.me(),
        api.facts(),
        api.profile(),
        api.importAllowance(),
      ]);
      setData({
        me,
        facts: facts.items,
        allowance,
        preferences: profile.preferences,
        profileVersion: facts.profileVersion || profile.version,
      });
      setSelectedId((current) => current ?? facts.items[0]?.id ?? null);
      setLoad('ready');
    } catch (error) {
      const failure = profileLoadFailure(error);
      setLoad(failure === 'signed-out' ? 'signed-out' : failure);
    }
  }, [api]);

  useEffect(() => {
    if (!ready) return;
    if (!user) {
      setLoad('signed-out');
      return;
    }
    void loadProfile();
  }, [ready, user, loadProfile]);

  if (!ready || load === 'loading') return <LoadingState label={t('loading')} />;
  if (load === 'permission') return <PermissionDeniedState title={t('permission_title')} body={t('permission_body')} />;
  if (load === 'unavailable') {
    return (
      <ProviderUnavailableState
        title={t('unavailable_title')}
        body={t('unavailable_body')}
        action={
          <Button type="button" onClick={() => void loadProfile()}>
            {t('retry')}
          </Button>
        }
      />
    );
  }
  if (load === 'signed-out' || !data || !user) {
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
  const counts = countFacts(data.facts);
  const selected = data.facts.find((fact) => fact.id === selectedId) ?? null;
  const experiences = data.facts.filter((fact) => fact.factType === 'experience');

  function replaceFact(next: Fact) {
    setData((current) =>
      current ? { ...current, facts: current.facts.map((fact) => (fact.id === next.id ? next : fact)) } : current,
    );
    setRevisions(null);
    setServerErrors([]);
  }

  async function addFact() {
    setPending(true);
    try {
      const created = await api.createFact({ factType: newType, value: {} });
      setData((current) => (current ? { ...current, facts: [...current.facts, created] } : current));
      setSelectedId(created.id);
    } catch (error) {
      setServerErrors(fieldErrors(error));
    } finally {
      setPending(false);
    }
  }

  async function save(patch: Partial<Fact['value']>) {
    if (!selected) return;
    setPending(true);
    try {
      replaceFact(await api.updateFact(selected.id, patch));
    } catch (error) {
      setServerErrors(fieldErrors(error));
    } finally {
      setPending(false);
    }
  }

  async function confirm(patch: Partial<Fact['value']> | null) {
    if (!selected) return;
    setPending(true);
    try {
      const saved = patch ? await api.updateFact(selected.id, patch) : selected;
      replaceFact(await api.confirmFact(saved.id));
    } catch (error) {
      setServerErrors(fieldErrors(error));
    } finally {
      setPending(false);
    }
  }

  async function remove() {
    if (!selected || !data) return;
    const facts = data.facts;
    setPending(true);
    try {
      await api.deleteFact(selected.id);
      const remaining = facts.filter((fact) => fact.id !== selected.id);
      setData((current) => (current ? { ...current, facts: remaining } : current));
      setSelectedId(remaining[0]?.id ?? null);
    } finally {
      setPending(false);
    }
  }

  async function runImport() {
    if (!file || !data) return;
    const allowance = data.allowance;
    setPending(true);
    setImportProblem(null);
    setExtractError(null);
    setMissingImport(null);
    try {
      const extracted = await extract(file);
      const result = await api.importResume({ text: extracted.text, fileName: file.name, format: extracted.format });
      setData((current) =>
        current
          ? {
              ...current,
              facts: [...current.facts, ...result.facts],
              allowance: { ...current.allowance, remaining: result.importsRemaining, resetsAt: result.resetsAt },
            }
          : current,
      );
      setSelectedId(result.facts[0]?.id ?? selectedId);
      setMissingImport(result.missing);
      setFile(null);
    } catch (error) {
      if (error instanceof ResumeExtractError) {
        setExtractError(t(`extract_${error.code}`));
      } else if (isApiError(error, 'provider_unavailable')) {
        setImportProblem('unavailable');
      } else if (isApiError(error, 'import_daily_limit')) {
        const limit = typeof error.body.limit === 'number' ? error.body.limit : allowance.limit;
        const resetsAt = typeof error.body.resetsAt === 'string' ? error.body.resetsAt : allowance.resetsAt;
        setData((current) => (current ? { ...current, allowance: { ...current.allowance, limit, remaining: 0, resetsAt } } : current));
      } else {
        setImportProblem('failed');
      }
    } finally {
      setPending(false);
    }
  }

  async function savePreferences(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const next = preferencesFromForm(form);
    const checked = validatePreferences(next);
    if (!checked.ok) {
      setPrefError(checked.errors[0]?.field ?? 'preferences');
      return;
    }
    setPrefError(null);
    setPending(true);
    try {
      const saved = await api.setPreferences(checked.value);
      setData((current) => (current ? { ...current, preferences: saved.preferences, profileVersion: saved.version } : current));
    } catch (error) {
      const fields = fieldErrors(error);
      setPrefError(fields[0]?.field ?? 'preferences');
    } finally {
      setPending(false);
    }
  }

  const importCard = (
    <Card>
      <h2 className="text-lg font-semibold text-career-ink">{t('import_title')}</h2>
      <p className="mt-2 text-sm text-career-muted">{t('import_free')}</p>
      {data.allowance.remaining <= 0 ? (
        <p className="mt-2 text-sm text-career-ink" role="status">
          {t('import_limit', { limit: data.allowance.limit, date: data.allowance.resetsAt.slice(0, 10) })}
        </p>
      ) : (
        <div className="mt-3 flex flex-col gap-3">
          <p className="text-sm text-career-ink">{t('import_remaining', { count: data.allowance.remaining })}</p>
          <label className="flex flex-col gap-1 text-sm font-semibold text-career-ink">
            {t('import_file')}
            <input
              type="file"
              accept={RESUME_UPLOAD_ACCEPT}
              className="block w-full text-sm font-normal"
              onChange={(event) => setFile(event.target.files?.[0] ?? null)}
            />
          </label>
          {extractError ? (
            <p role="alert" className="text-sm text-career-danger">
              {extractError}
            </p>
          ) : null}
          <Button type="button" disabled={file === null} loading={pending} loadingLabel={t('saving')} onClick={() => void runImport()}>
            {t('import_submit')}
          </Button>
        </div>
      )}
      {missingImport && missingImport.length > 0 ? (
        <p className="mt-3 text-sm text-career-muted" role="status">
          {t('missing_sections', { sections: missingImport.map((type) => t(`types.${type}`)).join(', ') })}
        </p>
      ) : null}
    </Card>
  );

  const addControl = (
    <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
      <label className="flex flex-1 flex-col gap-1 text-sm font-semibold text-career-ink">
        {t('new_type')}
        <select
          className="h-11 rounded-md border border-career-line bg-career-surface px-3 text-base font-normal"
          value={newType}
          onChange={(event) => {
            const next = FACT_TYPES.find((type) => type === event.target.value);
            if (next) setNewType(next);
          }}
        >
          {FACT_TYPES.map((type) => (
            <option key={type} value={type}>
              {t(`types.${type}`)}
            </option>
          ))}
        </select>
      </label>
      <Button type="button" onClick={() => void addFact()}>
        {t('add_fact')}
      </Button>
    </div>
  );

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-balance text-2xl font-bold text-career-ink">{t('title')}</h1>
      <p className="max-w-2xl text-pretty text-sm text-career-muted">
        {t('counts', { confirmed: counts.confirmed, draft: counts.draft })}
        {counts.missingCore.length > 0
          ? ` ${t('missing_core', { sections: counts.missingCore.map((type) => t(`types.${type}`)).join(', ') })}`
          : ''}
      </p>
      {user.emailVerified ? null : (
        <Card>
          <p className="text-sm text-career-ink">{t('verify_banner')}</p>
          <Button type="button" variant="secondary" className="mt-3" onClick={() => void onResendVerification()}>
            {t('resend_verification')}
          </Button>
        </Card>
      )}
      {data.me.legal.needsAcceptance ? (
        <Card>
          <h2 className="text-lg font-semibold text-career-ink">{t('legal_title')}</h2>
          <p className="mt-2 text-sm text-career-muted">{t('legal_body')}</p>
          <Button
            type="button"
            className="mt-3"
            onClick={() =>
              void api.acceptLegal(data.me.legal.required).then((legal) =>
                setData((current) => (current ? { ...current, me: { ...current.me, legal } } : current)),
              )
            }
          >
            {t('legal_accept')}
          </Button>
        </Card>
      ) : null}
      {importProblem === 'failed' ? <FailedJobState title={t('import_failed_title')} body={t('import_failed_body')} /> : null}
      {importProblem === 'unavailable' ? (
        <ProviderUnavailableState title={t('import_unavailable_title')} body={t('import_unavailable_body')} />
      ) : null}
      {importCard}
      {data.facts.length === 0 ? (
        <EmptyState title={t('empty_title')} body={t('empty_body')} action={addControl} />
      ) : (
        <div data-testid="profile-layout" className="grid grid-cols-1 gap-4 lg:grid-cols-[16rem_minmax(0,1fr)]">
          <div className="flex flex-col gap-2">
            {addControl}
            <ul className="flex flex-col gap-2">
              {data.facts.map((fact) => {
                const name = factTitle(fact.factType, fact.value) || t(`types.${fact.factType}`);
                const current = fact.id === selected?.id;
                return (
                  <li key={fact.id}>
                    <button
                      type="button"
                      aria-current={current ? 'true' : undefined}
                      onClick={() => {
                        setSelectedId(fact.id);
                        setRevisions(null);
                        setServerErrors([]);
                      }}
                      className={`flex min-h-career-touch w-full items-center justify-between gap-2 rounded-md border px-3 text-start text-sm font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-career-orange-text ${
                        current ? 'border-career-navy bg-career-wash text-career-ink' : 'border-career-line bg-career-surface text-career-ink'
                      }`}
                    >
                      <span className="truncate">{name}</span>
                      <span className="text-xs text-career-muted">{t(`status_${fact.confirmation}`)}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
          <Card>
            {selected ? (
              <FactEditor
                fact={selected}
                experiences={experiences}
                pending={pending}
                revisions={revisions}
                serverErrors={serverErrors}
                onSave={save}
                onConfirm={confirm}
                onDelete={remove}
                onHistory={() =>
                  void api.factRevisions(selected.id).then((result) => setRevisions(result.items))
                }
              />
            ) : null}
          </Card>
        </div>
      )}
      <PreferencesForm key={data.profileVersion} value={data.preferences} errorField={prefError} onSubmit={savePreferences} />
      <Card>
        <h2 className="text-lg font-semibold text-career-ink">{t('language')}</h2>
        <div className="mt-3 flex flex-wrap gap-2">
          {(['en', 'fr'] as const).map((code) => (
            <Button key={code} type="button" variant={locale === code ? 'primary' : 'secondary'} onClick={() => onLocale(code)}>
              {t(`locale_${code}`)}
            </Button>
          ))}
        </div>
      </Card>
      <Card>
        <div className="flex items-center gap-2">
          <h2 className="text-lg font-semibold text-career-ink">{t('later_sharing')}</h2>
          <Badge tone="later">{t('later')}</Badge>
        </div>
        <p className="mt-2 text-sm text-career-muted">{t('later_sharing_body')}</p>
      </Card>
      <Card>
        <div className="flex items-center gap-2">
          <h2 className="text-lg font-semibold text-career-ink">{t('later_mode')}</h2>
          <Badge tone="later">{t('later')}</Badge>
        </div>
        <p className="mt-2 text-sm text-career-muted">{t('later_mode_body')}</p>
      </Card>
    </div>
  );
}

function preferencesFromForm(form: FormData): CareerPreferences {
  const list = (key: string) =>
    String(form.get(key) ?? '')
      .split(',')
      .map((item) => item.trim())
      .filter((item) => item.length > 0);
  const checked = <T extends string>(allowed: readonly T[], key: string): T[] => {
    const picked: T[] = [];
    for (const item of form.getAll(key)) {
      if (typeof item !== 'string') continue;
      const match = allowed.find((entry) => entry === item);
      if (match) picked.push(match);
    }
    return picked;
  };
  const seniorityRaw = String(form.get('seniority') ?? '');
  const seniority = SENIORITIES.find((item) => item === seniorityRaw) ?? null;
  const periodRaw = String(form.get('period') ?? 'year');
  const period = PAY_PERIODS.find((item) => item === periodRaw) ?? 'year';
  const amountText = String(form.get('amount') ?? '').trim();
  const currency = String(form.get('currency') ?? '').trim().toUpperCase();
  const hoursText = String(form.get('hours') ?? '').trim();
  const goals = String(form.get('goals') ?? '').trim();
  return {
    targetRoles: list('targetRoles'),
    locations: list('locations'),
    arrangements: checked(WORK_ARRANGEMENTS, 'arrangements'),
    schedules: checked(SCHEDULES, 'schedules'),
    seniority,
    minimumPay:
      amountText.length === 0
        ? null
        : { amount: Number(amountText), currency, period },
    learningHoursPerWeek: hoursText.length === 0 ? null : Number(hoursText),
    careerGoals: goals.length === 0 ? null : goals,
  };
}

function PreferencesForm({
  value,
  errorField,
  onSubmit,
}: {
  value: CareerPreferences;
  errorField: string | null;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}) {
  const t = useTranslations('career.profile');
  const initial = { ...EMPTY_PREFERENCES, ...value };
  return (
    <Card>
      <h2 className="text-lg font-semibold text-career-ink">{t('preferences_title')}</h2>
      <form onSubmit={onSubmit} className="mt-4 flex flex-col gap-4">
        <Input name="targetRoles" label={t('target_roles')} hint={t('list_hint')} defaultValue={initial.targetRoles.join(', ')} />
        <Input name="locations" label={t('locations')} hint={t('list_hint')} defaultValue={initial.locations.join(', ')} />
        <fieldset className="flex flex-col gap-2">
          <legend className="text-sm font-semibold text-career-ink">{t('arrangements')}</legend>
          {WORK_ARRANGEMENTS.map((item) => (
            <label key={item} className="flex min-h-career-touch items-center gap-2 text-sm">
              <input type="checkbox" name="arrangements" value={item} defaultChecked={initial.arrangements.includes(item)} />
              {t(`arrangement_${item}`)}
            </label>
          ))}
        </fieldset>
        <fieldset className="flex flex-col gap-2">
          <legend className="text-sm font-semibold text-career-ink">{t('schedules')}</legend>
          {SCHEDULES.map((item) => (
            <label key={item} className="flex min-h-career-touch items-center gap-2 text-sm">
              <input type="checkbox" name="schedules" value={item} defaultChecked={initial.schedules.includes(item)} />
              {t(`schedule_${item}`)}
            </label>
          ))}
        </fieldset>
        <label className="flex flex-col gap-1 text-sm font-semibold text-career-ink">
          {t('seniority')}
          <select name="seniority" defaultValue={initial.seniority ?? ''} className="h-11 rounded-md border border-career-line bg-career-surface px-3 font-normal">
            <option value="">{t('seniority_none')}</option>
            {SENIORITIES.map((item) => (
              <option key={item} value={item}>
                {t(`seniority_${item}`)}
              </option>
            ))}
          </select>
        </label>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <Input name="amount" label={t('minimum_pay')} inputMode="numeric" defaultValue={initial.minimumPay?.amount ?? ''} />
          <Input name="currency" label={t('currency')} defaultValue={initial.minimumPay?.currency ?? ''} />
          <label className="flex flex-col gap-1 text-sm font-semibold text-career-ink">
            {t('period')}
            <select name="period" defaultValue={initial.minimumPay?.period ?? 'year'} className="h-11 rounded-md border border-career-line bg-career-surface px-3 font-normal">
              {PAY_PERIODS.map((item) => (
                <option key={item} value={item}>
                  {t(`period_${item}`)}
                </option>
              ))}
            </select>
          </label>
        </div>
        <Input name="hours" label={t('learning_hours')} inputMode="numeric" defaultValue={initial.learningHoursPerWeek ?? ''} />
        <label className="flex flex-col gap-1 text-sm font-semibold text-career-ink">
          {t('career_goals')}
          <textarea name="goals" rows={3} defaultValue={initial.careerGoals ?? ''} className="rounded-md border border-career-line bg-career-surface px-3 py-2 font-normal" />
        </label>
        {errorField ? (
          <p role="alert" className="text-sm text-career-danger">
            {t('preference_error', { field: errorField })}
          </p>
        ) : null}
        <Button type="submit">{t('save_preferences')}</Button>
      </form>
    </Card>
  );
}
