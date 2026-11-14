'use client';

import { useCallback, useEffect, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { isApiError, newIdempotencyKey, type ApiClient, type MatchResult, type OpportunityDetail, type Resume } from '@flacroncv/career-api-client';
import { isStaleListing, matchLabel } from '@flacroncv/career-shared';
import {
  Badge,
  Button,
  Card,
  EmptyState,
  InlineNote,
  LoadingState,
  PageHeader,
  PermissionDeniedState,
  PlanUpgradeState,
  ProviderUnavailableState,
  ScreenStack,
  StaleSourceState,
} from '@/components/career/ui';
import type { SignedInUser } from '@/lib/career/auth-gateway';
import { profileLoadFailure } from '@/lib/career/profile-load';
import { findTrackedJob, v1JobFromOpportunity, v1JobTracker, type JobTracker } from '@/lib/career/v1-jobs';
import { FieldSelect } from './FieldSelect';
import { ListingTrustPanel } from './ListingTrustPanel';
import { ListingFacts } from './ListingFacts';

type CompareNote = 'no_resume' | 'failed' | 'quota' | 'upgrade' | null;
type TrackState = { kind: 'idle' } | { kind: 'busy' } | { kind: 'added' } | { kind: 'already' } | { kind: 'failed' };

export function OpportunityDetailScreen({
  api,
  user,
  ready,
  signInHref,
  opportunityId,
  nowMs = Date.now(),
  tracker = v1JobTracker,
}: {
  api: ApiClient;
  user: SignedInUser | null;
  ready: boolean;
  signInHref: string;
  opportunityId: string;
  nowMs?: number;
  /** V1 Jobs tracker; tests pass a fake. */
  tracker?: JobTracker;
}) {
  const t = useTranslations('career.opportunities');
  const locale = useLocale();
  const [load, setLoad] = useState<'loading' | 'permission' | 'unavailable' | 'missing' | 'signed-out' | 'ready'>('loading');
  const [item, setItem] = useState<OpportunityDetail | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [resumes, setResumes] = useState<Resume[] | null>(null);
  const [resumeChoice, setResumeChoice] = useState('');
  const [match, setMatch] = useState<MatchResult | null>(null);
  const [compareNote, setCompareNote] = useState<CompareNote>(null);
  const [upgradePlan, setUpgradePlan] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [track, setTrack] = useState<TrackState>({ kind: 'idle' });

  const loadItem = useCallback(async () => {
    setLoad('loading');
    try {
      setItem(await api.opportunity(opportunityId));
      setLoad('ready');
    } catch (error) {
      if (isApiError(error, 'not_found')) {
        setLoad('missing');
        return;
      }
      const failure = profileLoadFailure(error);
      setLoad(failure === 'signed-out' ? 'signed-out' : failure === 'permission' ? 'permission' : 'unavailable');
    }
  }, [api, opportunityId]);

  useEffect(() => {
    if (!ready) return;
    if (!user) {
      setLoad('signed-out');
      return;
    }
    void loadItem();
  }, [ready, user, loadItem]);

  /** Opens the confirmation and lists the résumés the person can compare, so they choose which one. */
  async function startCompare() {
    setCompareNote(null);
    setConfirming(true);
    if (resumes !== null) return;
    try {
      const list = (await api.resumes()).items.filter((resume) => resume.currentVersionId);
      setResumes(list);
      setResumeChoice(list[0]?.currentVersionId ?? '');
      if (list.length === 0) setCompareNote('no_resume');
    } catch {
      setCompareNote('failed');
    }
  }

  async function compare() {
    if (!item) return;
    setCompareNote(null);
    if (!resumeChoice) {
      setCompareNote('no_resume');
      return;
    }
    try {
      const paid = await api.createMatch({ opportunityId: item.id, resumeVersionId: resumeChoice, mode: 'explicit' }, newIdempotencyKey());
      setMatch(paid.match);
      setItem({
        ...item,
        resumeAnalysis: {
          ...item.resumeAnalysis,
          includedRemaining: paid.usage.includedRemaining,
          packRemaining: paid.usage.packRemaining,
        },
      });
      setConfirming(false);
    } catch (error) {
      if (isApiError(error, 'quota_exhausted')) setCompareNote('quota');
      else if (isApiError(error, 'plan_upgrade_required') || isApiError(error, 'feature_unavailable')) {
        setCompareNote('upgrade');
        setUpgradePlan(typeof error.body.minimumPlan === 'string' ? error.body.minimumPlan : null);
      } else setCompareNote('failed');
    }
  }

  async function toggleSave() {
    if (!item) return;
    setSaving(true);
    try {
      if (item.saved) await api.unsaveOpportunity(item.id);
      else await api.saveOpportunity(item.id);
      setItem({ ...item, saved: !item.saved });
    } catch {
      // The listing itself is unchanged; the button keeps its old state.
    } finally {
      setSaving(false);
    }
  }

  /** One tracker entry per listing: an entry with this listing's id or original link is reused, not duplicated. */
  async function trackInJobs() {
    if (!item) return;
    setTrack({ kind: 'busy' });
    try {
      const existing = findTrackedJob(await tracker.list(), item);
      if (existing) {
        setTrack({ kind: 'already' });
        return;
      }
      await tracker.create(v1JobFromOpportunity(item, t('employer_not_stated')));
      setTrack({ kind: 'added' });
    } catch {
      setTrack({ kind: 'failed' });
    }
  }

  if (!ready || load === 'loading') return <LoadingState label={t('loading')} />;
  if (load === 'permission') return <PermissionDeniedState title={t('permission_title')} body={t('permission_body')} />;
  if (load === 'unavailable') {
    return (
      <ProviderUnavailableState
        title={t('unavailable_title')}
        body={t('unavailable_body')}
        action={<Button type="button" onClick={() => void loadItem()}>{t('retry')}</Button>}
      />
    );
  }
  if (load === 'signed-out' || !user) {
    return (
      <EmptyState
        title={t('signed_out_title')}
        body={t('signed_out_body')}
        action={
          <a className="inline-flex min-h-career-touch items-center rounded-md bg-career-navy px-4 text-sm font-semibold text-white dark:text-stone-950" href={signInHref}>
            {t('go_sign_in')}
          </a>
        }
      />
    );
  }
  if (load === 'missing' || !item) return <EmptyState title={t('missing_title')} body={t('missing_body')} />;

  const stale = isStaleListing(item.checkedAt, nowMs);
  const checked = new Intl.DateTimeFormat(locale, { dateStyle: 'medium' }).format(new Date(item.checkedAt));
  const link = 'inline-flex min-h-career-touch items-center text-sm font-semibold text-career-orange-text';

  return (
    <ScreenStack>
      <PageHeader title={<span dir="auto">{item.title}</span>} />
      {stale ? (
        <StaleSourceState
          title={t('stale_title')}
          body={t('stale_body')}
          action={
            item.sourceUrl ? (
              <a className="text-sm font-semibold text-career-orange-text" href={item.sourceUrl} rel="noreferrer">
                {t('source')}
              </a>
            ) : undefined
          }
        />
      ) : null}
      <Card>
        <ListingFacts item={item} />
        {item.label === 'expired' ? <p className="mt-2 text-sm text-career-orange-text">{t('expired')}</p> : null}
        <p className="mt-2 text-sm text-career-muted">{t('checked', { date: checked })}</p>
        <p className="mt-2 text-sm text-career-muted">{t('source_line', { provider: t(`provider_${providerKey(item.provider)}`) })}</p>
        <p className="mt-4 whitespace-pre-wrap text-sm text-career-ink" dir="auto">{item.description}</p>
        {item.sourceUrl && !stale ? (
          <a className={`mt-4 ${link}`} href={item.sourceUrl} rel="noreferrer">
            {t('source')}
          </a>
        ) : null}
      </Card>
      <Card>
        <h2 className="text-lg font-semibold text-career-ink">{t('actions_title')}</h2>
        <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:flex-wrap">
          <Button type="button" variant="secondary" disabled={saving} aria-pressed={item.saved === true} onClick={() => void toggleSave()}>
            {item.saved ? t('saved_button') : t('save_button')}
          </Button>
          <Button type="button" variant="secondary" disabled={track.kind === 'busy' || track.kind === 'added'} onClick={() => void trackInJobs()}>
            {t('track_button')}
          </Button>
        </div>
        {track.kind === 'added' ? (
          <InlineNote tone="success">
            {t('track_added')}{' '}
            <a className="font-semibold underline" href={`/${locale}/jobs`}>{t('track_open')}</a>
          </InlineNote>
        ) : null}
        {track.kind === 'already' ? (
          <InlineNote>
            {t('track_already')}{' '}
            <a className="font-semibold underline" href={`/${locale}/jobs`}>{t('track_open')}</a>
          </InlineNote>
        ) : null}
        {track.kind === 'failed' ? <InlineNote tone="error">{t('track_failed')}</InlineNote> : null}
        <h3 className="mt-4 text-sm font-semibold text-career-ink">{t('prepare_title')}</h3>
        <div className="mt-1 flex flex-col gap-1 sm:flex-row sm:flex-wrap sm:gap-4">
          <a className={link} href={`/${locale}/career/documents?opportunityId=${encodeURIComponent(item.id)}`}>{t('prepare_resume')}</a>
          <a className={link} href={`/${locale}/career/action-pack?opportunityId=${encodeURIComponent(item.id)}`}>{t('prepare_action_pack')}</a>
          <a className={link} href={`/${locale}/career/interviews?opportunityId=${encodeURIComponent(item.id)}`}>{t('practice')}</a>
        </div>
      </Card>
      <ListingTrustPanel api={api} item={item} onChange={setItem} />
      <Button type="button" onClick={() => void startCompare()}>{t('compare')}</Button>
      {confirming ? (
        <div className="rounded-md border border-career-line p-4">
          <h2 className="text-lg font-semibold text-career-ink">{t('compare_title')}</h2>
          <p className="mt-2 text-sm text-career-muted">
            {t('compare_body', { count: item.resumeAnalysis.includedRemaining + item.resumeAnalysis.packRemaining })}
          </p>
          {resumes && resumes.length > 1 ? (
            <div className="mt-3">
              <FieldSelect
                label={t('compare_resume')}
                value={resumeChoice}
                onChange={(event) => setResumeChoice(event.target.value)}
                options={resumes.map((resume) => ({ value: resume.currentVersionId ?? '', label: resume.title }))}
              />
            </div>
          ) : null}
          <div className="mt-3 flex flex-col gap-2 sm:flex-row">
            <Button type="button" disabled={resumes === null || resumes.length === 0} onClick={() => void compare()}>{t('compare_go')}</Button>
            <Button type="button" variant="ghost" onClick={() => setConfirming(false)}>{t('compare_leave')}</Button>
          </div>
        </div>
      ) : null}
      {compareNote === 'no_resume' ? <p role="status">{t('compare_no_resume')}</p> : null}
      {compareNote === 'quota' ? <p role="status">{t('compare_quota')}</p> : null}
      {compareNote === 'failed' ? <p role="status">{t('compare_failed')}</p> : null}
      {compareNote === 'upgrade' ? (
        <PlanUpgradeState
          title={t('compare_upgrade_title')}
          body={upgradePlan ? t('compare_upgrade_body', { plan: t(`plan_${upgradePlan}`) }) : t('compare_upgrade_body_generic')}
          action={<a className={link} href={`/${locale}/settings/billing`}>{t('compare_upgrade_link')}</a>}
        />
      ) : null}
      {match ? <MatchExplanation match={match} /> : null}
    </ScreenStack>
  );
}

const PROVIDER_KEYS = new Set(['paste', 'adzuna', 'usajobs', 'greenhouse', 'lever']);
function providerKey(provider: string): string {
  return PROVIDER_KEYS.has(provider) ? provider : 'other';
}

/** Coded listing values (remote, full_time, senior) read in the interface language; places, pay and quoted limits stay as stated. */
function preferenceDetail(dimension: string, detail: string | undefined, t: (key: string) => string): string {
  if (!detail) return '';
  if (dimension === 'arrangement') return t(`arrangement_${detail}`);
  if (dimension === 'schedule') return detail === 'internship' ? t('category_internship') : t(`schedule_${detail}`);
  if (dimension === 'seniority') return t(`seniority_${detail}`);
  if (dimension === 'location' && detail === 'remote') return t('arrangement_remote');
  return detail;
}

/**
 * Qualification fit, preference fit and unknowns as three separate lists,
 * under a strong / possible / stretch label with its reasons. Never a number.
 */
function MatchExplanation({ match }: { match: MatchResult }) {
  const t = useTranslations('career.opportunities');
  const label = match.label ?? matchLabel(match.fit, match.gaps, match.preferenceFit ?? []).label;
  const reasons = match.labelReasons ?? matchLabel(match.fit, match.gaps, match.preferenceFit ?? []).labelReasons;
  const preferences = (match.preferenceFit ?? []).filter((check) => check.status !== 'not_set');
  const notSet = (match.preferenceFit ?? []).filter((check) => check.status === 'not_set');
  return (
    <Card>
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="text-lg font-semibold text-career-ink">{t(`label_${label}`)}</h2>
        <Badge tone="neutral">{t(`fit_${match.fit}`)}</Badge>
      </div>
      <ul className="mt-1 flex flex-col gap-1">
        {reasons.map((reason) => (
          <li key={reason} className="text-sm text-career-muted">{t(`label_reason_${reason}`)}</li>
        ))}
      </ul>
      <p className="mt-1 text-sm text-career-muted">{t('compare_not_a_score')}</p>

      <h3 className="mt-4 text-sm font-semibold text-career-ink">{t('section_qualification')}</h3>
      <ul className="mt-1 flex flex-col gap-1">
        {/* One reason per matching fact from the API; the same word on two facts is one line. */}
        {[...new Set(match.reasons.filter((reason) => reason.code === 'confirmed_overlap').map((reason) => reason.token))].map((token) => (
          <li key={token} className="text-sm text-career-ink">{t('reason_overlap', { token })}</li>
        ))}
        {match.reasons
          .filter((reason) => reason.code === 'credential_held')
          .map((reason) => (
            <li key={`held-${reason.token}`} className="text-sm text-career-ink">{t('reason_credential', { token: reason.token })}</li>
          ))}
        {match.gaps.map((gap) => (
          <li key={`${gap.code}-${gap.token}`} className="text-sm text-career-ink">
            {gap.code === 'credential_missing' ? t('gap_credential', { token: gap.token }) : t('gap_word', { token: gap.token })}
          </li>
        ))}
      </ul>

      <h3 className="mt-4 text-sm font-semibold text-career-ink">{t('section_preferences')}</h3>
      {preferences.length === 0 ? <p className="mt-1 text-sm text-career-muted">{t('preferences_none')}</p> : null}
      <ul className="mt-1 flex flex-col gap-1">
        {preferences.map((check) => (
          <li key={check.dimension} className="text-sm text-career-ink">
            {t(`pref_${check.dimension}_${check.status}`, { detail: preferenceDetail(check.dimension, check.detail, t) })}
          </li>
        ))}
      </ul>
      {notSet.length > 0 ? <p className="mt-1 text-xs text-career-muted">{t('preferences_not_set', { count: notSet.length })}</p> : null}

      <h3 className="mt-4 text-sm font-semibold text-career-ink">{t('section_unknowns')}</h3>
      <ul className="mt-1 flex flex-col gap-1">
        {match.unknowns.map((unknown, index) => (
          <li key={`${unknown.code}-${unknown.factId ?? index}`} className="text-sm text-career-ink">
            {unknown.code === 'unconfirmed' ? t('unknown_unconfirmed', { token: unknown.token ?? '' }) : t(`unknown_${unknown.code}`)}
          </li>
        ))}
      </ul>
    </Card>
  );
}
