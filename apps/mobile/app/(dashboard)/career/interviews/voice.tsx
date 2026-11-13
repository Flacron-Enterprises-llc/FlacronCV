import { Ionicons } from '@expo/vector-icons';
import * as Crypto from 'expo-crypto';
import { useLocalSearchParams, useRouter, type Href } from 'expo-router';
import React, { useEffect, useRef, useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, Pressable, RefreshControl, ScrollView, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { isApiError } from '../../../../../../packages/career-api-client/src/client';
import type { VoiceSession } from '../../../../../../packages/career-api-client/src/types';
import { CareerHeader, Pill } from '../../../../src/components/career/CareerHeader';
import { Button } from '../../../../src/components/ui/Button';
import { EmptyState } from '../../../../src/components/ui/EmptyState';
import { ErrorState } from '../../../../src/components/ui/ErrorState';
import { Input } from '../../../../src/components/ui/Input';
import { SkeletonCard } from '../../../../src/components/ui/Skeleton';
import {
  useConsentVoice,
  useCorrectVoiceTranscript,
  useDeleteVoiceAudio,
  useRecordVoice,
  useStartVoice,
  useVoiceInterviews,
} from '../../../../src/hooks/career/voice';
import { useCareerAccess, useCareerOpportunities } from '../../../../src/hooks/useCareer';
import { useLeaveGuard } from '../../../../src/hooks/useLeaveGuard';
import { formatDay } from '../../../../src/lib/career-view';
import {
  KIND_LABEL,
  OFFER_MAX,
  VOICE_CONSENT_VERSION,
  clock,
  negotiationErrors,
  remainingLine,
  savedSummary,
  takeSeconds,
  voiceErrorMessage,
  voiceGate,
} from '../../../../src/lib/career/voice';
import { colors } from '../../../../src/theme/colors';
import { useT } from '../../../../src/i18n';

const TRANSCRIPT_MAX = 10_000;

type Take = { sessionId: string; startedAt: number; stoppedAt: number | null };
type Notice = { tone: 'info' | 'warning'; text: string };

/**
 * Voice practice over the website's typed path. The app records no audio and
 * no speech service is connected: the user starts the timer, practices out
 * loud, then types the words they said. Stopping saves the take (voice seconds
 * are metered; a retry of the same take reuses its idempotency key). The saved
 * transcript can be corrected without using time, and the take can be
 * removed while its summary stays. Agreeing to record is a recorded
 * acceptance (version voice-recording-1) and asks first.
 */
export default function VoicePracticeScreen() {
  const t = useT('careerInterviews');
  const router = useRouter();
  const params = useLocalSearchParams<{ opportunityId?: string }>();
  const access = useCareerAccess();
  const list = useVoiceInterviews();
  const opportunities = useCareerOpportunities();
  const consent = useConsentVoice();
  const start = useStartVoice();
  const record = useRecordVoice();
  const correct = useCorrectVoiceTranscript();
  const removeAudio = useDeleteVoiceAudio();

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [opportunityId, setOpportunityId] = useState<string | null>(typeof params.opportunityId === 'string' ? params.opportunityId : null);
  const [take, setTake] = useState<Take | null>(null);
  const [transcript, setTranscript] = useState('');
  const [corrections, setCorrections] = useState<Record<string, string>>({});
  const [offer, setOffer] = useState('');
  const [salarySource, setSalarySource] = useState('');
  const [offerErrors, setOfferErrors] = useState<{ offer?: string; salarySource?: string }>({});
  const [notice, setNotice] = useState<Notice | null>(null);
  const [now, setNow] = useState(() => Date.now());
  // The key of a take that failed to save; reused only for the same words.
  const pendingTake = useRef<{ sessionId: string; transcript: string; durationSeconds: number; key: string } | null>(null);

  const running = take !== null && take.stoppedAt === null;
  useEffect(() => {
    if (!running) return undefined;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [running]);

  const items = list.data?.items ?? [];
  const session: VoiceSession | null = items.find((s) => s.id === selectedId) ?? items[0] ?? null;
  const correction = session?.recording ? (corrections[session.id] ?? session.recording.transcript) : '';
  const correctionDirty = Boolean(session?.recording && corrections[session.id] !== undefined && corrections[session.id] !== session.recording.transcript);
  useLeaveGuard((take !== null && transcript.trim().length > 0) || correctionDirty);

  const busy = consent.isPending || start.isPending || record.isPending || correct.isPending || removeAudio.isPending;
  const gate = list.data ? voiceGate(list.data) : 'needs_consent';
  const canStart = gate === 'ready' && take === null && !busy;

  const agree = () => {
    if (list.data?.consent || busy) return;
    Alert.alert(
      t('voice.agreeTitle'),
      [t('voice.consent'), t('voice.agreeSaved', { version: VOICE_CONSENT_VERSION })].join(' '),
      [
        { text: t('voice.notNow'), style: 'cancel' },
        {
          text: t('voice.iAgree'),
          onPress: () => {
            setNotice(null);
            consent.mutate(undefined, { onError: (error) => setNotice({ tone: 'warning', text: voiceErrorMessage(error, 'consent') }) });
          },
        },
      ],
    );
  };

  const begin = (kind: 'practice' | 'negotiation') => {
    if (!canStart) return;
    setNotice(null);
    if (kind === 'negotiation') {
      const errors = negotiationErrors(offer, salarySource);
      setOfferErrors(errors);
      if (errors.offer || errors.salarySource) return;
    } else if (!opportunityId) {
      return;
    }
    const input =
      kind === 'practice'
        ? { kind, opportunityId: opportunityId as string, stage: 'behavioral' as const }
        : { kind, offer: offer.trim(), salarySource: salarySource.trim() };
    start.mutate(input, {
      onSuccess: (opened) => {
        setSelectedId(opened.id);
        setTranscript('');
        pendingTake.current = null;
        const at = Date.now();
        setNow(at);
        setTake({ sessionId: opened.id, startedAt: at, stoppedAt: null });
      },
      onError: (error) => setNotice({ tone: 'warning', text: voiceErrorMessage(error, 'start') }),
    });
  };

  const finish = () => {
    if (!take || busy) return;
    const words = transcript.trim();
    if (words.length === 0) {
      setNotice({ tone: 'warning', text: t('voice.typeWordsFirst') });
      return;
    }
    const stoppedAt = take.stoppedAt ?? Date.now();
    if (take.stoppedAt === null) setTake({ ...take, stoppedAt });
    const durationSeconds = takeSeconds(take.startedAt, stoppedAt);
    const prior = pendingTake.current;
    const key =
      prior && prior.sessionId === take.sessionId && prior.transcript === words && prior.durationSeconds === durationSeconds
        ? prior.key
        : Crypto.randomUUID();
    pendingTake.current = { sessionId: take.sessionId, transcript: words, durationSeconds, key };
    setNotice(null);
    record.mutate(
      { sessionId: take.sessionId, durationSeconds, transcript: words, idempotencyKey: key },
      {
        onSuccess: (result) => {
          pendingTake.current = null;
          setTake(null);
          setTranscript('');
          setCorrections((prev) => {
            const next = { ...prev };
            delete next[result.session.id];
            return next;
          });
          setNotice(
            result.truncated
              ? { tone: 'warning', text: t('voice.truncated') }
              : { tone: 'info', text: t('voice.takeSaved', { seconds: result.billedSeconds }) },
          );
        },
        onError: (error) => setNotice({ tone: 'warning', text: voiceErrorMessage(error, 'record') }),
      },
    );
  };

  const discardTake = () => {
    Alert.alert(t('voice.discardTitle'), t('voice.discardBody'), [
      { text: t('voice.keepPracticing'), style: 'cancel' },
      {
        text: t('voice.discard'),
        style: 'destructive',
        onPress: () => {
          pendingTake.current = null;
          setTake(null);
          setTranscript('');
        },
      },
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
          setNotice({ tone: 'info', text: t('voice.correctionSaved') });
        },
        onError: (error) => setNotice({ tone: 'warning', text: voiceErrorMessage(error, 'correct') }),
      },
    );
  };

  const confirmRemoveAudio = () => {
    if (!session?.recording || session.recording.audioDeleted || busy) return;
    const target = session.id;
    Alert.alert(t('voice.removeTitle'), t('voice.removeBody'), [
      { text: t('voice.keepIt'), style: 'cancel' },
      {
        text: t('voice.remove'),
        style: 'destructive',
        onPress: () => {
          setNotice(null);
          removeAudio.mutate(target, {
            onSuccess: () => setNotice({ tone: 'info', text: t('voice.audioDeleted') }),
            onError: (error) => setNotice({ tone: 'warning', text: voiceErrorMessage(error, 'delete') }),
          });
        },
      },
    ]);
  };

  const switchedOff = access.data?.features?.voiceMinutes === false || isApiError(list.error, 'feature_unavailable');

  let content: React.ReactNode;
  if (access.data && !access.data.enabled) {
    content = <EmptyState icon="lock-closed-outline" title={t('list.locked')} />;
  } else if (switchedOff) {
    content = (
      <EmptyState
        icon="mic-off-outline"
        title={t('voice.offTitle')}
        description={t('voice.offBody')}
      />
    );
  } else if (access.isLoading || list.isLoading) {
    content = (
      <View className="p-5">
        <SkeletonCard />
        <SkeletonCard />
      </View>
    );
  } else if (access.error || list.error || !list.data) {
    content = <ErrorState message={voiceErrorMessage(list.error ?? access.error, 'load')} onRetry={() => void list.refetch()} />;
  } else {
    const data = list.data;
    const openings = opportunities.data?.items ?? [];
    const summary = savedSummary(session);
    content = (
      <ScrollView
        contentContainerStyle={{ padding: 20, paddingBottom: 48 }}
        keyboardShouldPersistTaps="handled"
        refreshControl={
          <RefreshControl refreshing={list.isRefetching} onRefresh={() => (take ? undefined : void list.refetch())} tintColor={colors.brand[600]} />
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

        <View className="bg-stone-100 rounded-2xl p-4 mt-2 flex-row">
          <Ionicons name="mic-off-outline" size={20} color={colors.stone[700]} />
          <Text className="text-stone-700 text-sm ms-2 flex-1 leading-5">{t('voice.noMicrophone')}</Text>
        </View>

        {!data.planIncludesVoice ? (
          <View className="bg-warning-bg rounded-2xl p-4 mt-4">
            <Text className="text-warning font-semibold">{t('voice.planTitle')}</Text>
            <Text className="text-warning text-sm mt-1">{t('voice.planBody')}</Text>
          </View>
        ) : null}

        {notice ? (
          <View className={`${notice.tone === 'warning' ? 'bg-warning-bg' : 'bg-success-bg'} rounded-xl p-3 mt-4`} accessibilityLiveRegion="polite">
            <Text className={`${notice.tone === 'warning' ? 'text-warning' : 'text-success'} text-sm leading-5`}>{notice.text}</Text>
          </View>
        ) : null}

        <View className="bg-white border border-stone-100 rounded-2xl p-4 mt-4">
          <Pressable
            onPress={agree}
            disabled={data.consent || consent.isPending}
            accessibilityRole="checkbox"
            accessibilityState={{ checked: data.consent, disabled: data.consent || consent.isPending }}
            accessibilityLabel={t('voice.consent')}
            className="min-h-[44px] flex-row items-center"
          >
            <Ionicons name={data.consent ? 'checkbox' : 'square-outline'} size={22} color={data.consent ? colors.brand[600] : colors.stone[500]} />
            <Text className="text-stone-900 text-sm ms-2 flex-1">{t('voice.consent')}</Text>
          </Pressable>
          <Text className="text-stone-500 text-xs mt-1 leading-4">
            {data.consent
              ? t('voice.agreed', { version: consent.data?.version ?? VOICE_CONSENT_VERSION })
              : [t('voice.consentHelp'), t('voice.agreementVersion', { version: VOICE_CONSENT_VERSION })].join(' ')}
          </Text>

          <Text className="text-sm font-medium text-stone-700 mt-4 mb-2">{t('voice.practiceFor')}</Text>
          {opportunities.isLoading ? (
            <SkeletonCard />
          ) : openings.length === 0 ? (
            <Text className="text-stone-500 text-sm leading-5">{t('voice.pickListing')}</Text>
          ) : (
            <View accessibilityRole="radiogroup">
              {openings.map((item) => {
                const on = item.id === opportunityId;
                return (
                  <Pressable
                    key={item.id}
                    onPress={() => setOpportunityId(item.id)}
                    disabled={take !== null}
                    accessibilityRole="radio"
                    accessibilityState={{ selected: on, checked: on, disabled: take !== null }}
                    accessibilityLabel={item.organization ? `${item.title}, ${item.organization}` : item.title}
                    className={`min-h-[44px] flex-row items-center rounded-xl border px-3 py-2.5 mb-2 ${on ? 'border-brand-400 bg-brand-50' : 'border-stone-200 bg-white'}`}
                  >
                    <Ionicons name={on ? 'radio-button-on' : 'radio-button-off'} size={20} color={on ? colors.brand[600] : colors.stone[400]} />
                    <Text className="text-stone-900 text-sm font-semibold ms-2 flex-1">{item.title}</Text>
                  </Pressable>
                );
              })}
            </View>
          )}
          <Button
            className="mt-3"
            fullWidth
            onPress={() => begin('practice')}
            loading={start.isPending && start.variables?.kind === 'practice'}
            disabled={!canStart || !opportunityId}
          >
            {t('voice.start')}
          </Button>

          {take ? (
            <View className="mt-4">
              <View className="flex-row items-center justify-between mb-2">
                <Text className="text-sm font-semibold text-stone-700">{t('voice.transcript')}</Text>
                <Text className="text-stone-900 font-bold" accessibilityLabel={t('voice.elapsed', { time: clock(((take.stoppedAt ?? now) - take.startedAt) / 1000) })}>
                  {clock(((take.stoppedAt ?? now) - take.startedAt) / 1000)}
                </Text>
              </View>
              <TextInput
                value={transcript}
                onChangeText={setTranscript}
                multiline
                maxLength={TRANSCRIPT_MAX}
                textAlignVertical="top"
                accessibilityLabel={t('voice.transcript')}
                placeholder={t('voice.transcriptPlaceholder')}
                placeholderTextColor={colors.stone[400]}
                className="bg-white border border-stone-200 rounded-xl px-3 py-2.5 text-base text-stone-900 min-h-[120px]"
              />
              <Text className="text-stone-500 text-xs mt-1 leading-4">
                {t('voice.transcriptHelp')}
              </Text>
              <View className="flex-row gap-3 mt-3">
                <View className="flex-1">
                  <Button variant="outline" fullWidth onPress={discardTake} disabled={record.isPending}>
                    {t('voice.discard')}
                  </Button>
                </View>
                <View className="flex-1">
                  <Button fullWidth onPress={finish} loading={record.isPending}>
                    {t('voice.stop')}
                  </Button>
                </View>
              </View>
            </View>
          ) : null}
        </View>

        {session ? (
          <View className="bg-white border border-stone-100 rounded-2xl p-4 mt-4">
            <View className="flex-row items-start justify-between">
              <Text className="font-bold text-stone-900 flex-1 me-2">{session.title}</Text>
              <Pill label={KIND_LABEL[session.kind].toUpperCase()} tone="brand" />
            </View>
            <Text className="text-stone-800 text-sm mt-2 leading-5">{session.prompt}</Text>
            {session.guidance && session.guidance !== session.prompt ? (
              <Text className="text-stone-700 text-sm mt-2 leading-5">{session.guidance}</Text>
            ) : null}
            {summary ? <Text className="text-stone-800 text-sm mt-3 leading-5">{t('voice.summary', { summary })}</Text> : null}
            {session.recording ? (
              <View className="mt-4">
                <Text className="text-sm font-semibold text-stone-700 mb-1.5">{t('voice.savedTranscript')}</Text>
                <TextInput
                  value={correction}
                  onChangeText={(text) => setCorrections((prev) => ({ ...prev, [session.id]: text }))}
                  multiline
                  maxLength={TRANSCRIPT_MAX}
                  textAlignVertical="top"
                  accessibilityLabel={t('voice.savedTranscript')}
                  placeholderTextColor={colors.stone[400]}
                  className={`bg-white border rounded-xl px-3 py-2.5 text-base text-stone-900 min-h-[100px] ${correctionDirty ? 'border-brand-400' : 'border-stone-200'}`}
                />
                <Text className="text-stone-500 text-xs mt-1 leading-4">
                  {t('voice.savedTranscriptHelp')}
                </Text>
                <Button className="mt-3" fullWidth variant="outline" onPress={saveCorrection} loading={correct.isPending} disabled={!correctionDirty || busy}>
                  {t('voice.saveCorrection')}
                </Button>
                {session.recording.audioDeleted ? (
                  <Text className="text-stone-500 text-xs mt-3">{t('voice.audioDeleted')}</Text>
                ) : (
                  <Button className="mt-2" fullWidth variant="ghost" onPress={confirmRemoveAudio} loading={removeAudio.isPending} disabled={busy}>
                    {t('voice.removeRecording')}
                  </Button>
                )}
              </View>
            ) : take?.sessionId !== session.id ? (
              <Text className="text-stone-400 text-xs mt-3">{t('voice.noTake')}</Text>
            ) : null}
          </View>
        ) : null}

        <View className="bg-white border border-stone-100 rounded-2xl p-4 mt-4">
          <Text className="font-bold text-stone-900 text-base mb-3" accessibilityRole="header">
            {t('voice.negotiation')}
          </Text>
          <Input
            label={t('voice.offer')}
            value={offer}
            onChangeText={(text) => {
              setOffer(text);
              if (offerErrors.offer) setOfferErrors((prev) => ({ ...prev, offer: undefined }));
            }}
            maxLength={OFFER_MAX}
            error={offerErrors.offer}
            editable={take === null}
          />
          <Input
            label={t('voice.salarySource')}
            value={salarySource}
            onChangeText={setSalarySource}
            maxLength={OFFER_MAX}
            error={offerErrors.salarySource}
            hint={t('voice.salaryHint')}
            editable={take === null}
          />
          <Button fullWidth onPress={() => begin('negotiation')} loading={start.isPending && start.variables?.kind === 'negotiation'} disabled={!canStart}>
            {t('voice.startNegotiation')}
          </Button>
        </View>

        {items.length > 0 ? (
          <>
            <Text className="text-sm font-semibold text-stone-500 uppercase tracking-wide mt-6 mb-2" accessibilityRole="header">
              {t('voice.yourSessions')}
            </Text>
            {items.map((item) => {
              const on = item.id === session?.id;
              return (
                <Pressable
                  key={item.id}
                  onPress={() => setSelectedId(item.id)}
                  disabled={take !== null}
                  accessibilityRole="button"
                  accessibilityState={{ selected: on, disabled: take !== null }}
                  accessibilityLabel={
                    item.recording
                      ? t('voice.sessionA11ySaved', { kind: KIND_LABEL[item.kind], title: item.title })
                      : `${KIND_LABEL[item.kind]}: ${item.title}`
                  }
                  className={`min-h-[44px] rounded-2xl border p-3 mb-2 ${on ? 'border-brand-400 bg-brand-50' : 'border-stone-100 bg-white'}`}
                >
                  <Text className="text-stone-900 text-sm font-semibold">{`${KIND_LABEL[item.kind]} · ${item.title}`}</Text>
                  <Text className="text-stone-400 text-xs mt-0.5">
                    {`${formatDay(item.createdAt) ?? ''} · ${item.recording ? t('voice.secondsSaved', { seconds: item.recording.durationSeconds }) : t('voice.noTakeSaved')}`}
                  </Text>
                </Pressable>
              );
            })}
          </>
        ) : null}
      </ScrollView>
    );
  }

  return (
    <SafeAreaView className="flex-1 bg-stone-50" edges={['top', 'bottom']}>
      <CareerHeader title={t('voice.title')} subtitle={running ? t('voice.timerRunning') : undefined} />
      <KeyboardAvoidingView className="flex-1" behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        {content}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
