import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter, type Href } from 'expo-router';
import React, { useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, ScrollView, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { InterviewSession } from '../../../../../../packages/career-api-client/src/types';
import { CareerHeader, Pill } from '../../../../src/components/career/CareerHeader';
import { Button } from '../../../../src/components/ui/Button';
import { ErrorState } from '../../../../src/components/ui/ErrorState';
import { Modal } from '../../../../src/components/ui/Modal';
import { SkeletonCard } from '../../../../src/components/ui/Skeleton';
import { useAnswerInterview, useChallengeInterview, useInterview } from '../../../../src/hooks/career/interviews';
import { useLeaveGuard } from '../../../../src/hooks/useLeaveGuard';
import {
  ANSWER_MAX,
  CHALLENGE_MAX,
  STAGE_LABEL,
  feedbackLines,
  interviewErrorMessage,
  nextQuestion,
  notAScore,
  pairedAnswers,
  reportLines,
  sessionProgress,
  sessionReport,
} from '../../../../src/lib/career/interviews';
import { colors } from '../../../../src/theme/colors';
import { useT } from '../../../../src/i18n';

type Answer = InterviewSession['answers'][number];

/**
 * One text interview session: the questions, the answers saved so far with
 * their feedback, the next question to answer, and a note to challenge the
 * feedback on an answer. Answering and challenging use no text interview.
 * A failed save keeps the typed words in place.
 */
export default function InterviewSessionScreen() {
  const t = useT('careerInterviews');
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const session = useInterview(id);
  const answer = useAnswerInterview(id);
  const challenge = useChallengeInterview(id);
  const [draft, setDraft] = useState('');
  const [answerError, setAnswerError] = useState<string | null>(null);
  const [challenging, setChallenging] = useState<Answer | null>(null);
  const [note, setNote] = useState('');
  const [noteError, setNoteError] = useState<string | null>(null);

  useLeaveGuard(draft.trim().length > 0 || (challenging !== null && note.trim().length > 0));

  const saveAnswer = () => {
    const typed = draft.trim();
    if (typed.length === 0) {
      setAnswerError(t('session.typeAnswerFirst'));
      return;
    }
    setAnswerError(null);
    answer.mutate(typed, {
      onSuccess: () => setDraft(''),
      onError: (error) => setAnswerError(interviewErrorMessage(error, 'answer')),
    });
  };

  const openChallenge = (item: Answer) => {
    setChallenging(item);
    setNote(item.challenge ?? '');
    setNoteError(null);
  };

  const closeChallenge = () => {
    if (challenge.isPending) return;
    if (note.trim().length > 0 && note.trim() !== (challenging?.challenge ?? '')) {
      Alert.alert(t('session.discardTitle'), t('session.discardBody'), [
        { text: t('session.keepWriting'), style: 'cancel' },
        { text: t('session.discard'), style: 'destructive', onPress: () => setChallenging(null) },
      ]);
      return;
    }
    setChallenging(null);
  };

  const saveChallenge = () => {
    if (!challenging) return;
    const typed = note.trim();
    if (typed.length === 0) {
      setNoteError(t('session.writeDisagreeFirst'));
      return;
    }
    setNoteError(null);
    challenge.mutate(
      { answerId: challenging.id, note: typed },
      {
        onSuccess: () => {
          setChallenging(null);
          setNote('');
        },
        onError: (error) => setNoteError(interviewErrorMessage(error, 'challenge')),
      },
    );
  };

  let content: React.ReactNode;
  if (session.isLoading) {
    content = (
      <View className="p-5">
        <SkeletonCard />
        <SkeletonCard />
      </View>
    );
  } else if (session.error || !session.data) {
    content = <ErrorState message={interviewErrorMessage(session.error, 'load')} onRetry={() => void session.refetch()} />;
  } else {
    const data = session.data;
    const next = nextQuestion(data);
    const progress = sessionProgress(data);
    content = (
      <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 48 }} keyboardShouldPersistTaps="handled">
        <View className="flex-row items-center gap-2 mb-2">
          <Pill label={STAGE_LABEL[data.stage].toUpperCase()} tone="brand" />
          <Text className="text-stone-500 text-xs">{t('status.progress', { answered: progress.answered, total: progress.total })}</Text>
        </View>
        <Text className="text-stone-800 text-sm leading-5">{data.summary}</Text>
        <Text className="text-stone-500 text-xs mt-1 leading-4">{notAScore()}</Text>

        {next ? (
          <View className="bg-white border border-brand-200 rounded-2xl p-4 mt-5">
            <Text className="text-xs font-semibold text-brand-700 uppercase tracking-wide">{t('session.questionOf', { number: next.index, total: progress.total })}</Text>
            <Text className="text-stone-900 text-base mt-2 leading-6" accessibilityRole="header">
              {next.prompt}
            </Text>
            <Text className="text-sm font-medium text-stone-700 mt-4 mb-1.5">{t('session.answerLabel')}</Text>
            <TextInput
              value={draft}
              onChangeText={setDraft}
              multiline
              maxLength={ANSWER_MAX}
              textAlignVertical="top"
              accessibilityLabel={t('session.answerLabel')}
              placeholder={t('session.answerPlaceholder')}
              placeholderTextColor={colors.stone[400]}
              className="bg-white border border-stone-200 rounded-xl px-3 py-2.5 text-base text-stone-900 min-h-[120px]"
            />
            {answerError ? (
              <Text className="text-warning text-sm mt-2 leading-5" accessibilityLiveRegion="polite">
                {answerError}
              </Text>
            ) : null}
            <Button className="mt-3" fullWidth onPress={saveAnswer} loading={answer.isPending}>
              {t('session.saveAnswer')}
            </Button>
          </View>
        ) : (
          <SessionReportCard session={data} />
        )}

        <Text className="text-sm font-semibold text-stone-500 uppercase tracking-wide mt-6 mb-2" accessibilityRole="header">
          {t('session.questions')}
        </Text>
        {pairedAnswers(data).map(({ question, answer: given }) => (
          <View key={question.index} className="bg-white border border-stone-100 rounded-2xl p-4 mb-3">
            <Text className="text-xs text-stone-400">{t('session.questionN', { number: question.index })}</Text>
            <Text className="text-stone-900 font-semibold mt-1 leading-5">{question.prompt}</Text>
            {given ? (
              <>
                <Text className="text-stone-700 text-sm mt-2 leading-5">{given.answer}</Text>
                <FeedbackBadges feedback={given.feedback} />
                {given.challenge ? (
                  <View className="bg-stone-50 rounded-xl p-3 mt-3">
                    <Text className="text-xs font-semibold text-stone-500">{t('session.noteLabel')}</Text>
                    <Text className="text-stone-700 text-sm mt-1 leading-5">{given.challenge}</Text>
                  </View>
                ) : null}
                <View className="flex-row flex-wrap gap-2 mt-2">
                  <Button variant="ghost" size="sm" className="min-h-[44px]" onPress={() => openChallenge(given)}>
                    {given.challenge ? t('session.editNote') : t('session.challenge')}
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="min-h-[44px]"
                    onPress={() =>
                      router.push(
                        `/(dashboard)/career/interviews/stories?fromSession=${encodeURIComponent(data.id)}&answerId=${encodeURIComponent(given.id)}` as Href,
                      )
                    }
                  >
                    {t('session.saveAsStory')}
                  </Button>
                </View>
              </>
            ) : (
              <Text className="text-stone-400 text-xs mt-2">{t('session.notAnswered')}</Text>
            )}
          </View>
        ))}
      </ScrollView>
    );
  }

  return (
    <SafeAreaView className="flex-1 bg-stone-50" edges={['top', 'bottom']}>
      <CareerHeader title={session.data?.title ?? t('session.title')} subtitle={t('session.subtitle')} />
      <KeyboardAvoidingView className="flex-1" behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        {content}
      </KeyboardAvoidingView>
      <Modal visible={challenging !== null} onClose={closeChallenge} title={t('session.challenge')} closeDisabled={challenge.isPending}>
        <Text className="text-stone-500 text-sm leading-5 mb-3">
          {t('session.challengeBody')}
        </Text>
        <TextInput
          value={note}
          onChangeText={setNote}
          multiline
          maxLength={CHALLENGE_MAX}
          textAlignVertical="top"
          accessibilityLabel={t('session.noteLabel')}
          placeholder={t('session.notePlaceholder')}
          placeholderTextColor={colors.stone[400]}
          className="bg-white border border-stone-200 rounded-xl px-3 py-2.5 text-base text-stone-900 min-h-[100px]"
        />
        {noteError ? <Text className="text-warning text-sm mt-2 leading-5">{noteError}</Text> : null}
        <Button className="mt-4" fullWidth onPress={saveChallenge} loading={challenge.isPending}>
          {t('session.saveNote')}
        </Button>
      </Modal>
    </SafeAreaView>
  );
}

/** One badge per rubric dimension: the label in plain words, green when met. Never a score. */
function FeedbackBadges({ feedback }: { feedback: Answer['feedback'] }) {
  return (
    <View className="mt-3 gap-1.5">
      {feedbackLines(feedback).map((line) => (
        <View key={line.label} className="flex-row flex-wrap items-center" accessible accessibilityLabel={`${line.label}: ${line.text}`}>
          <Text className="text-stone-700 text-xs font-semibold me-2">{line.label}</Text>
          <View className={`flex-row items-center rounded-full px-2 py-0.5 ${line.good ? 'bg-success-bg' : 'bg-stone-100'}`}>
            <Ionicons
              name={line.good ? 'checkmark-circle' : 'ellipse-outline'}
              size={12}
              color={line.good ? colors.success.DEFAULT : colors.stone[500]}
            />
            <Text className={`text-xs ms-1 ${line.good ? 'text-success' : 'text-stone-600'}`}>{line.text}</Text>
          </View>
        </View>
      ))}
    </View>
  );
}

/** End-of-session report: strengths and gaps per dimension, and answers that did not cite confirmed evidence. */
function SessionReportCard({ session }: { session: InterviewSession }) {
  const t = useT('careerInterviews');
  const report = sessionReport(session);
  const lines = reportLines(report);
  const list = (items: string[]) =>
    (items.length > 0 ? items : [t('session.reportNone')]).map((item) => (
      <Text key={item} className="text-stone-700 text-sm leading-5 mt-0.5">{`• ${item}`}</Text>
    ));
  return (
    <View className="bg-white border border-success-bg rounded-2xl p-4 mt-5">
      <Text className="font-bold text-stone-900" accessibilityRole="header">
        {t('session.reportTitle')}
      </Text>
      <Text className="text-success text-sm font-semibold mt-1">{t('session.completeCount', { total: report.total })}</Text>
      <Text className="text-stone-900 text-sm font-semibold mt-3">{t('session.reportStrengths')}</Text>
      {list(lines.strengths)}
      <Text className="text-stone-900 text-sm font-semibold mt-3">{t('session.reportGaps')}</Text>
      {list(lines.gaps)}
      <Text className="text-stone-700 text-sm mt-3 leading-5">{lines.evidence}</Text>
      <Text className="text-stone-500 text-xs mt-2 leading-4">{notAScore()}</Text>
    </View>
  );
}
