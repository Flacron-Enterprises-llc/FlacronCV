import { Ionicons } from '@expo/vector-icons';
import * as Crypto from 'expo-crypto';
import { useRouter, type Href } from 'expo-router';
import React, { useRef, useState } from 'react';
import { FlatList, RefreshControl, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { CareerHeader } from '../../../../src/components/career/CareerHeader';
import { Button } from '../../../../src/components/ui/Button';
import { EmptyState } from '../../../../src/components/ui/EmptyState';
import { ErrorState } from '../../../../src/components/ui/ErrorState';
import { SkeletonCard } from '../../../../src/components/ui/Skeleton';
import { useCareerFeature, useMapList, useStartMap } from '../../../../src/hooks/career/opportunities';
import { useCareerAccess } from '../../../../src/hooks/useCareer';
import { mapErrorMessage, NO_TILES } from '../../../../src/lib/career/opportunities';
import { careerErrorMessage } from '../../../../src/lib/career-view';
import { colors } from '../../../../src/theme/colors';

/**
 * The website's map session page as a list. No map tiles, attribution or
 * provider are configured (the API returns null for all three and no
 * coordinates), so nothing is drawn on a map: the listings are shown as a
 * list and a session start only records the session, as on the website.
 */
export default function OpportunityMapScreen() {
  const router = useRouter();
  const access = useCareerAccess();
  const feature = useCareerFeature('mapSessions');
  const list = useMapList();
  const start = useStartMap();
  const [minutes, setMinutes] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Reused when the same start is retried after a failure, so it is never charged twice.
  const keyRef = useRef<string | null>(null);

  const onStart = () => {
    if (start.isPending) return;
    if (!keyRef.current) keyRef.current = Crypto.randomUUID();
    setError(null);
    start.mutate(keyRef.current, {
      onSuccess: (paid) => {
        keyRef.current = null;
        setMinutes(paid.result.minutes);
      },
      onError: (caught) => setError(mapErrorMessage(caught)),
    });
  };

  let content: React.ReactNode;
  if (access.data && !access.data.enabled) {
    content = <EmptyState icon="lock-closed-outline" title="Career tools are not included in your plan" />;
  } else if (access.data && !feature.on) {
    content = <EmptyState icon="lock-closed-outline" title="Map sessions are not included in your plan" description="Your saved listings are still in Job search." />;
  } else if (access.isLoading || list.isLoading) {
    content = (
      <View className="p-5">
        <SkeletonCard />
      </View>
    );
  } else if (access.error || list.error) {
    content = (
      <ErrorState message={careerErrorMessage(list.error ?? access.error, 'This page could not be loaded. Nothing was changed.')} onRetry={() => void list.refetch()} />
    );
  } else {
    content = (
      <FlatList
        data={list.data?.items ?? []}
        keyExtractor={(o) => o.id}
        contentContainerStyle={{ padding: 20, paddingBottom: 40 }}
        refreshControl={<RefreshControl refreshing={list.isRefetching} onRefresh={() => void list.refetch()} tintColor={colors.brand[600]} />}
        ListHeaderComponent={
          <View className="mb-3">
            <View className="bg-white border border-stone-100 rounded-2xl p-4 mb-4">
              <View className="flex-row items-center">
                <Ionicons name="map-outline" size={18} color={colors.stone[500]} />
                <Text className="text-stone-700 text-sm ml-2 flex-1 leading-5">{NO_TILES}</Text>
              </View>
              <View className="mt-4">
                <Button onPress={onStart} loading={start.isPending}>
                  Start 15 minutes
                </Button>
              </View>
              {minutes !== null ? (
                <Text className="text-success text-sm mt-3" accessibilityLiveRegion="polite">{`This session is ${minutes} minutes.`}</Text>
              ) : null}
              {error ? (
                <Text className="text-red-500 text-sm mt-3" accessibilityRole="alert">
                  {error}
                </Text>
              ) : null}
            </View>
            <Text className="text-sm font-semibold text-stone-500 uppercase tracking-wide">Listings (approximate locations)</Text>
          </View>
        }
        ListEmptyComponent={<EmptyState icon="briefcase-outline" title="No listings" description="Paste a job advert in Job search to see it here." />}
        renderItem={({ item }) => (
          <TouchableOpacity
            onPress={() => router.push(`/(dashboard)/career/opportunities/${item.id}` as Href)}
            className="bg-white border border-stone-100 rounded-2xl p-4 mb-3 flex-row items-center"
            accessibilityRole="button"
            accessibilityLabel={item.title}
          >
            <Ionicons name="location-outline" size={18} color={colors.stone[400]} />
            <Text className="font-semibold text-stone-900 ml-2 flex-1">{item.title}</Text>
            <Ionicons name="chevron-forward" size={18} color={colors.stone[400]} />
          </TouchableOpacity>
        )}
      />
    );
  }

  return (
    <SafeAreaView className="flex-1 bg-stone-50" edges={['top', 'bottom']}>
      <CareerHeader title="Map session" subtitle="List view: no map tiles are connected" />
      {content}
    </SafeAreaView>
  );
}
