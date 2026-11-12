import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams } from 'expo-router';
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
  NOT_A_SCORE,
  STAGE_LABEL,
  feedbackLines,
  interviewErrorMessage,
  nextQuestion,
  pairedAnswers,
  sessionProgress,
} from '../../../../src/lib/career/interviews';
import { colors } from '../../../../src/theme/colors';

type Answer = InterviewSession['answers'][number];

/**
 * One text interview session: the questions, the answers saved so far with
 * their feedback, the next question to answer, and a note to challenge the
 * feedback on an answer. Answering and challenging use no text interview.
 * A failed save keeps the typed words in place.
 */
export default function InterviewSessionScreen() {
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
      setAnswerError('Type your answer first.');
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
      Alert.alert('Discard your note?', 'It is not saved yet.', [
        { text: 'Keep writing', style: 'cancel' },
        { text: 'Discard', style: 'destructive', onPress: () => setChallenging(null) },
      ]);
      return;
    }
    setChallenging(null);
  };

  const saveChallenge = () => {
    if (!challenging) return;
    const typed = note.trim();
    if (typed.length === 0) {
      setNoteError('Write what you disagree with first.');
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
          <Text className="text-stone-500 text-xs">{`${progress.answered} of ${progress.total} answered`}</Text>
        </View>
        <Text className="text-stone-800 text-sm leading-5">{data.summary}</Text>
        <Text className="text-stone-500 text-xs mt-1 leading-4">{NOT_A_SCORE}</Text>

        {next ? (
          <View className="bg-white border border-brand-200 rounded-2xl p-4 mt-5">
            <Text className="text-xs font-semibold text-brand-700 uppercase tracking-wide">{`Question ${progress.answered + 1} of ${progress.total}`}</Text>
            <Text className="text-stone-900 text-base mt-2 leading-6" accessibilityRole="header">
              {next.prompt}
            </Text>
            <Text className="text-sm font-medium text-stone-700 mt-4 mb-1.5">Your answer</Text>
            <TextInput
              value={draft}
              onChangeText={setDraft}
              multiline
              maxLength={ANSWER_MAX}
              textAlignVertical="top"
              accessibilityLabel="Your answer"
              placeholder="Type your answer"
              placeholderTextColor={colors.stone[400]}
              className="bg-white border border-stone-200 rounded-xl px-3 py-2.5 text-base text-stone-900 min-h-[120px]"
            />
            {answerError ? (
              <Text className="text-warning text-sm mt-2 leading-5" accessibilityLiveRegion="polite">
                {answerError}
              </Text>
            ) : null}
            <Button className="mt-3" fullWidth onPress={saveAnswer} loading={answer.isPending}>
              Save answer
            </Button>
          </View>
        ) : (
          <View className="bg-success-bg rounded-2xl p-4 mt-5">
            <Text className="text-success text-sm font-semibold">This session has its ten answers.</Text>
          </View>
        )}

        <Text className="text-sm font-semibold text-stone-500 uppercase tracking-wide mt-6 mb-2" accessibilityRole="header">
          Questions
        </Text>
        {pairedAnswers(data).map(({ question, answer: given }) => (
          <View key={question.index} className="bg-white border border-stone-100 rounded-2xl p-4 mb-3">
            <Text className="text-xs text-stone-400">{`Question ${question.index + 1}`}</Text>
            <Text className="text-stone-900 font-semibold mt-1 leading-5">{question.prompt}</Text>
            {given ? (
              <>
                <Text className="text-stone-700 text-sm mt-2 leading-5">{given.answer}</Text>
                <View className="mt-3 gap-1">
                  {feedbackLines(given.feedback).map((line) => (
                    <View key={line.label} className="flex-row items-start">
                      <Ionicons
                        name={line.good ? 'checkmark-circle-outline' : 'ellipse-outline'}
                        size={16}
                        color={line.good ? colors.success.DEFAULT : colors.stone[400]}
                        style={{ marginTop: 2 }}
                      />
                      <Text className="text-stone-600 text-xs ml-1.5 flex-1 leading-5">{`${line.label}: ${line.text}`}</Text>
                    </View>
                  ))}
                </View>
                {given.challenge ? (
                  <View className="bg-stone-50 rounded-xl p-3 mt-3">
                    <Text className="text-xs font-semibold text-stone-500">Your note on this feedback</Text>
                    <Text className="text-stone-700 text-sm mt-1 leading-5">{given.challenge}</Text>
                  </View>
                ) : null}
                <Button variant="ghost" size="sm" className="mt-2 self-start min-h-[44px]" onPress={() => openChallenge(given)}>
                  {given.challenge ? 'Edit your note' : 'Challenge this feedback'}
                </Button>
              </>
            ) : (
              <Text className="text-stone-400 text-xs mt-2">Not answered yet.</Text>
            )}
          </View>
        ))}
      </ScrollView>
    );
  }

  return (
    <SafeAreaView className="flex-1 bg-stone-50" edges={['top', 'bottom']}>
      <CareerHeader title={session.data?.title ?? 'Interview session'} subtitle="Interview practice" />
      <KeyboardAvoidingView className="flex-1" behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        {content}
      </KeyboardAvoidingView>
      <Modal visible={challenging !== null} onClose={closeChallenge} title="Challenge this feedback" closeDisabled={challenge.isPending}>
        <Text className="text-stone-500 text-sm leading-5 mb-3">
          Say what the feedback missed. Your note is saved with this answer. It does not change the feedback and uses no text interview.
        </Text>
        <TextInput
          value={note}
          onChangeText={setNote}
          multiline
          maxLength={CHALLENGE_MAX}
          textAlignVertical="top"
          accessibilityLabel="Your note on this feedback"
          placeholder="For example: my answer did cite the project"
          placeholderTextColor={colors.stone[400]}
          className="bg-white border border-stone-200 rounded-xl px-3 py-2.5 text-base text-stone-900 min-h-[100px]"
        />
        {noteError ? <Text className="text-warning text-sm mt-2 leading-5">{noteError}</Text> : null}
        <Button className="mt-4" fullWidth onPress={saveChallenge} loading={challenge.isPending}>
          Save note
        </Button>
      </Modal>
    </SafeAreaView>
  );
}
