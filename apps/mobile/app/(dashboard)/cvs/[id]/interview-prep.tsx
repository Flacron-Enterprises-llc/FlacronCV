import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';
import React, { useState } from 'react';
import { Alert, ScrollView, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Button } from '../../../../src/components/ui/Button';
import { ErrorState } from '../../../../src/components/ui/ErrorState';
import { Input } from '../../../../src/components/ui/Input';
import { SkeletonCard } from '../../../../src/components/ui/Skeleton';
import { aiCreditsExhaustedMessage } from '../../../../src/config/paid-upgrades';
import { useInterviewPrep } from '../../../../src/hooks/useAI';
import { useCV, useCVSections } from '../../../../src/hooks/useCVs';
import { extractJsonObject } from '../../../../src/lib/ai-json';
import { requestFailureMessage } from '../../../../src/lib/api-errors';
import { alertIfUnverifiedEmail } from '../../../../src/lib/email-verification';
import { engineFailureMessage } from '../../../../src/lib/engine-errors';
import { canUseAI } from '../../../../src/lib/entitlements';
import { serializeCVToText } from '../../../../src/lib/serialize-cv';
import { useAuthStore } from '../../../../src/store/auth-store';
import { useCVStore } from '../../../../src/store/cv-store';
import { colors } from '../../../../src/theme/colors';

interface InterviewResult {
  behavioral: string[];
  technical: string[];
  questionsToAsk: string[];
  tips: string[];
}

function parseInterview(raw: string): InterviewResult | null {
  const obj = extractJsonObject(raw);
  if (!obj) return null;
  const arr = (v: unknown): string[] =>
    Array.isArray(v) ? v.map((x) => String(x)).filter(Boolean) : [];
  const result = {
    behavioral: arr(obj.behavioral),
    technical: arr(obj.technical),
    questionsToAsk: arr(obj.questionsToAsk),
    tips: arr(obj.tips),
  };
  if (
    !result.behavioral.length &&
    !result.technical.length &&
    !result.questionsToAsk.length &&
    !result.tips.length
  ) {
    return null;
  }
  return result;
}

function QuestionSection({
  title,
  items,
  ordered,
}: {
  title: string;
  items: string[];
  ordered?: boolean;
}) {
  if (!items.length) return null;
  return (
    <View className="mb-5">
      <Text className="text-sm font-semibold text-stone-800 mb-2">{title}</Text>
      {items.map((item, i) => (
        <Text key={`${title}-${i}`} className="text-sm text-stone-600 mb-1.5">
          {ordered ? `${i + 1}. ${item}` : `• ${item}`}
        </Text>
      ))}
    </View>
  );
}

export default function InterviewPrepScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { user, syncUser } = useAuthStore();
  const storeCv = useCVStore((s) => s.cv);
  const storeSections = useCVStore((s) => s.sections);
  const fromStore = !!id && storeCv?.id === id;

  const cvQuery = useCV(fromStore ? null : id ?? null);
  const sectionsQuery = useCVSections(fromStore ? null : id ?? null);
  const interviewPrep = useInterviewPrep();

  const [jobDescription, setJobDescription] = useState('');
  const [result, setResult] = useState<InterviewResult | null>(null);
  const [jdError, setJdError] = useState<string | undefined>();

  const cv = fromStore ? storeCv : cvQuery.data;
  const sections = fromStore ? storeSections : (sectionsQuery.data ?? []);
  const loadError = fromStore ? null : cvQuery.error ?? sectionsQuery.error;
  const loading = !fromStore && (cvQuery.isLoading || sectionsQuery.isLoading || !cv);

  const cvContent = cv ? serializeCVToText(cv, sections) : '';
  const emptyCv = !cvContent.trim();

  const runPrep = async () => {
    const jd = jobDescription.trim();
    if (!jd) {
      setJdError('Paste a job description first.');
      return;
    }
    setJdError(undefined);
    if (emptyCv) {
      Alert.alert('Empty CV', 'Add content to this CV before preparing questions.');
      return;
    }
    if (!user) return;
    if (
      !canUseAI(
        user.subscription,
        user.usage?.aiCreditsUsed ?? 0,
        user.usage?.aiCreditsLimit,
      )
    ) {
      Alert.alert('Credits Exhausted', aiCreditsExhaustedMessage('summary'));
      return;
    }

    try {
      const res = await interviewPrep.mutateAsync({
        jobDescription: jd,
        cvContent,
      });
      const parsed = parseInterview(res.content);
      await syncUser();
      await queryClient.invalidateQueries({ queryKey: ['user'] });
      if (!parsed) {
        Alert.alert(
          'Could not read the result',
          'Preparation finished but the response could not be read. A credit may have been used. Check your balance and try again.',
        );
        return;
      }
      setResult(parsed);
    } catch (err: unknown) {
      if (alertIfUnverifiedEmail(err)) return;
      Alert.alert(
        'Could not prepare questions',
        engineFailureMessage(err, 'Could not prepare questions. Please try again.'),
      );
    }
  };

  if (loadError) {
    return (
      <SafeAreaView className="flex-1 bg-stone-50" edges={['top', 'bottom']}>
        <ErrorState
          message={requestFailureMessage(loadError, 'Could not load this CV. Please try again.')}
          onRetry={() => {
            void cvQuery.refetch();
            void sectionsQuery.refetch();
          }}
        />
      </SafeAreaView>
    );
  }

  if (loading || !id) {
    return (
      <SafeAreaView className="flex-1 bg-stone-50" edges={['top', 'bottom']}>
        <View className="p-5">
          <SkeletonCard />
          <SkeletonCard />
        </View>
      </SafeAreaView>
    );
  }

  const creditsLeft = (user?.usage?.aiCreditsLimit ?? 0) - (user?.usage?.aiCreditsUsed ?? 0);

  return (
    <SafeAreaView className="flex-1 bg-stone-50" edges={['top', 'bottom']}>
      <View className="flex-row items-center px-5 pt-4 pb-3 bg-white border-b border-stone-100">
        <TouchableOpacity onPress={() => router.back()} className="mr-3" accessibilityLabel="Go back">
          <Ionicons name="arrow-back" size={22} color={colors.stone[700]} />
        </TouchableOpacity>
        <Text className="text-xl font-black text-stone-900 flex-1" numberOfLines={1}>
          Interview Prep
        </Text>
      </View>

      <ScrollView
        className="flex-1"
        contentContainerStyle={{ padding: 20, paddingBottom: 40 }}
        keyboardShouldPersistTaps="handled"
      >
        {!result ? (
          <>
            <Text className="text-stone-500 text-sm mb-4">
              Paste the job description. Flacron Engine prepares questions from this CV and the role. Uses 1 credit.
            </Text>
            <Input
              label="Job description"
              placeholder="Paste the job posting here"
              multiline
              numberOfLines={10}
              textAlignVertical="top"
              className="min-h-[180px]"
              value={jobDescription}
              onChangeText={(text) => {
                setJobDescription(text);
                if (jdError) setJdError(undefined);
              }}
              error={jdError}
              hint={emptyCv ? 'Add content to this CV first.' : undefined}
            />
            <Button
              variant="primary"
              fullWidth
              loading={interviewPrep.isPending}
              disabled={interviewPrep.isPending || emptyCv}
              onPress={() => void runPrep()}
            >
              Prepare questions
            </Button>
            {user ? (
              <Text className="text-xs text-stone-400 text-center mt-3">
                {creditsLeft} Flacron Engine credits remaining
              </Text>
            ) : null}
          </>
        ) : (
          <>
            <QuestionSection title="Behavioral" items={result.behavioral} ordered />
            <QuestionSection title="Technical" items={result.technical} ordered />
            <QuestionSection title="Questions to ask" items={result.questionsToAsk} />
            <QuestionSection title="Tips" items={result.tips} />
            <Button variant="outline" fullWidth onPress={() => setResult(null)}>
              Prepare again
            </Button>
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
