'use client';

import { useCallback, useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { isApiError, newIdempotencyKey, type ApiClient, type InterviewList, type InterviewSession, type InterviewStage } from '@flacroncv/career-api-client';
import { INTERVIEW_STAGES } from '@flacroncv/career-shared';
import {
  Button,
  Card,
  EmptyState,
  FailedJobState,
  Input,
  LoadingState,
  PermissionDeniedState,
  PlanUpgradeState,
  ProviderUnavailableState,
  QuotaExhaustedState,
  PageHeader,
} from '@/components/career/ui';
import type { SignedInUser } from '@/lib/career/auth-gateway';
import { profileLoadFailure } from '@/lib/career/profile-load';

export function InterviewsScreen({
  api,
  user,
  ready,
  signInHref,
  locale,
  opportunityId,
}: {
  api: ApiClient;
  user: SignedInUser | null;
  ready: boolean;
  signInHref: string;
  locale: string;
  opportunityId: string | null;
}) {
  const t = useTranslations('career.interviews');
  const [load, setLoad] = useState<'loading' | 'permission' | 'unavailable' | 'signed-out' | 'ready'>('loading');
  const [list, setList] = useState<InterviewList | null>(null);
  const [session, setSession] = useState<InterviewSession | null>(null);
  const [stage, setStage] = useState<InterviewStage>('behavioral');
  const [confirming, setConfirming] = useState(false);
  const [answer, setAnswer] = useState('');
  const [situation, setSituation] = useState('');
  const [task, setTask] = useState('');
  const [action, setAction] = useState('');
  const [result, setResult] = useState('');
  const [note, setNote] = useState<'upgrade' | 'quota' | 'failed' | 'start_failed' | 'provider' | 'story' | 'saved' | null>(null);

  const loadList = useCallback(async () => {
    setLoad('loading');
    try {
      const [next, stories] = await Promise.all([api.interviews(), api.starStories()]);
      setList(next);
      setSession(next.items[0] ?? null);
      setSituation(stories.items[0]?.situation ?? '');
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
    void loadList();
  }, [ready, user, loadList]);

  async function start() {
    if (!opportunityId || !list) return;
    setNote(null);
    try {
      const paid = await api.createInterview({ opportunityId, stage }, newIdempotencyKey());
      setSession(paid.session);
      setList({
        ...list,
        items: [paid.session, ...list.items.filter((item) => item.id !== paid.session.id)],
        textInterview: {
          ...list.textInterview,
          includedRemaining: paid.usage.includedRemaining,
          packRemaining: paid.usage.packRemaining,
        },
      });
      setConfirming(false);
      setAnswer('');
    } catch (error) {
      if (isApiError(error, 'plan_upgrade_required')) setNote('upgrade');
      else if (isApiError(error, 'quota_exhausted')) setNote('quota');
      // No AI provider: nothing was typed or charged, so say that, not "your answer was not saved".
      else if (isApiError(error, 'provider_unavailable')) setNote('provider');
      else setNote('start_failed');
      setConfirming(false);
    }
  }

  async function saveAnswer() {
    if (!session) return;
    const typed = answer;
    setNote(null);
    try {
      setSession(await api.answerInterview(session.id, typed));
      setAnswer('');
    } catch (error) {
      setAnswer(typed);
      setNote(isApiError(error, 'provider_unavailable') ? 'provider' : 'failed');
    }
  }

  async function saveStory() {
    setNote(null);
    try {
      await api.createStarStory({ situation, task, action, result });
      setNote('saved');
    } catch (error) {
      if (isApiError(error, 'validation_error') && error.body.reason === 'number_not_in_facts') setNote('story');
      else setNote('failed');
    }
  }

  if (!ready || load === 'loading') return <LoadingState label={t('loading')} />;
  if (load === 'permission') return <PermissionDeniedState title={t('permission_title')} body={t('permission_body')} />;
  if (load === 'unavailable') {
    return (
      <ProviderUnavailableState
        title={t('unavailable_title')}
        body={t('unavailable_body')}
        action={<Button type="button" onClick={() => void loadList()}>{t('retry')}</Button>}
      />
    );
  }
  if (load === 'signed-out' || !user || !list) {
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

  const remaining = list.textInterview.includedRemaining + list.textInterview.packRemaining;
  const next = session && session.answers.length < session.questions.length ? session.questions[session.answers.length] : null;

  return (
    <div data-testid="interview-layout" className="flex min-w-0 flex-col gap-6">
      <div>
        <PageHeader title={t('title')} description={t('not_a_score')} />
        <p className="mt-2 text-sm text-career-muted">{t('allowance', { count: remaining })}</p>
        <a className="mt-2 inline-flex min-h-career-touch items-center text-sm font-semibold text-career-orange-text" href={`/${locale}/career/interviews/voice${opportunityId ? `?opportunityId=${encodeURIComponent(opportunityId)}` : ''}`}>
          {t('voice_link')}
        </a>
      </div>
      {note === 'upgrade' ? <PlanUpgradeState title={t('upgrade_title')} body={t('upgrade_body')} /> : null}
      {note === 'quota' ? <QuotaExhaustedState title={t('quota_title')} body={t('quota_body')} /> : null}
      {note === 'failed' ? <FailedJobState title={t('failed_title')} body={t('failed_body')} /> : null}
      {note === 'start_failed' ? <FailedJobState title={t('start_failed_title')} body={t('start_failed_body')} /> : null}
      {note === 'provider' ? <ProviderUnavailableState title={t('provider_title')} body={t('provider_body')} /> : null}
      {session ? (
        <Card>
          <p className="text-sm text-career-muted">{session.title}</p>
          <p className="mt-2 text-sm text-career-ink">{session.summary}</p>
          {next ? <p className="mt-4 text-sm text-career-ink">{next.prompt}</p> : <p className="mt-4 text-sm text-career-muted">{t('complete')}</p>}
          {next ? (
            <form
              className="mt-4 flex flex-col gap-3"
              onSubmit={(event) => {
                event.preventDefault();
                void saveAnswer();
              }}
            >
              <Input label={t('answer_label')} value={answer} onChange={(event) => setAnswer(event.target.value)} />
              <Button type="submit">{t('save_answer')}</Button>
            </form>
          ) : null}
        </Card>
      ) : (
        <EmptyState
          title={t('empty_title')}
          body={opportunityId ? t('empty_body') : t('pick_listing')}
          action={
            opportunityId ? (
              <Button type="button" onClick={() => setConfirming(true)}>{t('start')}</Button>
            ) : (
              <a className="inline-flex min-h-career-touch items-center text-sm font-semibold text-career-orange-text" href={`/${locale}/career/opportunities`}>
                {t('search_link')}
              </a>
            )
          }
        />
      )}
      {confirming && opportunityId ? (
        <div className="rounded-md border border-career-line p-4">
          <h2 className="text-lg font-semibold text-career-ink">{t('confirm_title')}</h2>
          <p className="mt-2 text-sm text-career-muted">{t('confirm_body', { count: remaining })}</p>
          <label className="mt-3 block text-sm font-semibold text-career-ink" htmlFor="interview-stage">{t('stage')}</label>
          <select
            id="interview-stage"
            className="mt-1 min-h-career-touch w-full rounded-md border border-career-line bg-career-surface px-3 text-sm text-career-ink"
            value={stage}
            onChange={(event) => {
              const value = event.target.value;
              if (isStage(value)) setStage(value);
            }}
          >
            {INTERVIEW_STAGES.map((item) => (
              <option key={item} value={item}>{t(`stage_${item}`)}</option>
            ))}
          </select>
          <div className="mt-3 flex flex-col gap-2 sm:flex-row">
            <Button type="button" onClick={() => void start()}>{t('confirm_go')}</Button>
            <Button type="button" variant="ghost" onClick={() => setConfirming(false)}>{t('confirm_leave')}</Button>
          </div>
        </div>
      ) : null}
      {session && opportunityId ? (
        <Button type="button" variant="ghost" onClick={() => setConfirming(true)}>{t('start_another')}</Button>
      ) : null}
      <Card>
        <h2 className="text-lg font-semibold text-career-ink">{t('story_title')}</h2>
        <p className="mt-2 text-sm text-career-muted">{t('story_body')}</p>
        <form
          className="mt-4 flex flex-col gap-3"
          onSubmit={(event) => {
            event.preventDefault();
            void saveStory();
          }}
        >
          <Input label={t('situation')} value={situation} onChange={(event) => setSituation(event.target.value)} />
          <Input label={t('task')} value={task} onChange={(event) => setTask(event.target.value)} />
          <Input label={t('action')} value={action} onChange={(event) => setAction(event.target.value)} />
          <Input label={t('result')} value={result} onChange={(event) => setResult(event.target.value)} />
          <Button type="submit">{t('save_story')}</Button>
        </form>
        {note === 'story' ? <p role="status">{t('story_number')}</p> : null}
        {note === 'saved' ? <p role="status">{t('story_saved')}</p> : null}
      </Card>
    </div>
  );
}

function isStage(value: string): value is InterviewStage {
  return (INTERVIEW_STAGES as readonly string[]).includes(value);
}
