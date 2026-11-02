import React from 'react';
import { FlatList, RefreshControl, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { CareerHeader, Pill } from '../../../src/components/career/CareerHeader';
import { EmptyState } from '../../../src/components/ui/EmptyState';
import { ErrorState } from '../../../src/components/ui/ErrorState';
import { SkeletonCard } from '../../../src/components/ui/Skeleton';
import { useCareerAccess, useCareerOpportunities } from '../../../src/hooks/useCareer';
import { careerErrorMessage, formatDay } from '../../../src/lib/career-view';
import { colors } from '../../../src/theme/colors';

/**
 * Opportunities saved or pasted in the career tools. Read-only on mobile. No
 * licensed job feed is connected, so nothing here is presented as a live search.
 */
export default function CareerOpportunitiesScreen() {
  const access = useCareerAccess();
  const list = useCareerOpportunities();

  let content: React.ReactNode;
  if (access.data && !access.data.enabled) {
    content = <EmptyState icon="lock-closed-outline" title="Career tools are not included in your plan" />;
  } else if (access.isLoading || list.isLoading) {
    content = (
      <View className="p-5">
        <SkeletonCard />
        <SkeletonCard />
      </View>
    );
  } else if (access.error || list.error) {
    content = <ErrorState message={careerErrorMessage(list.error ?? access.error, 'Could not load opportunities.')} onRetry={() => void list.refetch()} />;
  } else {
    content = (
      <FlatList
        data={list.data?.items ?? []}
        keyExtractor={(o) => o.id}
        contentContainerStyle={{ padding: 20, paddingBottom: 40 }}
        refreshControl={<RefreshControl refreshing={list.isRefetching} onRefresh={() => void list.refetch()} tintColor={colors.brand[600]} />}
        ListHeaderComponent={
          <Text className="text-stone-500 text-sm mb-4 leading-5">
            Job adverts you saved or pasted on the website. No live job feed is connected yet. Track the jobs you apply for in the Job Tracker.
          </Text>
        }
        ListEmptyComponent={<EmptyState icon="briefcase-outline" title="No saved opportunities" description="Paste a job advert in the career tools on the website to keep it here." />}
        renderItem={({ item }) => (
          <View className="bg-white border border-stone-100 rounded-2xl p-4 mb-3">
            <View className="flex-row items-start justify-between">
              <View className="flex-1 mr-2">
                <Text className="font-bold text-stone-900">{item.title}</Text>
                {item.organization ? <Text className="text-stone-500 text-sm mt-0.5">{item.organization}</Text> : null}
              </View>
              <Pill label={item.label === 'expired' ? 'EXPIRED' : 'OPEN'} tone={item.label === 'expired' ? 'default' : 'success'} />
            </View>
            {item.locations.length > 0 ? <Text className="text-stone-500 text-xs mt-2">{item.locations.join(' · ')}</Text> : null}
            <Text className="text-stone-400 text-xs mt-1">
              {item.deadline ? `Deadline ${formatDay(item.deadline)}` : `Checked ${formatDay(item.checkedAt) ?? ''}`}
            </Text>
          </View>
        )}
      />
    );
  }

  return (
    <SafeAreaView className="flex-1 bg-stone-50" edges={['top', 'bottom']}>
      <CareerHeader title="Saved opportunities" />
      {content}
    </SafeAreaView>
  );
}
