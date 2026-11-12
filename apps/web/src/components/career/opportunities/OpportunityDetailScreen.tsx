'use client';

import { useCallback, useEffect, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { isApiError, newIdempotencyKey, type ApiClient, type MatchResult, type OpportunityDetail } from '@flacroncv/career-api-client';
import { isStaleListing } from '@flacroncv/career-shared';
import { Button, Card, EmptyState, LoadingState, PermissionDeniedState, ProviderUnavailableState, StaleSourceState } from '@/components/career/ui';
import type { SignedInUser } from '@/lib/career/auth-gateway';
import { profileLoadFailure } from '@/lib/career/profile-load';
import { ListingTrustPanel } from './ListingTrustPanel';

export function OpportunityDetailScreen({
  api,
  user,
  ready,
  signInHref,
  opportunityId,
  nowMs = Date.now(),
}: {
  api: ApiClient;
  user: SignedInUser | null;
  ready: boolean;
  signInHref: string;
  opportunityId: string;
  nowMs?: number;
}) {
  const t = useTranslations('career.opportunities');
  const locale = useLocale();
  const [load, setLoad] = useState<'loading' | 'permission' | 'unavailable' | 'missing' | 'signed-out' | 'ready'>('loading');
  const [item, setItem] = useState<OpportunityDetail | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [match, setMatch] = useState<MatchResult | null>(null);
  const [compareNote, setCompareNote] = useState<'no_resume' | 'failed' | 'quota' | null>(null);

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

  async function compare() {
    if (!item) return;
    setCompareNote(null);
    try {
      const list = await api.resumes();
      const versionId = list.items[0]?.currentVersionId;
      if (!versionId) {
        setCompareNote('no_resume');
        return;
      }
      const paid = await api.createMatch(
        { opportunityId: item.id, resumeVersionId: versionId, mode: 'explicit' },
        newIdempotencyKey(),
      );
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
      else setCompareNote('failed');
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
          <a className="inline-flex min-h-career-touch items-center rounded-md bg-career-navy px-4 text-sm font-semibold text-white" href={signInHref}>
            {t('go_sign_in')}
          </a>
        }
      />
    );
  }
  if (load === 'missing' || !item) return <EmptyState title={t('missing_title')} body={t('missing_body')} />;

  const stale = isStaleListing(item.checkedAt, nowMs);
  const pay = item.compensation.minimum === null && item.compensation.maximum === null;

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-2xl font-semibold text-career-ink">{item.title}</h1>
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
        <p className="text-sm text-career-muted">{item.organization ?? t('not_stated')}</p>
        <p className="mt-2 text-sm text-career-ink">{item.locations.length > 0 ? item.locations.join(', ') : t('not_stated')}</p>
        <p className="mt-2 text-sm text-career-ink">{pay ? t('not_stated') : `${item.compensation.minimum ?? ''} ${item.compensation.maximum ?? ''}`.trim()}</p>
        <p className="mt-2 text-sm text-career-ink">{item.sponsorship === 'unknown' ? t('not_stated') : item.sponsorship}</p>
        {item.label === 'expired' ? <p className="mt-2 text-sm text-career-orange-text">{t('expired')}</p> : null}
        <p className="mt-2 text-sm text-career-muted">{t('checked', { date: item.checkedAt.slice(0, 10) })}</p>
        <p className="mt-4 whitespace-pre-wrap text-sm text-career-ink">{item.description}</p>
        {item.sourceUrl && !stale ? (
          <a className="mt-4 inline-flex min-h-career-touch items-center text-sm font-semibold text-career-orange-text" href={item.sourceUrl} rel="noreferrer">
            {t('source')}
          </a>
        ) : null}
      </Card>
      <ListingTrustPanel api={api} item={item} onChange={setItem} />
      <Button type="button" onClick={() => setConfirming(true)}>{t('compare')}</Button>
      <a className="inline-flex min-h-career-touch items-center text-sm font-semibold text-career-orange-text" href={`/${locale}/career/interviews?opportunityId=${item.id}`}>
        {t('practice')}
      </a>
      {confirming ? (
        <div className="rounded-md border border-career-line p-4">
          <h2 className="text-lg font-semibold text-career-ink">{t('compare_title')}</h2>
          <p className="mt-2 text-sm text-career-muted">
            {t('compare_body', { count: item.resumeAnalysis.includedRemaining + item.resumeAnalysis.packRemaining })}
          </p>
          <div className="mt-3 flex flex-col gap-2 sm:flex-row">
            <Button type="button" onClick={() => void compare()}>{t('compare_go')}</Button>
            <Button type="button" variant="ghost" onClick={() => setConfirming(false)}>{t('compare_leave')}</Button>
          </div>
        </div>
      ) : null}
      {compareNote === 'no_resume' ? <p role="status">{t('compare_no_resume')}</p> : null}
      {compareNote === 'quota' ? <p role="status">{t('compare_quota')}</p> : null}
      {compareNote === 'failed' ? <p role="status">{t('compare_failed')}</p> : null}
      {match ? (
        <div>
          <h2 className="text-lg font-semibold text-career-ink">{t(`fit_${match.fit}`)}</h2>
          <p className="mt-1 text-sm text-career-muted">{t('compare_not_a_score')}</p>
          <ul className="mt-2 flex flex-col gap-1">
            {/* One reason per matching fact from the API; the same word on two facts is one line. */}
            {[...new Set(match.reasons.map((reason) => reason.token))].map((token) => (
              <li key={token} className="text-sm text-career-ink">{t('reason_overlap', { token })}</li>
            ))}
            {match.gaps.map((gap) => (
              <li key={gap.token} className="text-sm text-career-ink">{t('gap_word', { token: gap.token })}</li>
            ))}
            {match.unknowns.map((unknown, index) => (
              <li key={`${unknown.code}-${unknown.factId ?? index}`} className="text-sm text-career-ink">
                {unknown.code === 'unconfirmed' ? t('unknown_unconfirmed', { token: unknown.token ?? '' }) : t(`unknown_${unknown.code}`)}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
