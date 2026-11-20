'use client';

import { useCallback, useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import {
  isApiError,
  newIdempotencyKey,
  type ApiClient,
  type InterviewList,
  type InterviewSession,
  type InterviewStage,
  type StarStory,
  type StartInterviewInput,
} from '@flacroncv/career-api-client';
import { INTERVIEW_STAGES, MAX_INTERVIEW_QUESTIONS, MAX_INTERVIEW_ROLE, MIN_INTERVIEW_QUESTIONS } from '@flacroncv/career-shared';
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
import { InterviewSessionCard, type AnswerView } from './InterviewSessionCard';
import { StarLibrary, type StoryPrefill } from './StarLibrary';

const COUNTS = Array.from({ length: MAX_INTERVIEW_QUESTIONS - MIN_INTERVIEW_QUESTIONS + 1 }, (_, i) => MIN_INTERVIEW_QUESTIONS + i);

type Note = 'upgrade' | 'quota' | 'failed' | 'start_failed' | 'provider' | 'needs_target' | 'not_found' | null;

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
  const [stories, setStories] = useState<StarStory[]>([]);
  const [session, setSession] = useState<InterviewSession | null>(null);
  const [stage, setStage] = useState<InterviewStage>('behavioral');
  const [questionCount, setQuestionCount] = useState(MAX_INTERVIEW_QUESTIONS);
  // With a listing in the URL the session practises against it; otherwise (or by choice) a typed role.
  const [target, setTarget] = useState<'listing' | 'role'>(opportunityId ? 'listing' : 'role');
  const [role, setRole] = useState('');
  const [confirming, setConfirming] = useState(false);
  const [starting, setStarting] = useState(false);
  const [prefill, setPrefill] = useState<StoryPrefill | null>(null);
  const [note, setNote] = useState<Note>(null);

  const loadList = useCallback(async () => {
    setLoad('loading');
    try {
      const [next, saved] = await Promise.all([api.interviews(), api.starStories()]);
      setList(next);
      setSession(next.items[0] ?? null);
      // The story form starts empty; saved stories are listed, never copied into it.
      setStories(saved.items);
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

  function replaceSession(next: InterviewSession) {
    setSession(next);
    setList((current) => (current ? { ...current, items: current.items.map((item) => (item.id === next.id ? next : item)) } : current));
  }

  function askToStart() {
    setNote(null);
    if (target === 'role' && role.trim().length < 2) {
      setNote('needs_target');
      return;
    }
    setConfirming(true);
  }

  async function start() {
    if (!list) return;
    setNote(null);
    const input: StartInterviewInput =
      target === 'listing' && opportunityId
        ? { opportunityId, stage, questionCount }
        : { role: role.trim(), stage, questionCount };
    setStarting(true);
    try {
      const paid = await api.createInterview(input, newIdempotencyKey());
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
    } catch (error) {
      if (isApiError(error, 'plan_upgrade_required')) setNote('upgrade');
      else if (isApiError(error, 'quota_exhausted')) setNote('quota');
      // No AI provider: nothing was typed or charged, so say that, not "your answer was not saved".
      else if (isApiError(error, 'provider_unavailable')) setNote('provider');
      else if (isApiError(error, 'not_found')) setNote('not_found');
      else setNote('start_failed');
    } finally {
      setStarting(false);
      setConfirming(false);
    }
  }

  async function saveAnswer(text: string): Promise<boolean> {
    if (!session) return false;
    setNote(null);
    try {
      replaceSession(await api.answerInterview(session.id, text));
      return true;
    } catch (error) {
      setNote(isApiError(error, 'provider_unavailable') ? 'provider' : 'failed');
      return false;
    }
  }

  async function challenge(answerId: string, text: string): Promise<boolean> {
    if (!session) return false;
    try {
      replaceSession(await api.challengeInterview(session.id, answerId, text));
      return true;
    } catch {
      return false;
    }
  }

  function saveAsStory(answer: AnswerView) {
    const question = session?.questions.find((item) => item.index === answer.index);
    // Only the candidate's own words go in; the result stays empty because it
    // must come from a confirmed achievement, which the candidate chooses.
    setPrefill({
      key: `${answer.id}-${Date.now()}`,
      draft: { action: answer.answer },
      factIds: question ? [question.factId] : [],
      answerIndex: answer.index,
    });
    document.getElementById('star-situation')?.focus();
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
  const selectClass = 'mt-1 min-h-career-touch w-full rounded-md border border-career-line bg-career-surface px-3 text-sm text-career-ink';

  return (
    <div data-testid="interview-layout" className="flex min-w-0 flex-col gap-6">
      <div>
        <PageHeader title={t('title')} description={t('not_a_score')} />
        <p className="mt-2 text-sm text-career-muted">{t('allowance', { count: remaining })}</p>
      </div>
      {note === 'upgrade' ? <PlanUpgradeState title={t('upgrade_title')} body={t('upgrade_body')} /> : null}
      {note === 'quota' ? <QuotaExhaustedState title={t('quota_title')} body={t('quota_body')} /> : null}
      {note === 'failed' ? <FailedJobState title={t('failed_title')} body={t('failed_body')} /> : null}
      {note === 'start_failed' ? <FailedJobState title={t('start_failed_title')} body={t('start_failed_body')} /> : null}
      {note === 'not_found' ? <FailedJobState title={t('start_failed_title')} body={t('listing_missing')} /> : null}
      {note === 'provider' ? <ProviderUnavailableState title={t('provider_title')} body={t('provider_body')} /> : null}

      {list.items.length > 0 ? (
        <Card>
          <label className="block text-sm font-semibold text-career-ink" htmlFor="interview-session-picker">
            {t('session_picker')}
          </label>
          <select
            id="interview-session-picker"
            className={selectClass}
            value={session?.id ?? ''}
            onChange={(event) => setSession(list.items.find((item) => item.id === event.target.value) ?? null)}
          >
            {list.items.map((item) => (
              <option key={item.id} value={item.id}>
                {t('session_option', {
                  title: item.title,
                  stage: t(`stage_${item.stage}`),
                  answered: item.answers.length,
                  total: item.questions.length,
                })}
              </option>
            ))}
          </select>
          <p className="mt-1 text-sm text-career-muted">{t('session_picker_hint')}</p>
        </Card>
      ) : null}

      {session ? (
        <InterviewSessionCard key={session.id} session={session} onAnswer={saveAnswer} onChallenge={challenge} onSaveAsStory={saveAsStory} />
      ) : (
        <EmptyState title={t('empty_title')} body={t('empty_body')} />
      )}

      <Card>
        <h2 className="text-lg font-semibold text-career-ink">{session ? t('start_another') : t('start')}</h2>
        {opportunityId ? (
          <fieldset className="mt-3">
            <legend className="text-sm font-semibold text-career-ink">{t('target_label')}</legend>
            <div className="mt-1 flex flex-col gap-1">
              <label className="flex min-h-career-touch items-center gap-2 text-sm text-career-ink">
                <input type="radio" name="interview-target" checked={target === 'listing'} onChange={() => setTarget('listing')} />
                {t('mode_listing')}
              </label>
              <label className="flex min-h-career-touch items-center gap-2 text-sm text-career-ink">
                <input type="radio" name="interview-target" checked={target === 'role'} onChange={() => setTarget('role')} />
                {t('mode_role')}
              </label>
            </div>
          </fieldset>
        ) : null}
        {target === 'role' ? (
          <div className="mt-3">
            <Input
              label={t('role_label')}
              hint={t('role_hint')}
              value={role}
              maxLength={MAX_INTERVIEW_ROLE}
              onChange={(event) => setRole(event.target.value)}
              error={note === 'needs_target' ? t('needs_target') : undefined}
            />
          </div>
        ) : null}
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <div>
            <label className="block text-sm font-semibold text-career-ink" htmlFor="interview-stage">{t('stage')}</label>
            <select
              id="interview-stage"
              className={selectClass}
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
          </div>
          <div>
            <label className="block text-sm font-semibold text-career-ink" htmlFor="interview-count">{t('question_count')}</label>
            <select
              id="interview-count"
              className={selectClass}
              value={questionCount}
              onChange={(event) => setQuestionCount(Number(event.target.value))}
            >
              {COUNTS.map((count) => (
                <option key={count} value={count}>{t('question_count_option', { count })}</option>
              ))}
            </select>
          </div>
        </div>
        {!confirming ? (
          <Button className="mt-4" type="button" onClick={askToStart}>{t('start')}</Button>
        ) : (
          // Spec §21: before a paid generation, show the operation, its cost and the balance.
          <div className="mt-4 rounded-md border border-career-line p-4" role="region" aria-label={t('confirm_title')}>
            <h3 className="text-base font-semibold text-career-ink">{t('confirm_title')}</h3>
            <dl className="mt-2 grid gap-1 text-sm">
              <div>
                <dt className="inline font-semibold text-career-ink">{t('charge_operation')}: </dt>
                <dd className="inline text-career-ink">{t('charge_operation_value', { stage: t(`stage_${stage}`), count: questionCount })}</dd>
              </div>
              <div>
                <dt className="inline font-semibold text-career-ink">{t('charge_cost')}: </dt>
                <dd className="inline text-career-ink">{t('charge_cost_value')}</dd>
              </div>
              <div>
                <dt className="inline font-semibold text-career-ink">{t('charge_balance')}: </dt>
                <dd className="inline text-career-ink">{t('charge_balance_value', { count: remaining, after: Math.max(remaining - 1, 0) })}</dd>
              </div>
            </dl>
            <p className="mt-2 text-sm text-career-muted">{t('charge_free_after')}</p>
            <div className="mt-3 flex flex-col gap-2 sm:flex-row">
              <Button type="button" loading={starting} onClick={() => void start()}>{t('confirm_go')}</Button>
              <Button type="button" variant="ghost" disabled={starting} onClick={() => setConfirming(false)}>{t('confirm_leave')}</Button>
            </div>
          </div>
        )}
      </Card>

      <StarLibrary api={api} stories={stories} onChange={setStories} prefill={prefill} />
    </div>
  );
}

function isStage(value: string): value is InterviewStage {
  return (INTERVIEW_STAGES as readonly string[]).includes(value);
}
