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
import { useT } from '../../../src/i18n';

/**
 * Human review services (website: /career/services). Read-only: booking is
 * closed until commercial terms are set, so there is no booking, price or
 * purchase action in the app.
 */
export default function CareerServicesScreen() {
  const t = useT('careerModes');
  const tb = useT('careerBusiness');
  const access = useCareerAccess();
  const list = useHumanServices();

  let content: React.ReactNode;
  if (access.data && !access.data.enabled) {
    content = <EmptyState icon="lock-closed-outline" title={t('common.locked')} />;
  } else if (access.isLoading || list.isLoading) {
    content = (
      <View className="p-5">
        <SkeletonCard />
      </View>
    );
  } else if (access.error || list.error) {
    const off = (list.error as { code?: string } | null)?.code === 'feature_unavailable';
    content = off ? (
      <EmptyState icon="lock-closed-outline" title={t('services.offTitle')} description={t('services.offBody')} />
    ) : (
      <ErrorState message={careerErrorMessage(list.error ?? access.error, t('common.loadFailed'))} onRetry={() => void list.refetch()} />
    );
  } else {
    content = (
      <FlatList
        data={serviceRows(list.data)}
        keyExtractor={(row) => row.id}
        contentContainerStyle={{ padding: 20, paddingBottom: 40 }}
        refreshControl={<RefreshControl refreshing={list.isRefetching} onRefresh={() => void list.refetch()} tintColor={colors.brand[600]} />}
        ListHeaderComponent={
          <>
            <View
              className="bg-surface border border-stone-100 rounded-2xl p-4 mb-4"
              accessible
              accessibilityLabel={`${tb('scope.comingSoon')}. ${tb('scope.servicesSoonTitle')}. ${tb('scope.servicesSoonBody')}`}
            >
              <View className="flex-row items-center flex-wrap gap-2">
                <Pill label={tb('scope.comingSoon')} />
                <Text className="font-bold text-stone-900 flex-1">{tb('scope.servicesSoonTitle')}</Text>
              </View>
              <Text className="text-stone-500 text-sm mt-2 leading-5">{tb('scope.servicesSoonBody')}</Text>
            </View>
            <Text className="text-stone-500 text-sm mb-4 leading-5">{SERVICES_COPY.intro}</Text>
          </>
        }
        ListEmptyComponent={<EmptyState icon="people-outline" title={SERVICES_COPY.empty} />}
        renderItem={({ item }) => (
          <View className="bg-surface border border-stone-100 rounded-2xl p-4 mb-3">
            <View className="flex-row items-start justify-between">
              <View className="flex-1 me-2">
                <Text className="font-bold text-stone-900">{item.name}</Text>
                <Text className="text-stone-500 text-sm mt-0.5">{item.scope}</Text>
              </View>
              <Pill label={SERVICES_COPY.closedLabel} />
            </View>
            <View className="flex-row items-start mt-3">
              <Ionicons name="information-circle-outline" size={16} color={colors.stone[400]} />
              <Text className="text-stone-500 text-xs ms-1.5 flex-1 leading-4">{item.note}</Text>
            </View>
          </View>
        )}
      />
    );
  }

  return (
    <SafeAreaView className="flex-1 bg-stone-50" edges={['top', 'bottom']}>
      <CareerHeader title={SERVICES_COPY.title} subtitle={t('services.subtitle')} />
      {content}
    </SafeAreaView>
  );
}
