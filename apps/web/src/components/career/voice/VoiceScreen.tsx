'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { isApiError, newIdempotencyKey, type ApiClient, type InterviewStage, type VoiceSession } from '@flacroncv/career-api-client';
import { Button, Card, EmptyState, FailedJobState, Input, LoadingState, PermissionDeniedState, PlanUpgradeState, QuotaExhaustedState } from '@/components/career/ui';
import type { SignedInUser } from '@/lib/career/auth-gateway';
import { profileLoadFailure } from '@/lib/career/profile-load';

function clock(total: number): string {
  const seconds = Math.max(0, Math.floor(total));
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  return `${minutes}:${rest.toString().padStart(2, '0')}`;
}

export function VoiceScreen({
  api,
  user,
  ready,
  signInHref,
  opportunityId,
}: {
  api: ApiClient;
  user: SignedInUser | null;
  ready: boolean;
  signInHref: string;
  opportunityId: string | null;
}) {
  const t = useTranslations('career.voice');
  const [load, setLoad] = useState<'loading' | 'permission' | 'unavailable' | 'switched-off' | 'signed-out' | 'ready'>('loading');
  const [remaining, setRemaining] = useState(0);
  const [planIncludesVoice, setPlanIncludesVoice] = useState(false);
  const [consented, setConsented] = useState(false);
  const [session, setSession] = useState<VoiceSession | null>(null);
  const [running, setRunning] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [correction, setCorrection] = useState('');
  const [offer, setOffer] = useState('');
  const [salarySource, setSalarySource] = useState('');
  const [note, setNote] = useState<'upgrade' | 'quota' | 'failed' | 'truncated' | 'deleted' | 'corrected' | null>(null);
  const startedAt = useRef<number | null>(null);
  const busy = useRef(false);

  const loadList = useCallback(async () => {
    setLoad('loading');
    try {
      const next = await api.voiceInterviews();
      setRemaining(next.remainingSeconds);
      setPlanIncludesVoice(next.planIncludesVoice);
      setConsented(next.consent);
      const current = next.items[0] ?? null;
      setSession(current);
      setCorrection(current?.recording?.transcript ?? '');
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
  }, [api]);

  useEffect(() => {
    if (!ready) return;
    if (!user) {
      setLoad('signed-out');
      return;
    }
    void loadList();
  }, [ready, user, loadList]);

  async function agree(checked: boolean) {
    if (!checked || consented || busy.current) return;
    busy.current = true;
    setNote(null);
    try {
      await api.consentVoice();
      setConsented(true);
    } catch {
      setNote('failed');
    } finally {
      busy.current = false;
    }
  }

  async function begin(kind: 'practice' | 'negotiation') {
    if (busy.current || !consented || running) return;
    busy.current = true;
    setNote(null);
    try {
      const stage: InterviewStage = 'behavioral';
      const opened =
        kind === 'practice'
          ? await api.startVoice({ kind, opportunityId: opportunityId ?? undefined, stage })
          : await api.startVoice({ kind, offer, salarySource });
      setSession(opened);
      setTranscript('');
      startedAt.current = Date.now();
      setRunning(true);
    } catch (error) {
      if (isApiError(error, 'plan_upgrade_required')) setNote('upgrade');
      else if (isApiError(error, 'quota_exhausted')) setNote('quota');
      else setNote('failed');
    } finally {
      busy.current = false;
    }
  }

  async function finish() {
    if (busy.current || !session || startedAt.current === null) return;
    const seconds = Math.max(1, Math.round((Date.now() - startedAt.current) / 1000));
    const words = transcript;
    busy.current = true;
    setNote(null);
    try {
      const result = await api.recordVoice(session.id, { durationSeconds: seconds, transcript: words }, newIdempotencyKey());
      setSession(result.session);
      setCorrection(result.session.recording?.transcript ?? '');
      setRemaining(result.remainingSeconds);
      setRunning(false);
      startedAt.current = null;
      if (result.truncated) setNote('truncated');
    } catch (error) {
      if (isApiError(error, 'quota_exhausted')) setNote('quota');
      else setNote('failed');
    } finally {
      busy.current = false;
    }
  }

  async function correct() {
    if (busy.current || !session?.recording) return;
    const words = correction.trim();
    if (words.length === 0) {
      setNote('failed');
      return;
    }
    busy.current = true;
    setNote(null);
    try {
      setSession(await api.correctVoiceTranscript(session.id, words));
      setNote('corrected');
    } catch {
      setNote('failed');
    } finally {
      busy.current = false;
    }
  }

  async function removeAudio() {
    if (busy.current || !session?.recording || session.recording.audioDeleted) return;
    busy.current = true;
    setNote(null);
    try {
      const removed = await api.deleteVoiceAudio(session.id);
      setSession(removed);
      setNote('deleted');
    } catch {
      setNote('failed');
    } finally {
      busy.current = false;
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
        action={<Button onClick={() => void loadList()}>{t('retry')}</Button>}
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

  const savedSummary = session && session.summary !== 'No recording yet.' ? session.summary : null;

  return (
    <div data-testid="voice-layout" className="grid grid-cols-1 gap-6">
      <div>
        <h1 className="text-2xl font-semibold text-career-ink">{t('title')}</h1>
        <p className="mt-2 text-sm text-career-muted">{t('remaining', { time: clock(remaining), seconds: remaining })}</p>
        <p className="mt-1 text-sm text-career-muted">{t('not_a_score')}</p>
        <a className="mt-2 inline-flex min-h-career-touch items-center text-sm font-semibold text-career-orange-text" href="/career/interviews">
          {t('text_link')}
        </a>
      </div>
      {!planIncludesVoice || note === 'upgrade' ? <PlanUpgradeState title={t('upgrade_title')} body={t('upgrade_body')} /> : null}
      {note === 'quota' ? <QuotaExhaustedState title={t('quota_title')} body={t('quota_body')} /> : null}
      {note === 'failed' ? <FailedJobState title={t('failed_title')} body={t('failed_body')} /> : null}
      {note === 'truncated' ? <p className="text-sm text-career-warning">{t('truncated')}</p> : null}
      {note === 'deleted' ? <p className="text-sm text-career-ink">{t('audio_deleted')}</p> : null}
      {note === 'corrected' ? <p className="text-sm text-career-ink">{t('corrected')}</p> : null}
      <Card>
        <label className="flex min-h-career-touch items-center gap-3 text-sm text-career-ink">
          <input
            type="checkbox"
            className="h-4 w-4"
            checked={consented}
            onChange={(event) => void agree(event.target.checked)}
          />
          {t('consent')}
        </label>
        <p className="mt-2 text-sm text-career-muted">{t('consent_help')}</p>
        {opportunityId ? (
          <Button className="mt-4" disabled={!consented || running || remaining < 1} onClick={() => void begin('practice')}>
            {t('start')}
          </Button>
        ) : (
          <p className="mt-4 text-sm text-career-muted">
            {t('pick_listing')}{' '}
            <a className="font-semibold text-career-orange-text" href="/career/opportunities">
              {t('search_link')}
            </a>
          </p>
        )}
        {running ? (
          <div className="mt-4 flex flex-col gap-3">
            <label className="text-sm font-semibold text-career-ink" htmlFor="voice-transcript">
              {t('transcript')}
            </label>
            <textarea
              id="voice-transcript"
              className="min-h-24 rounded-md border border-career-line px-3 py-2 text-sm text-career-ink"
              value={transcript}
              onChange={(event) => setTranscript(event.target.value)}
            />
            <p className="text-sm text-career-muted">{t('transcript_help')}</p>
            <Button onClick={() => void finish()}>{t('stop')}</Button>
          </div>
        ) : null}
      </Card>
      {session ? (
        <Card>
          <p className="text-sm text-career-muted">{session.title}</p>
          <p className="mt-2 text-sm text-career-ink">{session.prompt}</p>
          {session.guidance ? <p className="mt-2 text-sm text-career-ink">{session.guidance}</p> : null}
          {savedSummary ? (
            <p className="mt-4 text-sm text-career-ink">
              {t('summary_label')}: {savedSummary}
            </p>
          ) : null}
          {session.recording ? (
            <div className="mt-4 flex flex-col gap-3">
              <p className="text-sm text-career-ink">{session.recording.transcript}</p>
              <label className="text-sm font-semibold text-career-ink" htmlFor="voice-correction">
                {t('saved_transcript')}
              </label>
              <textarea
                id="voice-correction"
                className="min-h-24 rounded-md border border-career-line px-3 py-2 text-sm text-career-ink"
                value={correction}
                onChange={(event) => setCorrection(event.target.value)}
              />
              <p className="text-sm text-career-muted">{t('saved_transcript_help')}</p>
              <Button onClick={() => void correct()}>{t('save_correction')}</Button>
            </div>
          ) : null}
          {session.recording && !session.recording.audioDeleted ? (
            <Button className="mt-4" onClick={() => void removeAudio()}>
              {t('delete_audio')}
            </Button>
          ) : null}
        </Card>
      ) : null}
      <Card>
        <h2 className="text-lg font-semibold text-career-ink">{t('negotiation_title')}</h2>
        <form
          className="mt-4 flex flex-col gap-3"
          onSubmit={(event) => {
            event.preventDefault();
            void begin('negotiation');
          }}
        >
          <Input label={t('offer')} value={offer} onChange={(event) => setOffer(event.target.value)} />
          <Input label={t('salary_source')} value={salarySource} onChange={(event) => setSalarySource(event.target.value)} />
          <Button type="submit" disabled={!consented || running || remaining < 1}>
            {t('start_negotiation')}
          </Button>
        </form>
      </Card>
    </div>
  );
}
