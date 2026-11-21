'use client';

import { Plus } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import {
  newIdempotencyKey,
  type ApiClient,
  type AskCoachInput,
  type CoachList,
  type CoachThread,
  type OpportunityItem,
} from '@flacroncv/career-api-client';
import {
  Button,
  Card,
  ConfirmDialog,
  EmptyState,
  FailedJobState,
  InlineNote,
  LoadingState,
  PageHeader,
  PermissionDeniedState,
  PlanUpgradeState,
  ProviderUnavailableState,
  QuotaExhaustedState,
  cn,
} from '@/components/career/ui';
import type { SignedInUser } from '@/lib/career/auth-gateway';
import { profileLoadFailure } from '@/lib/career/profile-load';
import { formatDate } from '@/lib/format-date';
import {
  COACH_QUESTION_MAX,
  COACH_QUESTION_MIN,
  coachBlocks,
  coachLocale,
  coachNote,
  coachRemaining,
  questionReady,
  threadSummary,
  upsertThread,
  type CoachNote,
} from '@/lib/career/coach';

const STARTERS = ['starter_next_step', 'starter_cv', 'starter_interview', 'starter_negotiate'] as const;

/** What is being sent, so a retry of the same question reuses its key and is never charged twice. */
interface PendingKey {
  signature: string;
  key: string;
}

/**
 * Career coach (spec §26). A private chat; every completed assistant reply
 * spends one coaching response. Replies are grounded in the candidate's
 * confirmed facts on the server; this screen only asks and shows.
 */
export function CoachScreen({
  api,
  user,
  ready,
  signInHref,
  locale,
}: {
  api: ApiClient;
  user: SignedInUser | null;
  ready: boolean;
  signInHref: string;
  locale: string;
}) {
  const t = useTranslations('career.coach');
  const [load, setLoad] = useState<'loading' | 'permission' | 'unavailable' | 'signed-out' | 'ready'>('loading');
  const [list, setList] = useState<CoachList | null>(null);
  const [thread, setThread] = useState<CoachThread | null>(null);
  const [threadLoading, setThreadLoading] = useState(false);
  const [saved, setSaved] = useState<OpportunityItem[]>([]);
  const [confirmedFacts, setConfirmedFacts] = useState<number | null>(null);
  const [opportunityId, setOpportunityId] = useState('');
  const [question, setQuestion] = useState('');
  const [pendingQuestion, setPendingQuestion] = useState<string | null>(null);
  const [note, setNote] = useState<CoachNote | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [deleteFailed, setDeleteFailed] = useState(false);
  const keyRef = useRef<PendingKey | null>(null);
  const composerRef = useRef<HTMLTextAreaElement | null>(null);
  const endRef = useRef<HTMLDivElement | null>(null);

  const loadList = useCallback(async () => {
    setLoad('loading');
    try {
      const next = await api.coachThreads();
      setList(next);
      setLoad('ready');
      // Optional context: a failure here leaves the coach usable.
      void api.savedOpportunities().then((result) => setSaved(result.items)).catch(() => setSaved([]));
      void api
        .facts()
        .then((result) => setConfirmedFacts(result.items.filter((fact) => fact.confirmation === 'confirmed').length))
        .catch(() => setConfirmedFacts(null));
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

  useEffect(() => {
    endRef.current?.scrollIntoView?.({ block: 'end' });
  }, [thread?.messages.length, pendingQuestion]);

  async function openThread(threadId: string) {
    setNote(null);
    setThreadLoading(true);
    try {
      setThread(await api.coachThread(threadId));
    } catch (error) {
      setNote(coachNote(error) === 'not_found' ? 'not_found' : 'failed');
    } finally {
      setThreadLoading(false);
    }
  }

  function startNew() {
    setThread(null);
    setNote(null);
    setOpportunityId('');
    composerRef.current?.focus();
  }

  async function send() {
    if (!list || pendingQuestion !== null) return;
    const text = question.trim();
    if (!questionReady(text)) {
      setNote('invalid');
      return;
    }
    setNote(null);
    const input: AskCoachInput = { question: text, locale: coachLocale(locale) };
    if (thread) input.threadId = thread.id;
    else if (opportunityId) input.opportunityId = opportunityId;
    const signature = JSON.stringify(input);
    if (keyRef.current?.signature !== signature) keyRef.current = { signature, key: newIdempotencyKey() };
    setPendingQuestion(text);
    setQuestion('');
    try {
      const paid = await api.askCoach(input, keyRef.current.key);
      keyRef.current = null;
      setThread(paid.thread);
      setList((current) =>
        current
          ? {
              items: upsertThread(current.items, threadSummary(paid.thread)),
              coaching: {
                ...current.coaching,
                includedRemaining: paid.usage.includedRemaining,
                packRemaining: paid.usage.packRemaining,
              },
            }
          : current,
      );
    } catch (error) {
      // Nothing was spent: give the question back so it is not lost.
      setQuestion(text);
      setNote(coachNote(error));
    } finally {
      setPendingQuestion(null);
    }
  }

  async function removeThread(threadId: string) {
    setDeleteBusy(true);
    setDeleteFailed(false);
    try {
      await api.deleteCoachThread(threadId);
      setList((current) => (current ? { ...current, items: current.items.filter((item) => item.id !== threadId) } : current));
      if (thread?.id === threadId) setThread(null);
      setDeleting(null);
    } catch {
      setDeleteFailed(true);
    } finally {
      setDeleteBusy(false);
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

  const remaining = coachRemaining(list.coaching);
  const billingHref = `/${locale}/settings/billing`;
  const billingLink = (
    <a className="inline-flex min-h-career-touch items-center rounded-md bg-career-navy px-4 text-sm font-semibold text-white dark:text-stone-950" href={billingHref}>
      {t('open_billing')}
    </a>
  );
  const listingTitle = (id: string | null) => (id ? saved.find((item) => item.id === id)?.title ?? null : null);
  const threadListing = listingTitle(thread?.opportunityId ?? null);
  const deletingThread = deleting ? list.items.find((item) => item.id === deleting) ?? null : null;
  const length = question.trim().length;

  return (
    <div data-testid="coach-layout" className="flex min-w-0 flex-col gap-6">
      <div>
        <PageHeader title={t('title')} description={t('description')} />
        <p className="mt-2 text-sm text-career-muted" data-testid="coach-balance">
          {list.coaching.packRemaining > 0
            ? t('balance_with_packs', { count: remaining, included: list.coaching.includedRemaining, packs: list.coaching.packRemaining })
            : t('balance', { count: remaining })}
        </p>
      </div>

      {confirmedFacts === 0 ? (
        <InlineNote title={t('no_facts_title')}>
          {t('no_facts_body')}{' '}
          <a className="font-semibold text-career-orange-text" href={`/${locale}/career/profile`}>{t('open_profile')}</a>
        </InlineNote>
      ) : null}

      <div className="grid min-w-0 grid-cols-1 gap-6 lg:grid-cols-[18rem_minmax(0,1fr)]">
        <Card className="min-w-0 self-start">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-lg font-semibold text-career-ink">{t('threads_title')}</h2>
            <Button type="button" variant="secondary" className="gap-1.5 whitespace-nowrap px-3" onClick={startNew}>
              <Plus className="h-4 w-4" aria-hidden="true" />
              {t('new_thread')}
            </Button>
          </div>
          {list.items.length === 0 ? (
            <p className="mt-3 text-sm text-career-muted">{t('threads_empty')}</p>
          ) : (
            <ul className="mt-3 flex flex-col gap-1" aria-label={t('threads_title')}>
              {list.items.map((item) => (
                <li key={item.id} className="flex min-w-0 items-start gap-1">
                  <button
                    type="button"
                    aria-current={thread?.id === item.id ? 'true' : undefined}
                    onClick={() => void openThread(item.id)}
                    className={cn(
                      'min-h-career-touch min-w-0 flex-1 rounded-md px-2 py-1.5 text-start text-sm',
                      thread?.id === item.id ? 'bg-career-wash font-semibold text-career-ink' : 'text-career-ink hover:bg-career-wash',
                    )}
                  >
                    <span className="block truncate" dir="auto">{item.title}</span>
                    <span className="block text-xs font-normal text-career-muted">
                      {t('thread_meta', { date: formatDate(item.updatedAt, undefined, locale), count: item.messageCount })}
                    </span>
                  </button>
                  <Button
                    type="button"
                    variant="danger-ghost"
                    aria-label={t('delete_thread_label', { title: item.title })}
                    onClick={() => {
                      setDeleteFailed(false);
                      setDeleting(item.id);
                    }}
                  >
                    {t('delete')}
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card className="flex min-w-0 flex-col gap-4">
          <div>
            <h2 className="text-lg font-semibold text-career-ink" dir="auto">{thread ? thread.title : t('new_thread_title')}</h2>
            {threadListing ? <p className="mt-1 text-sm text-career-muted" dir="auto">{t('about_listing', { title: threadListing })}</p> : null}
          </div>

          {threadLoading ? <LoadingState label={t('thread_loading')} /> : null}

          {!threadLoading && thread ? (
            <ol className="flex flex-col gap-3" aria-label={t('messages_label')}>
              {thread.messages.map((message) => (
                <MessageBubble key={message.id} role={message.role} content={message.content} who={message.role === 'user' ? t('you') : t('coach')} />
              ))}
              {pendingQuestion !== null ? <MessageBubble role="user" content={pendingQuestion} who={t('you')} /> : null}
            </ol>
          ) : null}

          {!threadLoading && !thread ? (
            <div className="flex flex-col gap-3">
              {pendingQuestion !== null ? (
                <ol className="flex flex-col gap-3" aria-label={t('messages_label')}>
                  <MessageBubble role="user" content={pendingQuestion} who={t('you')} />
                </ol>
              ) : (
                <>
                  <p className="text-sm text-career-muted">{t('empty_body')}</p>
                  <div className="flex flex-wrap gap-2" role="group" aria-label={t('starters_label')}>
                    {STARTERS.map((key) => (
                      <Button
                        key={key}
                        type="button"
                        variant="secondary"
                        className="h-auto whitespace-normal py-2 text-start"
                        onClick={() => {
                          setQuestion(t(key));
                          composerRef.current?.focus();
                        }}
                      >
                        {t(key)}
                      </Button>
                    ))}
                  </div>
                  {saved.length > 0 ? (
                    <div>
                      <label className="block text-sm font-semibold text-career-ink" htmlFor="coach-listing">{t('listing_label')}</label>
                      <select
                        id="coach-listing"
                        className="mt-1 min-h-career-touch w-full rounded-md border border-career-line bg-career-surface px-3 text-sm text-career-ink"
                        value={opportunityId}
                        onChange={(event) => setOpportunityId(event.target.value)}
                      >
                        <option value="">{t('listing_none')}</option>
                        {saved.map((item) => (
                          <option key={item.id} value={item.id}>{item.title}</option>
                        ))}
                      </select>
                      <p className="mt-1 text-sm text-career-muted">{t('listing_hint')}</p>
                    </div>
                  ) : null}
                </>
              )}
            </div>
          ) : null}

          {pendingQuestion !== null ? (
            <p className="text-sm text-career-muted" role="status" aria-live="polite">{t('thinking')}</p>
          ) : null}
          <div ref={endRef} />

          {note === 'upgrade' ? <PlanUpgradeState title={t('upgrade_title')} body={t('upgrade_body')} action={billingLink} /> : null}
          {note === 'quota' ? <QuotaExhaustedState title={t('quota_title')} body={t('quota_body')} action={billingLink} /> : null}
          {note === 'provider' ? <ProviderUnavailableState title={t('provider_title')} body={t('provider_body')} /> : null}
          {note === 'feature' ? <ProviderUnavailableState title={t('feature_title')} body={t('feature_body')} /> : null}
          {note === 'thread_limit' ? <FailedJobState title={t('thread_limit_title')} body={t('thread_limit_body')} /> : null}
          {note === 'turn_limit' ? (
            <FailedJobState
              title={t('turn_limit_title')}
              body={t('turn_limit_body')}
              action={<Button type="button" onClick={startNew}>{t('new_thread')}</Button>}
            />
          ) : null}
          {note === 'not_found' ? <FailedJobState title={t('failed_title')} body={t('not_found_body')} /> : null}
          {note === 'invalid' ? <FailedJobState title={t('failed_title')} body={t('invalid_body', { min: COACH_QUESTION_MIN, max: COACH_QUESTION_MAX })} /> : null}
          {note === 'failed' ? <FailedJobState title={t('failed_title')} body={t('failed_body')} /> : null}

          <form
            className="flex flex-col gap-2 border-t border-career-line pt-4"
            onSubmit={(event) => {
              event.preventDefault();
              void send();
            }}
          >
            <label className="block text-sm font-semibold text-career-ink" htmlFor="coach-question">{t('question_label')}</label>
            <textarea
              id="coach-question"
              ref={composerRef}
              dir="auto"
              rows={4}
              maxLength={COACH_QUESTION_MAX}
              value={question}
              disabled={pendingQuestion !== null}
              aria-describedby="coach-question-count coach-disclaimer"
              onChange={(event) => setQuestion(event.target.value)}
              onKeyDown={(event) => {
                // Ctrl/Cmd+Enter sends; Enter alone keeps a new line.
                if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
                  event.preventDefault();
                  void send();
                }
              }}
              className="w-full rounded-md border border-career-line bg-career-surface px-3 py-2 text-sm text-career-ink placeholder:text-career-muted"
              placeholder={t('question_placeholder')}
            />
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <span id="coach-question-count" className="text-xs text-career-muted">
                {t('counter', { count: question.length, max: COACH_QUESTION_MAX })}
              </span>
              <Button type="submit" loading={pendingQuestion !== null} disabled={length < COACH_QUESTION_MIN || remaining === 0}>
                {t('send')}
              </Button>
            </div>
            <p className="text-xs text-career-muted">{t('cost', { count: remaining })}</p>
            <p id="coach-disclaimer" className="text-xs text-career-muted">{t('disclaimer')}</p>
          </form>
        </Card>
      </div>

      <ConfirmDialog
        open={deletingThread !== null}
        title={t('delete_title')}
        body={deletingThread ? (deleteFailed ? t('delete_failed') : t('delete_body', { title: deletingThread.title })) : undefined}
        confirmLabel={t('delete')}
        cancelLabel={t('cancel')}
        danger
        busy={deleteBusy}
        onConfirm={() => deletingThread && void removeThread(deletingThread.id)}
        onCancel={() => setDeleting(null)}
      />
    </div>
  );
}

function MessageBubble({ role, content, who }: { role: 'user' | 'assistant'; content: string; who: string }) {
  const mine = role === 'user';
  return (
    // Flex alignment follows the page direction, so "mine" sits at the end in RTL too.
    <li className={cn('flex', mine ? 'justify-end' : 'justify-start')} data-role={role}>
      <div
        className={cn(
          'max-w-[85%] rounded-lg px-3 py-2 text-sm',
          mine ? 'bg-career-navy text-white dark:text-stone-950' : 'border border-career-line bg-career-wash text-career-ink',
        )}
      >
        <span className="sr-only">{who}: </span>
        <div dir="auto" className="flex flex-col gap-2 break-words">
          {coachBlocks(content).map((block, index) =>
            block.kind === 'paragraph' ? (
              <p key={index} className="whitespace-pre-line">{block.lines.join('\n')}</p>
            ) : block.ordered ? (
              <ol key={index} className="list-decimal space-y-1 ps-5">
                {block.items.map((item, i) => <li key={i}>{item}</li>)}
              </ol>
            ) : (
              <ul key={index} className="list-disc space-y-1 ps-5">
                {block.items.map((item, i) => <li key={i}>{item}</li>)}
              </ul>
            ),
          )}
        </div>
      </div>
    </li>
  );
}
