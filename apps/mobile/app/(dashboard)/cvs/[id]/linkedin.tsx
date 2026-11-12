import { Ionicons } from '@expo/vector-icons';
import { useQueryClient } from '@tanstack/react-query';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useState } from 'react';
import { Alert, Pressable, ScrollView, Share, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Button } from '../../../../src/components/ui/Button';
import { ErrorState } from '../../../../src/components/ui/ErrorState';
import { Input } from '../../../../src/components/ui/Input';
import { SkeletonCard } from '../../../../src/components/ui/Skeleton';
import { aiCreditsExhaustedMessage, upgradeAlertButtons } from '../../../../src/config/paid-upgrades';
import { useLinkedInOptimize } from '../../../../src/hooks/useCVDesign';
import { useCV, useCVSections } from '../../../../src/hooks/useCVs';
import { requestFailureMessage } from '../../../../src/lib/api-errors';
import { alertIfUnverifiedEmail } from '../../../../src/lib/email-verification';
import { engineFailureMessage } from '../../../../src/lib/engine-errors';
import { canUseAI } from '../../../../src/lib/entitlements';
import {
  LINKEDIN_TARGET_ROLE_MAX,
  type LinkedInResult,
  linkedInShareText,
  parseLinkedIn,
  skillsCopyText,
} from '../../../../src/lib/linkedin';
import { serializeCVToText } from '../../../../src/lib/serialize-cv';
import { useAuthStore } from '../../../../src/store/auth-store';
import { useCVStore } from '../../../../src/store/cv-store';
import { colors } from '../../../../src/theme/colors';

/** No clipboard module in the app: the system share sheet offers Copy on both platforms. */
async function shareText(text: string, title: string) {
  try {
    await Share.share({ message: text, title });
  } catch {
    // Share sheet unavailable or dismissed — the text stays selectable on screen.
  }
}

function CopyButton({ text, label }: { text: string; label: string }) {
  return (
    <Pressable
      onPress={() => void shareText(text, label)}
      accessibilityRole="button"
      accessibilityLabel={`Copy ${label}`}
      accessibilityHint="Opens the share sheet, where you can copy the text"
      className="min-h-[44px] flex-row items-center px-2 rounded-lg active:bg-brand-50"
    >
      <Ionicons name="copy-outline" size={16} color={colors.brand[600]} />
      <Text className="text-xs font-semibold text-brand-600 ml-1">Copy</Text>
    </Pressable>
  );
}

export default function LinkedInScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { user, syncUser } = useAuthStore();
  const storeCv = useCVStore((s) => s.cv);
  const storeSections = useCVStore((s) => s.sections);
  const fromStore = !!id && storeCv?.id === id;

  const cvQuery = useCV(fromStore ? null : id ?? null);
  const sectionsQuery = useCVSections(fromStore ? null : id ?? null);
  const optimize = useLinkedInOptimize();

  const [targetRole, setTargetRole] = useState('');
  const [result, setResult] = useState<LinkedInResult | null>(null);

  const cv = fromStore ? storeCv : cvQuery.data;
  const sections = fromStore ? storeSections : (sectionsQuery.data ?? []);
  const loadError = fromStore ? null : cvQuery.error ?? sectionsQuery.error;
  const loading = !fromStore && (cvQuery.isLoading || sectionsQuery.isLoading || !cv);

  const cvContent = cv ? serializeCVToText(cv, sections) : '';
  const emptyCv = !cvContent.trim();

  const runOptimize = async () => {
    if (emptyCv) {
      Alert.alert('Empty CV', 'Add some content to your CV first.');
      return;
    }
    if (!user) {
      Alert.alert('Account not loaded', 'Your account has not loaded yet. Check your connection and try again.');
      return;
    }
    if (!canUseAI(user.subscription, user.usage?.aiCreditsUsed ?? 0, user.usage?.aiCreditsLimit)) {
      Alert.alert(
        'Credits Exhausted',
        aiCreditsExhaustedMessage('summary'),
        upgradeAlertButtons(() => router.push('/(dashboard)/settings/billing')),
      );
      return;
    }
    try {
      const res = await optimize.mutateAsync({ cvContent, targetRole });
      const parsed = parseLinkedIn(res.content);
      await syncUser();
      await queryClient.invalidateQueries({ queryKey: ['user'] });
      if (!parsed) {
        Alert.alert(
          'Could not read the result',
          'The optimizer finished but the response could not be read. A credit may have been used. Check your balance and try again.',
        );
        return;
      }
      setResult(parsed);
    } catch (err: unknown) {
      if (alertIfUnverifiedEmail(err)) return;
      Alert.alert(
        'Could not optimize',
        engineFailureMessage(err, 'Could not optimize your profile. Please try again.'),
      );
    }
  };

  const header = (
    <View className="flex-row items-center px-5 pt-4 pb-3 bg-white border-b border-stone-100">
      <TouchableOpacity
        onPress={() => router.back()}
        className="mr-3 w-11 h-11 items-center justify-center -ml-3"
        accessibilityRole="button"
        accessibilityLabel="Go back"
      >
        <Ionicons name="arrow-back" size={22} color={colors.stone[700]} />
      </TouchableOpacity>
      <Ionicons name="logo-linkedin" size={20} color={colors.brand[600]} />
      <Text className="text-xl font-black text-stone-900 flex-1 ml-2" numberOfLines={1}>
        LinkedIn Optimizer
      </Text>
    </View>
  );

  if (loadError) {
    return (
      <SafeAreaView className="flex-1 bg-stone-50" edges={['top', 'bottom']}>
        {header}
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
        {header}
        <View className="p-5">
          <SkeletonCard />
          <SkeletonCard />
        </View>
      </SafeAreaView>
    );
  }

  const creditsLeft = Math.max(0, (user?.usage?.aiCreditsLimit ?? 0) - (user?.usage?.aiCreditsUsed ?? 0));

  return (
    <SafeAreaView className="flex-1 bg-stone-50" edges={['top', 'bottom']}>
      {header}
      <ScrollView
        className="flex-1"
        contentContainerStyle={{ padding: 20, paddingBottom: 40 }}
        keyboardShouldPersistTaps="handled"
      >
        {!result ? (
          <>
            <Text className="text-stone-500 text-sm mb-4">
              Turn your CV into an optimized LinkedIn profile. Uses 1 Engine credit.
            </Text>
            <Input
              label="Target role (optional)"
              placeholder="e.g. Product Manager"
              value={targetRole}
              maxLength={LINKEDIN_TARGET_ROLE_MAX}
              onChangeText={setTargetRole}
              returnKeyType="go"
              onSubmitEditing={() => {
                if (!optimize.isPending) void runOptimize();
              }}
              hint={emptyCv ? 'Add some content to your CV first.' : undefined}
            />
            <Button
              variant="primary"
              fullWidth
              loading={optimize.isPending}
              disabled={optimize.isPending || emptyCv}
              onPress={() => void runOptimize()}
            >
              {optimize.isPending ? 'Optimizing…' : 'Optimize'}
            </Button>
            {user ? (
              <Text className="text-xs text-stone-400 text-center mt-3">
                {creditsLeft > 0 ? `${creditsLeft} credits left` : 'No Engine credits remaining'}
              </Text>
            ) : null}
          </>
        ) : (
          <>
            {result.headline ? (
              <View className="mb-5">
                <View className="flex-row items-center justify-between mb-1">
                  <Text className="text-sm font-semibold text-stone-800">Headline</Text>
                  <CopyButton text={result.headline} label="Headline" />
                </View>
                <Text selectable className="rounded-xl border border-stone-200 bg-white p-3 text-sm text-stone-700">
                  {result.headline}
                </Text>
              </View>
            ) : null}

            {result.about ? (
              <View className="mb-5">
                <View className="flex-row items-center justify-between mb-1">
                  <Text className="text-sm font-semibold text-stone-800">About section</Text>
                  <CopyButton text={result.about} label="About section" />
                </View>
                <Text selectable className="rounded-xl border border-stone-200 bg-white p-3 text-sm text-stone-700">
                  {result.about}
                </Text>
              </View>
            ) : null}

            {result.skills.length > 0 ? (
              <View className="mb-5">
                <View className="flex-row items-center justify-between mb-2">
                  <Text className="text-sm font-semibold text-stone-800">Skills & keywords</Text>
                  <CopyButton text={skillsCopyText(result)} label="Skills & keywords" />
                </View>
                <View className="flex-row flex-wrap gap-1.5">
                  {result.skills.map((s, i) => (
                    <View key={`${s}-${i}`} className="rounded-full bg-brand-100 px-2.5 py-1">
                      <Text selectable className="text-xs font-medium text-brand-800">
                        {s}
                      </Text>
                    </View>
                  ))}
                </View>
              </View>
            ) : null}

            {result.tips.length > 0 ? (
              <View className="mb-5">
                <Text className="text-sm font-semibold text-stone-800 mb-2">Tips</Text>
                {result.tips.map((tip, i) => (
                  <Text key={`${tip}-${i}`} selectable className="text-sm text-stone-600 mb-1.5">
                    • {tip}
                  </Text>
                ))}
              </View>
            ) : null}

            <Text className="text-xs text-stone-400 mb-4">Tip: press and hold any text to select it.</Text>

            <View className="gap-3">
              <Button
                variant="outline"
                fullWidth
                icon={<Ionicons name="share-outline" size={18} color={colors.stone[700]} />}
                onPress={() => void shareText(linkedInShareText(result), 'LinkedIn profile')}
              >
                Share all
              </Button>
              <Button
                variant="ghost"
                fullWidth
                icon={<Ionicons name="refresh" size={18} color={colors.stone[700]} />}
                onPress={() => setResult(null)}
              >
                Start over
              </Button>
            </View>
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
