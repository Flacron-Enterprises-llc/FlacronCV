import { Ionicons } from '@expo/vector-icons';
import { useRouter, type Href } from 'expo-router';
import React from 'react';
import { Pressable, RefreshControl, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { CareerHeader } from '../../../src/components/career/CareerHeader';
import { EmptyState } from '../../../src/components/ui/EmptyState';
import { ErrorState } from '../../../src/components/ui/ErrorState';
import { SkeletonCard } from '../../../src/components/ui/Skeleton';
import { useLearningLoop } from '../../../src/hooks/career/learning-loop';
import { useCareerAccess } from '../../../src/hooks/useCareer';
import { featureOff } from '../../../src/lib/career/alerts';
import { LOOP_INTRO, LOOP_TITLE, loopErrorKind, loopErrorMessage, loopViewModel } from '../../../src/lib/career/learning-loop';
import { colors } from '../../../src/theme/colors';

/**
 * Application outcomes, as on the website's career/learning-loop page: the
 * server's statement (observed counts in the user's recorded applications,
 * with the sample caveat) and its suggestion, plus the counts behind them.
 * Read-only; nothing is charged. Never presented as a hiring probability.
 */
export default function CareerLearningLoopScreen() {
  const router = useRouter();
  const access = useCareerAccess();
  const off = featureOff(access.data?.features, 'applicationAnalytics');
  const report = useLearningLoop(!off);

  let content: React.ReactNode;
  if (access.data && !access.data.enabled) {
    content = <EmptyState icon="lock-closed-outline" title="Career tools are not included in your plan" />;
  } else if (off || (report.error && loopErrorKind(report.error) === 'switched-off')) {
    content = (
      <EmptyState
        icon="analytics-outline"
        title="This tool is not open yet"
        description="It is switched off in this preview. Nothing was changed and no credit was used."
      />
    );
  } else if (report.error && loopErrorKind(report.error) === 'not-included') {
    content = (
      <EmptyState
        icon="lock-closed-outline"
        title="Outcome analytics are not included in your career plan"
        description="Your applications in the Job Tracker are unchanged."
      />
    );
  } else if (access.isLoading || report.isLoading) {
    content = (
      <View className="p-5">
        <SkeletonCard />
        <SkeletonCard />
      </View>
    );
  } else if (access.error || report.error || !report.data) {
    content = <ErrorState message={loopErrorMessage(report.error ?? access.error)} onRetry={() => void report.refetch()} />;
  } else {
    const view = loopViewModel(report.data);
    content = (
      <ScrollView
        contentContainerStyle={{ padding: 20, paddingBottom: 48 }}
        refreshControl={<RefreshControl refreshing={report.isRefetching} onRefresh={() => void report.refetch()} tintColor={colors.brand[600]} />}
      >
        <Text className="text-stone-500 text-sm mb-4 leading-5">{LOOP_INTRO}</Text>

        <View className="bg-white border border-stone-100 rounded-2xl p-4 mb-3">
          <Text className="text-stone-900 text-base leading-6">{view.statement}</Text>
          {view.suggestion ? <Text className="text-stone-700 text-sm leading-5 mt-3">{view.suggestion}</Text> : null}
        </View>

        {view.sampleNote ? (
          <View className="bg-warning-bg rounded-2xl p-4 mb-3 flex-row">
            <Ionicons name="information-circle-outline" size={18} color={colors.warning.DEFAULT} />
            <Text className="flex-1 ml-2 text-warning text-sm leading-5">{view.sampleNote}</Text>
          </View>
        ) : null}

        <View className="bg-white border border-stone-100 rounded-2xl px-4 py-2 mb-3">
          {view.stats.map((stat, index) => (
            <View
              key={stat.key}
              className={`flex-row items-center justify-between py-3 ${index > 0 ? 'border-t border-stone-100' : ''}`}
              accessible
              accessibilityLabel={`${stat.label}: ${stat.value}`}
            >
              <Text className="text-stone-600 text-sm flex-1 mr-3">{stat.label}</Text>
              <Text className="text-stone-900 font-bold text-base">{stat.value}</Text>
            </View>
          ))}
        </View>

        <Text className="text-stone-400 text-xs leading-4 mb-4">
          Counts come from your applications in the Job Tracker. Interviews include offers. This is not a hiring probability.
        </Text>

        <Pressable
          onPress={() => router.push('/(dashboard)/jobs' as Href)}
          accessibilityRole="button"
          className="min-h-[44px] flex-row items-center justify-center rounded-xl border border-stone-300 px-4"
        >
          <Ionicons name="briefcase-outline" size={18} color={colors.stone[700]} />
          <Text className="ml-2 text-stone-800 font-semibold">Open the Job Tracker</Text>
        </Pressable>
      </ScrollView>
    );
  }

  return (
    <SafeAreaView className="flex-1 bg-stone-50" edges={['top', 'bottom']}>
      <CareerHeader title={LOOP_TITLE} />
      {content}
    </SafeAreaView>
  );
}
