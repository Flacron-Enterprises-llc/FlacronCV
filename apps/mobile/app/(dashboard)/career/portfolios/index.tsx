import { Ionicons } from '@expo/vector-icons';
import { useRouter, type Href } from 'expo-router';
import React from 'react';
import { FlatList, RefreshControl, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { CareerHeader, Pill } from '../../../../src/components/career/CareerHeader';
import { EmptyState } from '../../../../src/components/ui/EmptyState';
import { ErrorState } from '../../../../src/components/ui/ErrorState';
import { SkeletonCard } from '../../../../src/components/ui/Skeleton';
import { usePortfolioGate, usePortfolios } from '../../../../src/hooks/career/portfolios';
import { useCareerAccess } from '../../../../src/hooks/useCareer';
import { portfolioLoadState, visibilityPill, visitsText } from '../../../../src/lib/career/portfolios';
import { careerErrorMessage, formatDay } from '../../../../src/lib/career-view';
import { colors } from '../../../../src/theme/colors';
import { useT } from '../../../../src/i18n';

/**
 * Portfolio pages: a stable page of chosen evidence, published publicly or as
 * a private link, with a QR code. The page itself is served by the website.
 */
export default function PortfolioListScreen() {
  const router = useRouter();
  const t = useT('careerPortfolios');
  const access = useCareerAccess();
  const gate = usePortfolioGate();
  const list = usePortfolios();
  const loadState = list.error ? portfolioLoadState(list.error) : null;
  const canCreate = gate === 'open' && !list.error;

  const addButton = canCreate ? (
    <TouchableOpacity
      onPress={() => router.push('/(dashboard)/career/portfolios/new' as Href)}
      className="h-11 w-11 items-center justify-center rounded-full bg-brand-600"
      accessibilityRole="button"
      accessibilityLabel={t('list.createA11y')}
    >
      <Ionicons name="add" size={24} color={colors.white} />
    </TouchableOpacity>
  ) : null;

  let content: React.ReactNode;
  if (gate === 'locked') {
    content = <EmptyState icon="lock-closed-outline" title={t('gate.locked')} />;
  } else if (gate === 'off' || loadState === 'off') {
    content = <EmptyState icon="lock-closed-outline" title={t('gate.offTitle')} description={t('gate.offBody')} />;
  } else if (loadState === 'upgrade') {
    content = (
      <EmptyState
        icon="lock-closed-outline"
        title={t('gate.upgradeTitle')}
        description={t('gate.upgradeBody')}
      />
    );
  } else if (gate === 'loading' || list.isLoading) {
    content = (
      <View className="p-5">
        <SkeletonCard />
        <SkeletonCard />
      </View>
    );
  } else if (gate === 'error' || list.error) {
    content = (
      <ErrorState
        message={careerErrorMessage(list.error ?? access.error, t('gate.loadFailed'))}
        onRetry={() => void (list.error ? list.refetch() : access.refetch())}
      />
    );
  } else {
    content = (
      <FlatList
        data={list.data?.items ?? []}
        keyExtractor={(page) => page.id}
        contentContainerStyle={{ padding: 20, paddingBottom: 40, flexGrow: 1 }}
        refreshControl={<RefreshControl refreshing={list.isRefetching} onRefresh={() => void list.refetch()} tintColor={colors.brand[600]} />}
        ListHeaderComponent={
          <Text className="text-stone-500 text-sm mb-4 leading-5">
            {t('list.intro')}
          </Text>
        }
        ListEmptyComponent={
          <EmptyState
            icon="globe-outline"
            title={t('list.emptyTitle')}
            description={t('list.emptyBody')}
            actionLabel={t('list.createPage')}
            onAction={() => router.push('/(dashboard)/career/portfolios/new' as Href)}
          />
        }
        renderItem={({ item }) => {
          const pill = visibilityPill(item.visibility);
          const visits = visitsText(item.visitCount);
          const meta = [
            t('list.itemCount', { count: item.evidenceIds.length }),
            visits,
            item.publishedAt ? t('list.publishedOn', { date: formatDay(item.publishedAt) ?? '' }) : null,
          ]
            .filter(Boolean)
            .join(' · ');
          return (
            <TouchableOpacity
              onPress={() => router.push(`/(dashboard)/career/portfolios/${encodeURIComponent(item.id)}` as Href)}
              className="bg-surface border border-stone-100 rounded-2xl p-4 mb-3"
              accessibilityRole="button"
              accessibilityLabel={`${item.title}, ${pill.label.toLowerCase()}${visits ? `, ${visits}` : ''}`}
              accessibilityHint={t('list.openHint')}
            >
              <View className="flex-row items-start justify-between">
                <View className="flex-1 me-2">
                  <Text className="font-bold text-stone-900">{item.title}</Text>
                  {item.headline ? (
                    <Text className="text-stone-500 text-sm mt-0.5" numberOfLines={2}>
                      {item.headline}
                    </Text>
                  ) : null}
                </View>
                <Pill label={pill.label} tone={pill.tone} />
              </View>
              <Text className="text-stone-400 text-xs mt-2">{meta}</Text>
            </TouchableOpacity>
          );
        }}
      />
    );
  }

  return (
    <SafeAreaView className="flex-1 bg-stone-50" edges={['top', 'bottom']}>
      <CareerHeader title={t('list.title')} subtitle={t('list.subtitle')} right={addButton} />
      {content}
    </SafeAreaView>
  );
}
