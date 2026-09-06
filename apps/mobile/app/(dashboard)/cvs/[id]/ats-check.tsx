import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';
import React, { useState } from 'react';
import { Alert, ScrollView, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Badge } from '../../../../src/components/ui/Badge';
import { Button } from '../../../../src/components/ui/Button';
import { ErrorState } from '../../../../src/components/ui/ErrorState';
import { Input } from '../../../../src/components/ui/Input';
import { SkeletonCard } from '../../../../src/components/ui/Skeleton';
import { aiCreditsExhaustedMessage } from '../../../../src/config/paid-upgrades';
import { useATSCheck } from '../../../../src/hooks/useAI';
import { useCV, useCVSections } from '../../../../src/hooks/useCVs';
import { extractJsonObject } from '../../../../src/lib/ai-json';
import { alertIfUnverifiedEmail } from '../../../../src/lib/email-verification';
import { engineFailureMessage } from '../../../../src/lib/engine-errors';
import { canUseAI } from '../../../../src/lib/entitlements';
import { requestFailureMessage } from '../../../../src/lib/api-errors';
import { serializeCVToText } from '../../../../src/lib/serialize-cv';
import { useAuthStore } from '../../../../src/store/auth-store';
import { useCVStore } from '../../../../src/store/cv-store';
import { colors } from '../../../../src/theme/colors';

interface ATSResult {
  score: number;
  matchedKeywords: string[];
  missingKeywords: string[];
  suggestions: string[];
  overallFeedback: string;
}

function parseATS(raw: string): ATSResult | null {
  const obj = extractJsonObject(raw);
  if (!obj) return null;
  const arr = (v: unknown): string[] =>
    Array.isArray(v) ? v.map((x) => String(x)).filter(Boolean) : [];
  const score = Math.max(0, Math.min(100, Math.round(Number(obj.score) || 0)));
  return {
    score,
    matchedKeywords: arr(obj.matchedKeywords),
    missingKeywords: arr(obj.missingKeywords),
    suggestions: arr(obj.suggestions),
    overallFeedback: typeof obj.overallFeedback === 'string' ? obj.overallFeedback : '',
  };
}

function scoreTint(score: number): string {
  if (score >= 75) return colors.success.DEFAULT;
  if (score >= 50) return colors.warning.DEFAULT;
  return colors.error.DEFAULT;
}

export default function ATSCheckScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { user, syncUser } = useAuthStore();
  const storeCv = useCVStore((s) => s.cv);
  const storeSections = useCVStore((s) => s.sections);
  const fromStore = !!id && storeCv?.id === id;

  const cvQuery = useCV(fromStore ? null : id ?? null);
  const sectionsQuery = useCVSections(fromStore ? null : id ?? null);
  const atsCheck = useATSCheck();

  const [jobDescription, setJobDescription] = useState('');
  const [result, setResult] = useState<ATSResult | null>(null);
  const [jdError, setJdError] = useState<string | undefined>();

  const cv = fromStore ? storeCv : cvQuery.data;
  const sections = fromStore ? storeSections : (sectionsQuery.data ?? []);
  const loadError = fromStore ? null : cvQuery.error ?? sectionsQuery.error;
  const loading = !fromStore && (cvQuery.isLoading || sectionsQuery.isLoading || !cv);

  const cvContent = cv ? serializeCVToText(cv, sections) : '';
  const emptyCv = !cvContent.trim();

  const runCheck = async () => {
    const jd = jobDescription.trim();
    if (!jd) {
      setJdError('Paste a job description first.');
      return;
    }
    setJdError(undefined);
    if (emptyCv) {
      Alert.alert('Empty CV', 'Add content to this CV before running a check.');
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
      const res = await atsCheck.mutateAsync({
        cvContent,
        jobDescription: jd,
      });
      const parsed = parseATS(res.content);
      await syncUser();
      await queryClient.invalidateQueries({ queryKey: ['user'] });
      if (!parsed) {
        Alert.alert(
          'Could not read the result',
          'The check finished but the response could not be read. A credit may have been used. Check your balance and try again.',
        );
        return;
      }
      setResult(parsed);
    } catch (err: unknown) {
      if (alertIfUnverifiedEmail(err)) return;
      Alert.alert('Could not run the check', engineFailureMessage(err, 'Could not run the check. Please try again.'));
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
          ATS Check
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
              Paste the job description. Flacron Engine scores this CV against it and lists keyword gaps. Uses 1 credit.
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
              loading={atsCheck.isPending}
              disabled={atsCheck.isPending || emptyCv}
              onPress={() => void runCheck()}
            >
              Run check
            </Button>
            {user ? (
              <Text className="text-xs text-stone-400 text-center mt-3">
                {creditsLeft} Flacron Engine credits remaining
              </Text>
            ) : null}
          </>
        ) : (
          <>
            <View className="items-center rounded-2xl border border-stone-100 bg-white py-6 mb-5">
              <Text className="text-4xl font-black" style={{ color: scoreTint(result.score) }}>
                {result.score}
                <Text className="text-xl font-bold text-stone-400">/100</Text>
              </Text>
              <Text className="text-xs font-semibold uppercase tracking-wider text-stone-500 mt-1">
                Match score
              </Text>
            </View>

            {result.overallFeedback ? (
              <Text className="bg-brand-50 text-brand-800 text-sm rounded-xl px-3 py-2.5 mb-5">
                {result.overallFeedback}
              </Text>
            ) : null}

            <Text className="text-sm font-semibold text-stone-800 mb-2">Keyword gaps</Text>
            {result.missingKeywords.length ? (
              <View className="flex-row flex-wrap gap-1.5 mb-5">
                {result.missingKeywords.map((k) => (
                  <Badge key={k} variant="danger">
                    {k}
                  </Badge>
                ))}
              </View>
            ) : (
              <Text className="text-sm text-stone-500 mb-5">No missing keywords.</Text>
            )}

            <Text className="text-sm font-semibold text-stone-800 mb-2">Matched keywords</Text>
            {result.matchedKeywords.length ? (
              <View className="flex-row flex-wrap gap-1.5 mb-5">
                {result.matchedKeywords.map((k) => (
                  <Badge key={k} variant="success">
                    {k}
                  </Badge>
                ))}
              </View>
            ) : (
              <Text className="text-sm text-stone-400 mb-5">None matched.</Text>
            )}

            {result.suggestions.length > 0 ? (
              <View className="mb-5">
                <Text className="text-sm font-semibold text-stone-800 mb-2">Suggestions</Text>
                {result.suggestions.map((s) => (
                  <Text key={s} className="text-sm text-stone-600 mb-1.5">
                    • {s}
                  </Text>
                ))}
              </View>
            ) : null}

            <Button variant="outline" fullWidth onPress={() => setResult(null)}>
              Check again
            </Button>
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
