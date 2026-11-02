import React from 'react';
import { Alert, FlatList, RefreshControl, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { CareerHeader, Pill } from '../../../src/components/career/CareerHeader';
import { EmptyState } from '../../../src/components/ui/EmptyState';
import { ErrorState } from '../../../src/components/ui/ErrorState';
import { SkeletonCard } from '../../../src/components/ui/Skeleton';
import { useCareerAccess, useCareerFacts, useFactActions } from '../../../src/hooks/useCareer';
import { careerErrorMessage, FACT_TYPE_LABEL, factSummary } from '../../../src/lib/career-view';
import { colors } from '../../../src/theme/colors';
import type { Fact } from '../../../../../packages/career-api-client/src/types';

/**
 * Career profile facts on mobile: review, confirm (the consent that a fact may
 * be used in drafts) and remove. Adding or editing facts in detail stays on the
 * website, where the full form lives.
 */
export default function CareerProfileScreen() {
  const access = useCareerAccess();
  const facts = useCareerFacts();
  const { confirm, remove } = useFactActions();
  const busy = confirm.isPending || remove.isPending;

  const onConfirm = (fact: Fact) => {
    confirm.mutate(fact.id, {
      onError: (error) => Alert.alert('Not confirmed', careerErrorMessage(error, 'Could not confirm this fact. Nothing was changed.')),
    });
  };

  const onRemove = (fact: Fact) => {
    Alert.alert('Remove this fact?', 'Drafts already made keep their text. New drafts will no longer use it.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove',
        style: 'destructive',
        onPress: () =>
          remove.mutate(fact.id, {
            onError: (error) => Alert.alert('Not removed', careerErrorMessage(error, 'Could not remove this fact. Nothing was changed.')),
          }),
      },
    ]);
  };

  const body = () => {
    if (access.data && !access.data.enabled) {
      return <EmptyState icon="lock-closed-outline" title="Career tools are not included in your plan" description="Your FlacronCV CVs and letters are unchanged." />;
    }
    if (facts.isLoading || access.isLoading) {
      return (
        <View className="p-5">
          <SkeletonCard />
          <SkeletonCard />
        </View>
      );
    }
    if (facts.error || access.error) {
      return <ErrorState message={careerErrorMessage(facts.error ?? access.error, 'Could not load your career profile.')} onRetry={() => void facts.refetch()} />;
    }
    const items = facts.data?.items ?? [];
    if (items.length === 0) {
      return <EmptyState icon="person-outline" title="No career facts yet" description="Add your experience, education and skills on the FlacronCV website; they appear here." />;
    }
    return (
      <FlatList
        data={items}
        keyExtractor={(f) => f.id}
        contentContainerStyle={{ padding: 20, paddingBottom: 40 }}
        refreshControl={<RefreshControl refreshing={facts.isRefetching} onRefresh={() => void facts.refetch()} tintColor={colors.brand[600]} />}
        ListHeaderComponent={
          <Text className="text-stone-500 text-sm mb-4 leading-5">
            Drafts use only confirmed facts. Confirming a fact means you agree it is accurate and may be used in your career drafts.
          </Text>
        }
        renderItem={({ item }) => {
          const { title, detail } = factSummary(item.factType, item.value as unknown as Record<string, unknown>);
          const confirmed = item.confirmation === 'confirmed';
          return (
            <View className="bg-white border border-stone-100 rounded-2xl p-4 mb-3">
              <View className="flex-row items-center justify-between mb-1">
                <Text className="text-xs font-semibold text-stone-500 uppercase tracking-wide">{FACT_TYPE_LABEL[item.factType] ?? item.factType}</Text>
                <Pill label={confirmed ? 'CONFIRMED' : 'DRAFT'} tone={confirmed ? 'success' : 'warning'} />
              </View>
              <Text className="font-bold text-stone-900">{title}</Text>
              {detail ? <Text className="text-stone-500 text-sm mt-0.5">{detail}</Text> : null}
              {item.missingFields.length > 0 ? (
                <Text className="text-warning text-xs mt-2">{`Missing: ${item.missingFields.join(', ')}`}</Text>
              ) : null}
              <View className="flex-row mt-3 gap-2">
                {!confirmed ? (
                  <TouchableOpacity
                    disabled={busy || item.missingFields.length > 0}
                    onPress={() => onConfirm(item)}
                    className={`px-4 min-h-[44px] justify-center rounded-xl ${item.missingFields.length > 0 ? 'bg-stone-100' : 'bg-brand-600'}`}
                    accessibilityRole="button"
                    accessibilityState={{ disabled: busy || item.missingFields.length > 0 }}
                  >
                    <Text className={item.missingFields.length > 0 ? 'text-stone-400 font-semibold' : 'text-white font-semibold'}>Confirm</Text>
                  </TouchableOpacity>
                ) : null}
                <TouchableOpacity
                  disabled={busy}
                  onPress={() => onRemove(item)}
                  className="px-4 min-h-[44px] justify-center rounded-xl border border-stone-200"
                  accessibilityRole="button"
                  accessibilityLabel={`Remove ${title}`}
                >
                  <Text className="text-stone-700 font-semibold">Remove</Text>
                </TouchableOpacity>
              </View>
            </View>
          );
        }}
      />
    );
  };

  return (
    <SafeAreaView className="flex-1 bg-stone-50" edges={['top', 'bottom']}>
      <CareerHeader title="Career profile" subtitle="The facts your career drafts are built from" />
      {body()}
    </SafeAreaView>
  );
}
