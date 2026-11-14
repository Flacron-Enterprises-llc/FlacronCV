import { Ionicons } from '@expo/vector-icons';
import { useRouter, type Href } from 'expo-router';
import React, { useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, Pressable, RefreshControl, ScrollView, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { isApiError } from '../../../../../../packages/career-api-client/src/client';
import type { VoiceSession } from '../../../../../../packages/career-api-client/src/types';
import { CareerHeader, Pill } from '../../../../src/components/career/CareerHeader';
import { Button } from '../../../../src/components/ui/Button';
import { EmptyState } from '../../../../src/components/ui/EmptyState';
import { ErrorState } from '../../../../src/components/ui/ErrorState';
import { SkeletonCard } from '../../../../src/components/ui/Skeleton';
import { useCorrectVoiceTranscript, useDeleteVoiceAudio, useVoiceInterviews } from '../../../../src/hooks/career/voice';
import { useCareerAccess } from '../../../../src/hooks/useCareer';
import { useLeaveGuard } from '../../../../src/hooks/useLeaveGuard';
import { formatDay } from '../../../../src/lib/career-view';
import { feedbackLines } from '../../../../src/lib/career/interviews';
import { KIND_LABEL, TRANSCRIPT_MAX, remainingLine, savedSummary, transcriptHelpKey, voiceErrorMessage } from '../../../../src/lib/career/voice';
import { colors } from '../../../../src/theme/colors';
import { useT } from '../../../../src/i18n';

type Notice = { tone: 'info' | 'warning'; text: string };

/**
 * Voice practice sessions. A take is a real audio upload that the server
 * measures and bills, and this app has no audio recording module yet, so new
 * takes are recorded on the website. Here the person sees their voice time,
 * reviews sessions recorded there, types or corrects a take's transcript (free:
 * it only recomputes the word feedback) and removes a stored recording while
 * keeping its summary.
 */
export default function VoicePracticeScreen() {
  const t = useT('careerInterviews');
  const router = useRouter();
  const access = useCareerAccess();
  const list = useVoiceInterviews();
  const correct = useCorrectVoiceTranscript();
  const removeAudio = useDeleteVoiceAudio();

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [corrections, setCorrections] = useState<Record<string, string>>({});
  const [notice, setNotice] = useState<Notice | null>(null);

  const items = list.data?.items ?? [];
  const session: VoiceSession | null = items.find((s) => s.id === selectedId) ?? items[0] ?? null;
  const recording = session?.recording ?? null;
  const correction = session && recording ? (corrections[session.id] ?? recording.transcript) : '';
  const correctionDirty = Boolean(
    session && recording && corrections[session.id] !== undefined && corrections[session.id] !== recording.transcript,
  );
  useLeaveGuard(correctionDirty);

  const busy = correct.isPending || removeAudio.isPending;

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

  const selectSession = (id: string) => {
    if (id === session?.id) return;
    if (!correctionDirty) {
      setSelectedId(id);
      return;
    }
    Alert.alert(t('session.discardTitle'), t('session.discardBody'), [
      { text: t('session.keepWriting'), style: 'cancel' },
      {
        text: t('session.discard'),
        style: 'destructive',
        onPress: () => {
          setCorrections({});
          setSelectedId(id);
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
  } else if (access.error || list.error || !list.data) {
    content = <ErrorState message={voiceErrorMessage(list.error ?? access.error, 'load')} onRetry={() => void list.refetch()} />;
  } else {
    const data = list.data;
    const summary = savedSummary(session);
    content = (
      <ScrollView
        contentContainerStyle={{ padding: 20, paddingBottom: 48 }}
        keyboardShouldPersistTaps="handled"
        refreshControl={<RefreshControl refreshing={list.isRefetching} onRefresh={() => void list.refetch()} tintColor={colors.brand[600]} />}
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

        <View className="bg-stone-100 rounded-2xl p-4 mt-2 flex-row" accessibilityRole="summary">
          <Ionicons name="desktop-outline" size={20} color={colors.stone[700]} />
          <View className="ms-2 flex-1">
            <Text className="text-stone-900 text-sm font-semibold">{t('voice.webOnlyTitle')}</Text>
            <Text className="text-stone-700 text-sm mt-1 leading-5">{t('voice.webOnlyBody')}</Text>
          </View>
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
            {recording?.feedback ? (
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
            ) : null}
            {recording ? (
              <View className="mt-4">
                <Text className="text-sm font-semibold text-stone-700 mb-1.5">
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
                  {t('voice.saveCorrection')}
                </Button>
                {recording.audioDeleted ? (
                  <Text className="text-stone-500 text-xs mt-3">{t('voice.audioDeleted')}</Text>
                ) : recording.audioStored ? (
                  <Button className="mt-2" fullWidth variant="ghost" onPress={confirmRemoveAudio} loading={removeAudio.isPending} disabled={busy}>
                    {t('voice.removeRecording')}
                  </Button>
                ) : null}
              </View>
            ) : (
              <Text className="text-stone-400 text-xs mt-3">{t('voice.noTake')}</Text>
            )}
          </View>
        ) : (
          <View className="bg-white border border-stone-100 rounded-2xl p-4 mt-4">
            <Text className="font-semibold text-stone-800">{t('voice.emptyTitle')}</Text>
            <Text className="text-stone-500 text-sm mt-1 leading-5">{t('voice.emptyBody')}</Text>
          </View>
        )}

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
                  onPress={() => selectSession(item.id)}
                  disabled={busy}
                  accessibilityRole="button"
                  accessibilityState={{ selected: on, disabled: busy }}
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
      <CareerHeader title={t('voice.title')} />
      <KeyboardAvoidingView className="flex-1" behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        {content}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
