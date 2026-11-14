'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { INTERVIEW_STAGES, MAX_VOICE_TAKE_SECONDS } from '@flacroncv/career-shared';
import {
  isApiError,
  newIdempotencyKey,
  type ApiClient,
  type InterviewStage,
  type VoiceRecordResult,
  type VoiceSession,
} from '@flacroncv/career-api-client';
import {
  Button,
  Card,
  ConfirmDialog,
  EmptyState,
  FailedJobState,
  InlineNote,
  Input,
  LoadingState,
  PermissionDeniedState,
  PlanUpgradeState,
  QuotaExhaustedState,
} from '@/components/career/ui';
import type { SignedInUser } from '@/lib/career/auth-gateway';
import { profileLoadFailure } from '@/lib/career/profile-load';
import { useVoiceRecorder } from './useVoiceRecorder';

function clock(total: number): string {
  const seconds = Math.max(0, Math.floor(total));
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  return `${minutes}:${rest.toString().padStart(2, '0')}`;
}

const NO_RECORDING = 'No recording yet.';

type Note =
  | 'upgrade'
  | 'quota'
  | 'failed'
  | 'save_failed'
  | 'unreadable'
  | 'too_large'
  | 'truncated'
  | 'deleted'
  | 'corrected'
  | 'withdrawn'
  | 'transcribed'
  | 'transcription_unavailable'
  | 'transcription_failed'
  | 'no_facts'
  | null;

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
  const locale = useLocale();
  const recorder = useVoiceRecorder();
  const [load, setLoad] = useState<'loading' | 'permission' | 'unavailable' | 'switched-off' | 'signed-out' | 'ready'>('loading');
  const [remaining, setRemaining] = useState(0);
  const [planIncludesVoice, setPlanIncludesVoice] = useState(false);
  const [transcriptionAvailable, setTranscriptionAvailable] = useState(false);
  const [consented, setConsented] = useState(false);
  const [sessions, setSessions] = useState<VoiceSession[]>([]);
  const [session, setSession] = useState<VoiceSession | null>(null);
  const [stage, setStage] = useState<InterviewStage>('behavioral');
  const [role, setRole] = useState('');
  const [correction, setCorrection] = useState('');
  const [offer, setOffer] = useState('');
  const [salarySource, setSalarySource] = useState('');
  const [note, setNote] = useState<Note>(null);
  const [saving, setSaving] = useState(false);
  const [playback, setPlayback] = useState<string | null>(null);
  const [confirmRemove, setConfirmRemove] = useState(false);
  const busy = useRef(false);
  /** One key per finished take: a retried upload of the same take is never charged twice. */
  const takeKey = useRef<string | null>(null);

  const takeUrl = useMemo(
    () => (recorder.take && typeof URL.createObjectURL === 'function' ? URL.createObjectURL(recorder.take) : null),
    [recorder.take],
  );
  useEffect(() => {
    takeKey.current = recorder.take ? newIdempotencyKey() : null;
    return () => {
      if (takeUrl && typeof URL.revokeObjectURL === 'function') URL.revokeObjectURL(takeUrl);
    };
  }, [recorder.take, takeUrl]);

  const show = useCallback((next: VoiceSession | null) => {
    setSession(next);
    setCorrection(next?.recording?.transcript ?? '');
    setPlayback(null);
  }, []);

  const loadList = useCallback(async () => {
    setLoad('loading');
    try {
      const next = await api.voiceInterviews();
      setRemaining(next.remainingSeconds);
      setPlanIncludesVoice(next.planIncludesVoice);
      setTranscriptionAvailable(next.transcriptionAvailable === true);
      setConsented(next.consent);
      setSessions(next.items);
      show(next.items[0] ?? null);
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
  }, [api, show]);

  useEffect(() => {
    if (!ready) return;
    if (!user) {
      setLoad('signed-out');
      return;
    }
    void loadList();
  }, [ready, user, loadList]);

  function remember(next: VoiceSession) {
    setSessions((items) => [next, ...items.filter((item) => item.id !== next.id)]);
    show(next);
  }

  const recording = recorder.status === 'recording' || recorder.status === 'requesting';

  /** Ticking gives consent; unticking withdraws it (a privacy right), but never mid-recording. */
  async function agree(checked: boolean) {
    if (checked === consented || busy.current || recording) return;
    busy.current = true;
    setNote(null);
    try {
      if (checked) {
        await api.consentVoice();
        setConsented(true);
      } else {
        await api.withdrawVoiceConsent();
        setConsented(false);
        setNote('withdrawn');
      }
    } catch {
      setNote('failed');
    } finally {
      busy.current = false;
    }
  }

  /** Opening a session spends nothing; only recorded seconds are counted. */
  async function begin(kind: 'practice' | 'negotiation') {
    if (busy.current || !consented || recording) return;
    busy.current = true;
    setNote(null);
    recorder.discard();
    try {
      const opened =
        kind === 'practice'
          ? await api.startVoice(
              opportunityId ? { kind, opportunityId, stage } : { kind, role: role.trim(), stage },
            )
          : await api.startVoice({ kind, offer, salarySource });
      remember(opened);
    } catch (error) {
      if (isApiError(error, 'plan_upgrade_required')) setNote('upgrade');
      else if (isApiError(error, 'quota_exhausted')) setNote('quota');
      else if (isApiError(error, 'validation_error') && (error.body as { field?: string }).field === 'facts') setNote('no_facts');
      else setNote('failed');
    } finally {
      busy.current = false;
    }
  }

  async function saveTake() {
    if (busy.current || !session || !recorder.take || !takeKey.current) return;
    busy.current = true;
    setSaving(true);
    setNote(null);
    try {
      const result: VoiceRecordResult = await api.recordVoice(session.id, recorder.take, takeKey.current, locale === 'fr' ? 'fr' : 'en');
      remember(result.session);
      setRemaining(result.remainingSeconds);
      recorder.discard();
      if (result.truncated) setNote('truncated');
      else if (result.transcription === 'transcribed') setNote('transcribed');
      else if (result.transcription === 'failed') setNote('transcription_failed');
      else if (result.transcription === 'unavailable') setNote('transcription_unavailable');
    } catch (error) {
      if (isApiError(error, 'quota_exhausted')) setNote('quota');
      else if (isApiError(error, 'validation_error')) {
        const reason = (error.body as { reason?: string }).reason;
        setNote(reason === 'too_large' || reason === 'too_long' ? 'too_large' : 'unreadable');
      } else setNote('save_failed');
    } finally {
      busy.current = false;
      setSaving(false);
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
      remember(await api.correctVoiceTranscript(session.id, words));
      setNote('corrected');
    } catch {
      setNote('failed');
    } finally {
      busy.current = false;
    }
  }

  async function play() {
    if (busy.current || !session?.recording?.audioStored) return;
    busy.current = true;
    try {
      setPlayback((await api.voiceAudioLink(session.id)).url);
    } catch {
      setNote('failed');
    } finally {
      busy.current = false;
    }
  }

  async function removeAudio() {
    setConfirmRemove(false);
    if (busy.current || !session?.recording || session.recording.audioDeleted) return;
    busy.current = true;
    setNote(null);
    try {
      remember(await api.deleteVoiceAudio(session.id));
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
          <a className="inline-flex min-h-career-touch items-center rounded-md bg-career-navy px-4 text-sm font-semibold text-white dark:text-stone-950" href={signInHref}>
            {t('go_sign_in')}
          </a>
        }
      />
    );
  }

  const takeLimit = Math.min(remaining, MAX_VOICE_TAKE_SECONDS);
  const savedSummary = session && session.summary !== NO_RECORDING ? session.summary : null;
  const canPractice = consented && planIncludesVoice && !recording && (opportunityId !== null || role.trim().length >= 2);
  const take = session && !session.recording ? session : null;

  return (
    <div data-testid="voice-layout" className="flex min-w-0 flex-col gap-6">
      <div>
        <h1 className="text-balance text-2xl font-bold text-stone-900 dark:text-white">{t('title')}</h1>
        <p className="mt-2 text-sm text-career-muted">{t('remaining', { time: clock(remaining), seconds: remaining })}</p>
        <p className="mt-1 text-sm text-career-muted">{t('not_a_score')}</p>
        <a className="mt-2 inline-flex min-h-career-touch items-center text-sm font-semibold text-career-orange-text" href={`/${locale}/career/interviews`}>
          {t('text_link')}
        </a>
      </div>
      {!planIncludesVoice || note === 'upgrade' ? <PlanUpgradeState title={t('upgrade_title')} body={t('upgrade_body')} /> : null}
      {note === 'quota' ? <QuotaExhaustedState title={t('quota_title')} body={t('quota_body')} /> : null}
      {note === 'failed' ? <FailedJobState title={t('failed_title')} body={t('failed_body')} /> : null}
      {note === 'save_failed' ? <FailedJobState title={t('save_failed_title')} body={t('save_failed_body')} /> : null}
      {note === 'unreadable' ? <InlineNote tone="error">{t('audio_unreadable')}</InlineNote> : null}
      {note === 'too_large' ? <InlineNote tone="error">{t('audio_too_large')}</InlineNote> : null}
      {note === 'no_facts' ? <InlineNote tone="error">{t('no_facts')}</InlineNote> : null}
      {note === 'truncated' ? <p className="text-sm text-career-warning">{t('truncated')}</p> : null}
      {note === 'deleted' ? <p role="status" className="text-sm text-career-ink">{t('audio_deleted')}</p> : null}
      {note === 'corrected' ? <p role="status" className="text-sm text-career-ink">{t('corrected')}</p> : null}
      {note === 'transcribed' ? <p role="status" className="text-sm text-career-ink">{t('transcribed')}</p> : null}
      {note === 'transcription_unavailable' ? <p role="status" className="text-sm text-career-ink">{t('transcription_unavailable')}</p> : null}
      {note === 'transcription_failed' ? <p role="status" className="text-sm text-career-ink">{t('transcription_failed')}</p> : null}
      {note === 'withdrawn' ? <p role="status" className="text-sm text-career-ink">{t('consent_withdrawn')}</p> : null}

      <Card>
        <label className="flex min-h-career-touch items-center gap-3 text-sm text-career-ink">
          <input type="checkbox" className="h-4 w-4" checked={consented} disabled={recording} onChange={(event) => void agree(event.target.checked)} />
          {t('consent')}
        </label>
        <p className="mt-2 text-sm text-career-muted">{t('consent_help')}</p>
        <p className="mt-1 text-sm text-career-muted">{t('consent_withdraw_help')}</p>

        <div className="mt-4 flex flex-col gap-3">
          <label className="flex flex-col gap-1 text-sm font-semibold text-career-ink" htmlFor="voice-stage">
            {t('stage_label')}
            <select
              id="voice-stage"
              className="min-h-career-touch rounded-md border border-career-line bg-career-surface px-3 text-sm font-normal text-career-ink"
              value={stage}
              disabled={recording}
              onChange={(event) => setStage(event.target.value as InterviewStage)}
            >
              {INTERVIEW_STAGES.map((value) => (
                <option key={value} value={value}>
                  {t(`stage_${value}`)}
                </option>
              ))}
            </select>
          </label>
          {opportunityId ? (
            <p className="text-sm text-career-muted">{t('for_listing')}</p>
          ) : (
            <>
              <Input label={t('role_label')} value={role} maxLength={120} onChange={(event) => setRole(event.target.value)} />
              <p className="text-sm text-career-muted">
                {t('pick_listing')}{' '}
                <a className="font-semibold text-career-orange-text" href={`/${locale}/career/opportunities`}>
                  {t('search_link')}
                </a>
              </p>
            </>
          )}
          <p className="text-sm text-career-muted">{t('open_free')}</p>
          <Button className="self-start" disabled={!canPractice} onClick={() => void begin('practice')}>
            {t('open_question')}
          </Button>
        </div>
      </Card>

      {session ? (
        <Card>
          <p className="text-sm text-career-muted">
            {session.title}
            {session.stage ? ` · ${t(`stage_${session.stage}`)}` : ''}
          </p>
          <p className="mt-2 text-sm text-career-ink">{session.prompt}</p>
          {session.guidance ? <p className="mt-2 text-sm text-career-ink">{session.guidance}</p> : null}

          {take ? (
            <div className="mt-4 flex flex-col gap-3">
              <div data-testid="voice-charge" className="rounded-md border border-career-line p-3 text-sm text-career-ink">
                <p className="font-semibold">{t('charge_operation')}</p>
                <p className="mt-1">{t('charge_cost', { max: clock(takeLimit) })}</p>
                <p className="mt-1">{t('charge_balance', { time: clock(remaining), seconds: remaining })}</p>
                <p className="mt-1 text-career-muted">{transcriptionAvailable ? t('charge_transcription_included') : t('charge_transcription_off')}</p>
              </div>
              {recorder.status === 'unsupported' ? <InlineNote tone="error">{t('recorder_unsupported')}</InlineNote> : null}
              {recorder.status === 'denied' ? <InlineNote tone="error">{t('mic_denied')}</InlineNote> : null}
              {recorder.status === 'error' ? <InlineNote tone="error">{t('recorder_error')}</InlineNote> : null}
              {recording ? (
                <div className="flex flex-wrap items-center gap-3">
                  <p role="status" className="text-sm font-semibold text-career-ink">
                    {t('recording_now', { elapsed: clock(recorder.elapsed), limit: clock(takeLimit) })}
                  </p>
                  <Button variant="danger" onClick={() => recorder.stop()}>
                    {t('stop_recording')}
                  </Button>
                </div>
              ) : recorder.take ? (
                <div className="flex flex-col gap-3">
                  {takeUrl ? <audio controls src={takeUrl} aria-label={t('take_preview')} /> : null}
                  <p className="text-sm text-career-muted">{t('take_ready', { seconds: recorder.elapsed })}</p>
                  <div className="flex flex-wrap gap-3">
                    <Button loading={saving} loadingLabel={t('saving')} onClick={() => void saveTake()}>
                      {t('save_take')}
                    </Button>
                    <Button variant="secondary" disabled={saving} onClick={() => recorder.discard()}>
                      {t('discard_take')}
                    </Button>
                  </div>
                </div>
              ) : (
                <Button
                  className="self-start"
                  disabled={!consented || !planIncludesVoice || takeLimit < 1 || recorder.status === 'unsupported'}
                  onClick={() => void recorder.start(takeLimit)}
                >
                  {t('start_recording')}
                </Button>
              )}
            </div>
          ) : null}

          {savedSummary ? (
            <p className="mt-4 text-sm text-career-ink">
              {t('summary_label')}: {savedSummary}
            </p>
          ) : null}

          {session.recording ? (
            <div className="mt-4 flex flex-col gap-3">
              <p className="text-sm text-career-muted">{t('billed', { seconds: session.recording.durationSeconds })}</p>
              {session.recording.feedback ? (
                <ul data-testid="voice-feedback" className="flex flex-col gap-1 text-sm text-career-ink">
                  <li>{t(`fb_relevance_${session.recording.feedback.relevance}`)}</li>
                  <li>{t(`fb_structure_${session.recording.feedback.structure}`)}</li>
                  <li>{t(`fb_specificity_${session.recording.feedback.specificity}`)}</li>
                  <li>{t(`fb_evidence_${session.recording.feedback.evidence}`)}</li>
                </ul>
              ) : (
                <p className="text-sm text-career-muted">{t('feedback_pending')}</p>
              )}
              <label className="text-sm font-semibold text-career-ink" htmlFor="voice-correction">
                {session.recording.transcriptSource === 'pending' ? t('type_transcript') : t('saved_transcript')}
              </label>
              <textarea
                id="voice-correction"
                className="min-h-24 rounded-md border border-career-line px-3 py-2 text-sm text-career-ink"
                value={correction}
                maxLength={10000}
                onChange={(event) => setCorrection(event.target.value)}
              />
              <p className="text-sm text-career-muted">
                {session.recording.transcriptSource === 'transcribed' ? t('transcribed_help') : t('saved_transcript_help')}
              </p>
              <Button className="self-start" onClick={() => void correct()}>
                {session.recording.transcriptSource === 'pending' ? t('save_transcript') : t('save_correction')}
              </Button>
              {session.recording.audioStored ? (
                <div className="flex flex-wrap items-center gap-3">
                  <Button variant="secondary" onClick={() => void play()}>
                    {t('play_back')}
                  </Button>
                  <Button variant="danger-ghost" onClick={() => setConfirmRemove(true)}>
                    {t('delete_audio')}
                  </Button>
                </div>
              ) : session.recording.audioDeleted ? (
                <p className="text-sm text-career-muted">{t('audio_removed_state')}</p>
              ) : null}
              {playback ? <audio controls autoPlay src={playback} aria-label={t('play_back')} /> : null}
            </div>
          ) : null}
        </Card>
      ) : null}

      {sessions.length > 1 ? (
        <Card>
          <h2 className="text-lg font-semibold text-career-ink">{t('earlier_title')}</h2>
          <p className="mt-1 text-sm text-career-muted">{t('earlier_help')}</p>
          <ul className="mt-3 flex flex-col gap-2">
            {sessions.map((item) => (
              <li key={item.id}>
                <button
                  type="button"
                  disabled={recording}
                  aria-current={session?.id === item.id ? 'true' : undefined}
                  className="min-h-career-touch w-full rounded-md border border-career-line px-3 py-2 text-left text-sm text-career-ink hover:bg-career-wash aria-[current=true]:border-career-orange-text"
                  onClick={() => {
                    recorder.discard();
                    show(item);
                  }}
                >
                  {item.title}
                  {item.stage ? ` · ${t(`stage_${item.stage}`)}` : ''} · {new Date(item.createdAt).toLocaleDateString(locale)} ·{' '}
                  {item.recording ? t('earlier_recorded', { seconds: item.recording.durationSeconds }) : t('earlier_not_recorded')}
                </button>
              </li>
            ))}
          </ul>
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
          <p className="text-sm text-career-muted">{t('open_free')}</p>
          <Button type="submit" disabled={!consented || !planIncludesVoice || recording || offer.trim().length === 0}>
            {t('start_negotiation')}
          </Button>
        </form>
      </Card>

      <ConfirmDialog
        open={confirmRemove}
        title={t('delete_confirm_title')}
        body={t('delete_confirm_body')}
        confirmLabel={t('delete_audio')}
        cancelLabel={t('cancel')}
        danger
        onConfirm={() => void removeAudio()}
        onCancel={() => setConfirmRemove(false)}
      />
    </div>
  );
}
