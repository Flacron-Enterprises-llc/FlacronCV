import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter, type Href } from 'expo-router';
import React, { useState } from 'react';
import { Alert, KeyboardAvoidingView, Linking, Platform, Pressable, RefreshControl, ScrollView, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { isApiError } from '../../../../../../packages/career-api-client/src/client';
import type { InterviewStage, VoiceSession } from '../../../../../../packages/career-api-client/src/types';
import { CareerHeader, Pill } from '../../../../src/components/career/CareerHeader';
import { AudioPlayback } from '../../../../src/components/career/interviews/AudioPlayback';
import { Button } from '../../../../src/components/ui/Button';
import { EmptyState } from '../../../../src/components/ui/EmptyState';
import { ErrorState } from '../../../../src/components/ui/ErrorState';
import { Input } from '../../../../src/components/ui/Input';
import { SkeletonCard } from '../../../../src/components/ui/Skeleton';
import {
  TakeTooLarge,
  useCorrectVoiceTranscript,
  useDeleteVoiceAudio,
  useRecordVoice,
  useStartVoice,
  useVoiceAudioLink,
  useVoiceConsent,
  useVoiceInterviews,
} from '../../../../src/hooks/career/voice';
import { useVoiceRecorder } from '../../../../src/hooks/career/voice-recorder';
import { useCareerAccess } from '../../../../src/hooks/useCareer';
import { useLeaveGuard } from '../../../../src/hooks/useLeaveGuard';
import { formatDay } from '../../../../src/lib/career-view';
import { opportunityParam } from '../../../../src/lib/career/documents';
import { INTERVIEW_STAGES, STAGE_LABEL, feedbackLines } from '../../../../src/lib/career/interviews';
import {
  KIND_LABEL,
  TRANSCRIPT_MAX,
  canOpenPractice,
  clock,
  negotiationInput,
  practiceInput,
  recordErrorNote,
  recordResultNote,
  remainingLine,
  savedSummary,
  startErrorNote,
  takeLimitSeconds,
  transcriptHelpKey,
  transcriptionLanguage,
  voiceErrorMessage,
  voiceNote,
  type VoiceNote,
} from '../../../../src/lib/career/voice';
import { colors } from '../../../../src/theme/colors';
import { useLocale, useT } from '../../../../src/i18n';

type Notice = { tone: 'info' | 'warning'; text: string };

/**
 * Voice practice, as on the website (career/interviews/voice): consent
 * (given and withdrawn here), a stage and a role or the listing opened, a
 * practice or negotiation question (free to open), then a recorded take.
 * Before recording the screen shows the time left and this take's cap; the
 * recorder stops itself at that cap. The take can be played back and
 * discarded before anything is uploaded; saving uploads the file, which the
 * server measures and bills by the second. When no speech provider is
 * connected the person types what they said (free) to get feedback.
 * "Remove recording" deletes the audio and keeps the summary.
 */
export default function VoicePracticeScreen() {
  const t = useT('careerInterviews');
  const router = useRouter();
  const locale = useLocale();
  const params = useLocalSearchParams<{ opportunityId?: string }>();
  const access = useCareerAccess();
  const list = useVoiceInterviews();
  const consent = useVoiceConsent();
  const startVoice = useStartVoice();
  const recordVoice = useRecordVoice();
  const audioLink = useVoiceAudioLink();
  const correct = useCorrectVoiceTranscript();
  const removeAudio = useDeleteVoiceAudio();
  const recorder = useVoiceRecorder();

  const [listingId, setListingId] = useState<string | null>(() => opportunityParam(params.opportunityId));
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [stage, setStage] = useState<InterviewStage>('behavioral');
  const [role, setRole] = useState('');
  const [offer, setOffer] = useState('');
  const [salarySource, setSalarySource] = useState('');
  const [corrections, setCorrections] = useState<Record<string, string>>({});
  const [notice, setNotice] = useState<Notice | null>(null);
  const [playback, setPlayback] = useState<{ sessionId: string; url: string } | null>(null);

  const data = list.data;
  const items = data?.items ?? [];
  const session: VoiceSession | null = items.find((s) => s.id === selectedId) ?? items[0] ?? null;
  const recording = session?.recording ?? null;
  const correction = session && recording ? (corrections[session.id] ?? recording.transcript) : '';
  const correctionDirty = Boolean(
    session && recording && corrections[session.id] !== undefined && corrections[session.id] !== recording.transcript,
  );
  const live = recorder.status === 'recording' || recorder.status === 'requesting';
  const takePending = recorder.take !== null;
  // A take that is recording or not yet saved holds the screen: no switching sessions or opening new questions.
  const locked = live || takePending || recordVoice.isPending;
  useLeaveGuard(correctionDirty || takePending || live);

  const busy = consent.isPending || startVoice.isPending || correct.isPending || removeAudio.isPending || audioLink.isPending;
  const show = (note: VoiceNote) => setNotice(voiceNote(note));

  const toggleConsent = () => {
    if (!data || busy || live) return;
    const agree = !data.consent;
    setNotice(null);
    consent.mutate(agree, {
      onSuccess: () => (agree ? undefined : show('withdrawn')),
      onError: () => show('actionFailed'),
    });
  };

  const open = (kind: 'practice' | 'negotiation') => {
    if (!data || busy || locked) return;
    const input = kind === 'practice' ? practiceInput(listingId, role, stage) : negotiationInput(offer, salarySource);
    if (!input) return;
    setNotice(null);
    startVoice.mutate(input, {
      onSuccess: (opened) => {
        setSelectedId(opened.id);
        setPlayback(null);
      },
      onError: (error) => show(startErrorNote(error)),
    });
  };

  const saveTake = () => {
    if (!session || !recorder.take || recordVoice.isPending) return;
    const take = recorder.take;
    setNotice(null);
    recordVoice.mutate(
      { sessionId: session.id, uri: take.uri, idempotencyKey: take.idempotencyKey, language: transcriptionLanguage(locale) },
      {
        onSuccess: (result) => {
          recorder.discard();
          const note = recordResultNote(result);
          if (note) show(note);
        },
        // The take stays on the device so it can be saved again under the same key.
        onError: (error) => show(error instanceof TakeTooLarge ? 'tooLarge' : recordErrorNote(error)),
      },
    );
  };

  const confirmDiscard = () => {
    if (!recorder.take || recordVoice.isPending) return;
    Alert.alert(t('voice.discardTake'), t('voice.takeReady', { seconds: recorder.take.seconds }), [
      { text: t('voice.keepIt'), style: 'cancel' },
      { text: t('voice.discardTake'), style: 'destructive', onPress: () => recorder.discard() },
    ]);
  };

  const saveCorrection = () => {
    if (!session?.recording || busy) return;
    const words = correction.trim();
    if (words.length === 0) {
      setNotice({ tone: 'warning', text: t('voice.typeWordsFirst') });
      return;
    }
    setNotice(null);
    correct.mutate(
      { sessionId: session.id, transcript: words },
      {
        onSuccess: (saved) => {
          setCorrections((prev) => {
            const next = { ...prev };
            delete next[saved.id];
            return next;
          });
          show('corrected');
        },
        onError: (error) => setNotice({ tone: 'warning', text: voiceErrorMessage(error, 'correct') }),
      },
    );
  };

  const play = () => {
    if (!session?.recording?.audioStored || busy) return;
    const target = session.id;
    audioLink.mutate(target, {
      onSuccess: (link) => setPlayback({ sessionId: target, url: link.url }),
      onError: () => show('playFailed'),
    });
  };

  const confirmRemoveAudio = () => {
    if (!session?.recording || session.recording.audioDeleted || busy) return;
    const target = session.id;
    Alert.alert(t('voice.removeTitle'), t('voice.removeBody'), [
      { text: t('voice.keepIt'), style: 'cancel' },
      {
        text: t('voice.removeRecording'),
        style: 'destructive',
        onPress: () => {
          setNotice(null);
          setPlayback(null);
          removeAudio.mutate(target, {
            onSuccess: () => show('deleted'),
            onError: (error) => setNotice({ tone: 'warning', text: voiceErrorMessage(error, 'delete') }),
          });
        },
      },
    ]);
  };

  const selectSession = (id: string) => {
    if (id === session?.id || locked) return;
    const go = () => {
      setSelectedId(id);
      setPlayback(null);
    };
    if (!correctionDirty) {
      go();
      return;
    }
    Alert.alert(t('session.discardTitle'), t('session.discardBody'), [
      { text: t('session.keepWriting'), style: 'cancel' },
      {
        text: t('session.discard'),
        style: 'destructive',
        onPress: () => {
          setCorrections({});
          go();
        },
      },
    ]);
  };

  const switchedOff = access.data?.features?.voiceMinutes === false || isApiError(list.error, 'feature_unavailable');

  let content: React.ReactNode;
  if (access.data && !access.data.enabled) {
    content = <EmptyState icon="lock-closed-outline" title={t('list.locked')} />;
  } else if (switchedOff) {
    content = <EmptyState icon="mic-off-outline" title={t('voice.offTitle')} description={t('voice.offBody')} />;
  } else if (access.isLoading || list.isLoading) {
    content = (
      <View className="p-5">
        <SkeletonCard />
        <SkeletonCard />
      </View>
    );
  } else if (access.error || list.error || !data) {
    content = <ErrorState message={voiceErrorMessage(list.error ?? access.error, 'load')} onRetry={() => void list.refetch()} />;
  } else {
    const summary = savedSummary(session);
    const limit = takeLimitSeconds(data.remainingSeconds);
    const practiceReady = canOpenPractice({
      consented: data.consent,
      planIncludesVoice: data.planIncludesVoice,
      recording: locked,
      opportunityId: listingId,
      role,
    });
    const negotiationReady = data.consent && data.planIncludesVoice && !locked && offer.trim().length > 0;
    const awaitingTake = session !== null && session.recording === null;

    content = (
      <ScrollView
        contentContainerStyle={{ padding: 20, paddingBottom: 48 }}
        keyboardShouldPersistTaps="handled"
        refreshControl={
          <RefreshControl refreshing={list.isRefetching} onRefresh={() => (live ? undefined : void list.refetch())} tintColor={colors.brand[600]} />
        }
      >
        <Text className="text-stone-900 font-semibold">{remainingLine(data.remainingSeconds)}</Text>
        <Text className="text-stone-500 text-sm mt-1 leading-5">{t('voice.notAScore')}</Text>
        <Pressable
          onPress={() => router.push('/(dashboard)/career/interviews' as Href)}
          accessibilityRole="link"
          className="min-h-[44px] justify-center self-start"
        >
          <Text className="text-brand-700 font-semibold text-sm">{t('voice.textLink')}</Text>
        </Pressable>

        {!data.planIncludesVoice ? (
          <View className="bg-warning-bg rounded-2xl p-4 mt-2">
            <Text className="text-warning font-semibold">{t('voice.planTitle')}</Text>
            <Text className="text-warning text-sm mt-1">{t('voice.planBody')}</Text>
          </View>
        ) : null}

        {notice ? (
          <View className={`${notice.tone === 'warning' ? 'bg-warning-bg' : 'bg-success-bg'} rounded-xl p-3 mt-4`} accessibilityLiveRegion="polite">
            <Text className={`${notice.tone === 'warning' ? 'text-warning' : 'text-success'} text-sm leading-5`}>{notice.text}</Text>
          </View>
        ) : null}

        {/* Consent: ticking gives it, unticking withdraws it, never mid-recording. */}
        <View className="bg-white border border-stone-100 rounded-2xl p-4 mt-4">
          <Pressable
            onPress={toggleConsent}
            disabled={busy || live}
            accessibilityRole="checkbox"
            accessibilityState={{ checked: data.consent, disabled: busy || live }}
            accessibilityLabel={t('voice.consentA11y')}
            className="flex-row items-center min-h-[44px]"
          >
            <Ionicons name={data.consent ? 'checkbox' : 'square-outline'} size={24} color={data.consent ? colors.brand[600] : colors.stone[400]} />
            <Text className="ms-3 flex-1 text-stone-900 text-sm leading-5">{t('voice.consent')}</Text>
          </Pressable>
          <Text className="text-stone-500 text-xs mt-2 leading-4">{t('voice.consentHelp')}</Text>
          <Text className="text-stone-500 text-xs mt-1 leading-4">{t('voice.consentWithdrawHelp')}</Text>

          <Text className="text-sm font-semibold text-stone-700 mt-4 mb-2">{t('voice.stageLabel')}</Text>
          <View className="flex-row flex-wrap gap-2">
            {INTERVIEW_STAGES.map((value) => {
              const on = value === stage;
              return (
                <Pressable
                  key={value}
                  onPress={() => setStage(value)}
                  disabled={locked}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: on, disabled: locked }}
                  accessibilityLabel={t('list.stageA11y', { stage: STAGE_LABEL[value] })}
                  className={`min-h-[44px] px-3 rounded-xl border justify-center ${on ? 'border-brand-400 bg-brand-50' : 'border-stone-200 bg-white'}`}
                >
                  <Text className={`text-sm ${on ? 'text-brand-700 font-semibold' : 'text-stone-700'}`}>{STAGE_LABEL[value]}</Text>
                </Pressable>
              );
            })}
          </View>

          {listingId ? (
            <View className="mt-4">
              <Text className="text-stone-700 text-sm leading-5">{t('voice.forListing')}</Text>
              <Pressable onPress={() => setListingId(null)} disabled={locked} accessibilityRole="button" className="min-h-[44px] justify-center self-start">
                <Text className="text-brand-700 font-semibold text-sm">{t('list.modeRole')}</Text>
              </Pressable>
            </View>
          ) : (
            <View className="mt-4">
              <Input label={t('voice.roleLabel')} value={role} onChangeText={setRole} maxLength={120} editable={!locked} />
              <Text className="text-stone-500 text-xs mt-1 leading-4">{t('voice.pickListing')}</Text>
              <Pressable
                onPress={() => router.push('/(dashboard)/career/opportunities' as Href)}
                accessibilityRole="link"
                className="min-h-[44px] justify-center self-start"
              >
                <Text className="text-brand-700 font-semibold text-sm">{t('voice.searchLink')}</Text>
              </Pressable>
            </View>
          )}
          <Text className="text-stone-500 text-xs mt-2 leading-4">{t('voice.openFree')}</Text>
          <Button className="mt-3" fullWidth onPress={() => open('practice')} loading={startVoice.isPending} disabled={!practiceReady || busy}>
            {t('voice.openQuestion')}
          </Button>
        </View>

        {session ? (
          <View className="bg-white border border-stone-100 rounded-2xl p-4 mt-4">
            <View className="flex-row items-start justify-between">
              <Text className="font-bold text-stone-900 flex-1 me-2">
                {session.stage ? `${session.title} · ${STAGE_LABEL[session.stage]}` : session.title}
              </Text>
              <Pill label={KIND_LABEL[session.kind].toUpperCase()} tone="brand" />
            </View>
            <Text className="text-stone-800 text-sm mt-2 leading-5">{session.prompt}</Text>
            {session.guidance && session.guidance !== session.prompt ? (
              <Text className="text-stone-700 text-sm mt-2 leading-5">{session.guidance}</Text>
            ) : null}

            {awaitingTake ? (
              <TakePanel
                limit={limit}
                remaining={data.remainingSeconds}
                transcriptionAvailable={data.transcriptionAvailable}
                canRecord={data.consent && data.planIncludesVoice && limit >= 1}
                recorder={recorder}
                saving={recordVoice.isPending}
                onSave={saveTake}
                onDiscard={confirmDiscard}
              />
            ) : null}

            {summary ? <Text className="text-stone-800 text-sm mt-3 leading-5">{t('voice.summary', { summary })}</Text> : null}

            {recording ? (
              <View className="mt-4">
                <Text className="text-stone-500 text-xs">{t('voice.billed', { seconds: recording.durationSeconds })}</Text>
                {recording.feedback ? (
                  <View className="mt-3 gap-1">
                    {feedbackLines(recording.feedback).map((line) => (
                      <View key={line.label} className="flex-row items-start">
                        <Ionicons
                          name={line.good ? 'checkmark-circle-outline' : 'ellipse-outline'}
                          size={16}
                          color={line.good ? colors.success.DEFAULT : colors.stone[400]}
                          style={{ marginTop: 2 }}
                        />
                        <Text className="text-stone-600 text-xs ms-1.5 flex-1 leading-5">{`${line.label}: ${line.text}`}</Text>
                      </View>
                    ))}
                  </View>
                ) : (
                  <Text className="text-stone-500 text-xs mt-2 leading-4">{t('voice.feedbackPending')}</Text>
                )}

                <Text className="text-sm font-semibold text-stone-700 mt-4 mb-1.5">
                  {recording.transcriptSource === 'pending' ? t('voice.typeTranscript') : t('voice.savedTranscript')}
                </Text>
                <TextInput
                  value={correction}
                  onChangeText={(text) => setCorrections((prev) => ({ ...prev, [session.id]: text }))}
                  multiline
                  maxLength={TRANSCRIPT_MAX}
                  textAlignVertical="top"
                  accessibilityLabel={recording.transcriptSource === 'pending' ? t('voice.typeTranscript') : t('voice.savedTranscript')}
                  placeholder={t('voice.transcriptPlaceholder')}
                  placeholderTextColor={colors.stone[400]}
                  className={`bg-white border rounded-xl px-3 py-2.5 text-base text-stone-900 min-h-[100px] ${correctionDirty ? 'border-brand-400' : 'border-stone-200'}`}
                />
                <Text className="text-stone-500 text-xs mt-1 leading-4">{t(transcriptHelpKey(recording.transcriptSource))}</Text>
                <Button className="mt-3" fullWidth variant="outline" onPress={saveCorrection} loading={correct.isPending} disabled={!correctionDirty || busy}>
                  {recording.transcriptSource === 'pending' ? t('voice.saveTranscript') : t('voice.saveCorrection')}
                </Button>

                {recording.audioStored && !recording.audioDeleted ? (
                  <>
                    {playback?.sessionId === session.id ? (
                      <AudioPlayback key={playback.url} uri={playback.url} label={t('voice.playBack')} autoPlay />
                    ) : (
                      <Button className="mt-2" fullWidth variant="outline" onPress={play} loading={audioLink.isPending} disabled={busy}>
                        {t('voice.playBack')}
                      </Button>
                    )}
                    <Button className="mt-2" fullWidth variant="ghost" onPress={confirmRemoveAudio} loading={removeAudio.isPending} disabled={busy}>
                      {t('voice.removeRecording')}
                    </Button>
                  </>
                ) : recording.audioDeleted ? (
                  <Text className="text-stone-500 text-xs mt-3">{t('voice.audioRemovedState')}</Text>
                ) : null}
              </View>
            ) : null}
          </View>
        ) : (
          <View className="bg-white border border-stone-100 rounded-2xl p-4 mt-4">
            <Text className="font-semibold text-stone-800">{t('voice.emptyTitle')}</Text>
            <Text className="text-stone-500 text-sm mt-1 leading-5">{t('voice.emptyBody')}</Text>
          </View>
        )}

        {items.length > 0 ? (
          <>
            <Text className="text-sm font-semibold text-stone-500 uppercase tracking-wide mt-6 mb-1" accessibilityRole="header">
              {t('voice.yourSessions')}
            </Text>
            <Text className="text-stone-500 text-xs mb-2 leading-4">{t('voice.earlierHelp')}</Text>
            {items.map((item) => {
              const on = item.id === session?.id;
              const state = item.recording ? t('voice.earlierRecorded', { seconds: item.recording.durationSeconds }) : t('voice.earlierNotRecorded');
              return (
                <Pressable
                  key={item.id}
                  onPress={() => selectSession(item.id)}
                  disabled={busy || locked}
                  accessibilityRole="button"
                  accessibilityState={{ selected: on, disabled: busy || locked }}
                  accessibilityLabel={`${KIND_LABEL[item.kind]}: ${item.title}, ${state}`}
                  className={`min-h-[44px] rounded-2xl border p-3 mb-2 ${on ? 'border-brand-400 bg-brand-50' : 'border-stone-100 bg-white'}`}
                >
                  <Text className="text-stone-900 text-sm font-semibold">
                    {`${KIND_LABEL[item.kind]} · ${item.title}${item.stage ? ` · ${STAGE_LABEL[item.stage]}` : ''}`}
                  </Text>
                  <Text className="text-stone-400 text-xs mt-0.5">{`${formatDay(item.createdAt) ?? ''} · ${state}`}</Text>
                </Pressable>
              );
            })}
          </>
        ) : null}

        <View className="bg-white border border-stone-100 rounded-2xl p-4 mt-4">
          <Text className="font-bold text-stone-900 mb-3" accessibilityRole="header">
            {t('voice.negotiationTitle')}
          </Text>
          <Input label={t('voice.offer')} value={offer} onChangeText={setOffer} maxLength={500} editable={!locked} />
          <Input label={t('voice.salarySource')} value={salarySource} onChangeText={setSalarySource} maxLength={500} editable={!locked} />
          <Text className="text-stone-500 text-xs leading-4">{t('voice.openFree')}</Text>
          <Button className="mt-3" fullWidth variant="outline" onPress={() => open('negotiation')} loading={startVoice.isPending} disabled={!negotiationReady || busy}>
            {t('voice.startNegotiation')}
          </Button>
        </View>
      </ScrollView>
    );
  }

  return (
    <SafeAreaView className="flex-1 bg-stone-50" edges={['top', 'bottom']}>
      <CareerHeader title={t('voice.title')} />
      <KeyboardAvoidingView className="flex-1" behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        {content}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

/**
 * The charge notice and the recorder for a session without a take: start,
 * stop at the cap, then listen, save (upload, billed by the second) or
 * discard (nothing sent). A refused microphone is explained, with a way to
 * the system settings when the prompt will not show again.
 */
function TakePanel({
  limit,
  remaining,
  transcriptionAvailable,
  canRecord,
  recorder,
  saving,
  onSave,
  onDiscard,
}: {
  limit: number;
  remaining: number;
  transcriptionAvailable: boolean;
  canRecord: boolean;
  recorder: ReturnType<typeof useVoiceRecorder>;
  saving: boolean;
  onSave: () => void;
  onDiscard: () => void;
}) {
  const t = useT('careerInterviews.voice');
  const seconds = Math.max(0, Math.floor(remaining));
  const live = recorder.status === 'recording' || recorder.status === 'requesting';
  return (
    <View className="mt-4">
      <View className="border border-stone-200 rounded-xl p-3" accessibilityRole="summary">
        <Text className="text-stone-900 text-sm font-semibold">{t('chargeOperation')}</Text>
        <Text className="text-stone-700 text-sm mt-1 leading-5">{t('chargeCost', { max: clock(limit) })}</Text>
        <Text className="text-stone-700 text-sm mt-1 leading-5">{t('chargeBalance', { time: clock(seconds), seconds })}</Text>
        <Text className="text-stone-500 text-xs mt-1 leading-4">
          {transcriptionAvailable ? t('chargeTranscriptionIncluded') : t('chargeTranscriptionOff')}
        </Text>
      </View>

      {recorder.status === 'denied' ? (
        <View className="bg-warning-bg rounded-xl p-3 mt-3" accessibilityLiveRegion="polite">
          <Text className="text-warning text-sm leading-5">{recorder.canAskAgain ? t('micAskAgain') : t('micDenied')}</Text>
          {!recorder.canAskAgain ? (
            <Button className="mt-2 self-start" size="sm" variant="outline" onPress={() => void Linking.openSettings()}>
              {t('openSettings')}
            </Button>
          ) : null}
        </View>
      ) : null}
      {recorder.status === 'error' ? (
        <View className="bg-warning-bg rounded-xl p-3 mt-3" accessibilityLiveRegion="polite">
          <Text className="text-warning text-sm leading-5">{t('recorderError')}</Text>
        </View>
      ) : null}

      {live ? (
        <View className="mt-3">
          <View className="flex-row items-center" accessibilityLiveRegion="polite">
            <View className="w-3 h-3 rounded-full bg-red-600 me-2" />
            <Text className="text-stone-900 text-sm font-semibold">
              {t('recordingNow', { elapsed: clock(recorder.elapsed), limit: clock(limit) })}
            </Text>
          </View>
          <Button className="mt-3" fullWidth variant="danger" onPress={() => void recorder.stop()} disabled={recorder.status !== 'recording'}>
            {t('stopRecording')}
          </Button>
        </View>
      ) : recorder.take ? (
        <View className="mt-3">
          {recorder.stoppedInBackground ? (
            <Text className="text-stone-600 text-xs mb-1 leading-4">{t('backgroundStopped')}</Text>
          ) : null}
          <AudioPlayback key={recorder.take.uri} uri={recorder.take.uri} label={t('takePreview')} />
          <Text className="text-stone-500 text-xs mt-2 leading-4">{t('takeReady', { seconds: recorder.take.seconds })}</Text>
          <Button className="mt-3" fullWidth onPress={onSave} loading={saving}>
            {t('saveTake')}
          </Button>
          <Button className="mt-2" fullWidth variant="outline" onPress={onDiscard} disabled={saving}>
            {t('discardTake')}
          </Button>
        </View>
      ) : (
        <Button className="mt-3" fullWidth onPress={() => void recorder.start(limit)} disabled={!canRecord}>
          {t('startRecording')}
        </Button>
      )}
    </View>
  );
}
