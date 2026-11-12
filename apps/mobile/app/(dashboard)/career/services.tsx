import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { FlatList, RefreshControl, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { CareerHeader, Pill } from '../../../src/components/career/CareerHeader';
import { EmptyState } from '../../../src/components/ui/EmptyState';
import { ErrorState } from '../../../src/components/ui/ErrorState';
import { SkeletonCard } from '../../../src/components/ui/Skeleton';
import { useHumanServices } from '../../../src/hooks/career/services';
import { useCareerAccess } from '../../../src/hooks/useCareer';
import { serviceRows, SERVICES_COPY } from '../../../src/lib/career/services';
import { careerErrorMessage } from '../../../src/lib/career-view';
import { colors } from '../../../src/theme/colors';

/**
 * Human review services (website: /career/services). Read-only: booking is
 * closed until commercial terms are set, so there is no booking, price or
 * purchase action in the app.
 */
export default function CareerServicesScreen() {
  const access = useCareerAccess();
  const list = useHumanServices();

  let content: React.ReactNode;
  if (access.data && !access.data.enabled) {
    content = <EmptyState icon="lock-closed-outline" title="Career tools are not included in your plan" />;
  } else if (access.isLoading || list.isLoading) {
    content = (
      <View className="p-5">
        <SkeletonCard />
      </View>
    );
  } else if (access.error || list.error) {
    const off = (list.error as { code?: string } | null)?.code === 'feature_unavailable';
    content = off ? (
      <EmptyState icon="lock-closed-outline" title="This tool is not open yet" description="Nothing was changed." />
    ) : (
      <ErrorState message={careerErrorMessage(list.error ?? access.error, 'This page could not be loaded. Nothing was changed.')} onRetry={() => void list.refetch()} />
    );
  } else {
    content = (
      <FlatList
        data={serviceRows(list.data)}
        keyExtractor={(row) => row.id}
        contentContainerStyle={{ padding: 20, paddingBottom: 40 }}
        refreshControl={<RefreshControl refreshing={list.isRefetching} onRefresh={() => void list.refetch()} tintColor={colors.brand[600]} />}
        ListHeaderComponent={<Text className="text-stone-500 text-sm mb-4 leading-5">{SERVICES_COPY.intro}</Text>}
        ListEmptyComponent={<EmptyState icon="people-outline" title={SERVICES_COPY.empty} />}
        renderItem={({ item }) => (
          <View className="bg-white border border-stone-100 rounded-2xl p-4 mb-3">
            <View className="flex-row items-start justify-between">
              <View className="flex-1 mr-2">
                <Text className="font-bold text-stone-900">{item.name}</Text>
                <Text className="text-stone-500 text-sm mt-0.5">{item.scope}</Text>
              </View>
              <Pill label={SERVICES_COPY.closedLabel} />
            </View>
            <View className="flex-row items-start mt-3">
              <Ionicons name="information-circle-outline" size={16} color={colors.stone[400]} />
              <Text className="text-stone-500 text-xs ml-1.5 flex-1 leading-4">{item.note}</Text>
            </View>
          </View>
        )}
      />
    );
  }

  return (
    <SafeAreaView className="flex-1 bg-stone-50" edges={['top', 'bottom']}>
      <CareerHeader title={SERVICES_COPY.title} subtitle="Not bookable yet" />
      {content}
    </SafeAreaView>
  );
}
