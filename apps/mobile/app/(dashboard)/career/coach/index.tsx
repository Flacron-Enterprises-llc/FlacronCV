import { Ionicons } from '@expo/vector-icons';
import { useRouter, type Href } from 'expo-router';
import React from 'react';
import { Alert, Pressable, RefreshControl, ScrollView, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { CoachThreadSummary } from '../../../../../../packages/career-api-client/src/types';
import { CareerHeader } from '../../../../src/components/career/CareerHeader';
import { FeatureState } from '../../../../src/components/career/FeatureState';
import { Button } from '../../../../src/components/ui/Button';
import { ErrorState } from '../../../../src/components/ui/ErrorState';
import { SkeletonCard } from '../../../../src/components/ui/Skeleton';
import { useCoachThreads, useDeleteCoachThread } from '../../../../src/hooks/career/coach';
import { useCareerFacts } from '../../../../src/hooks/useCareer';
import {
  MAX_COACH_THREADS,
  NEW_THREAD,
  balanceLine,
  coachErrorMessage,
  coachLeft,
  hasConfirmedFacts,
} from '../../../../src/lib/career/coach';
import { formatDay } from '../../../../src/lib/career-view';
import { colors } from '../../../../src/theme/colors';
import { useT } from '../../../../src/i18n';
import { RTL_FLIP } from '../../../../src/i18n/native';

/**
 * Career coach (spec §26), as on the website (career/coach): the monthly
 * coaching replies left, this account's conversations and a new one. Each
 * coach reply uses one coaching response; asking is on the thread screen.
 */
export default function CoachScreen() {
  const t = useT('careerCoach');
  return (
    <SafeAreaView className="flex-1 bg-stone-50" edges={['top', 'bottom']}>
      <CareerHeader title={t('title')} subtitle={t('subtitle')} />
      <FeatureState href="/career/coach">
        <CoachList />
      </FeatureState>
    </SafeAreaView>
  );
}

function CoachList() {
  const t = useT('careerCoach');
  const router = useRouter();
  const list = useCoachThreads();
  const facts = useCareerFacts();
  const remove = useDeleteCoachThread();

  if (list.isLoading) {
    return (
      <View className="p-5">
        <SkeletonCard />
        <SkeletonCard />
      </View>
    );
  }
  if (list.error || !list.data) {
    return <ErrorState message={coachErrorMessage(list.error, 'load')} onRetry={() => void list.refetch()} />;
  }

  const threads = list.data.items;
  const left = coachLeft(list.data);
  const renewal = formatDay(list.data.coaching.renewalDate);
  const atLimit = threads.length >= MAX_COACH_THREADS;

  const confirmDelete = (thread: CoachThreadSummary) => {
    Alert.alert(t('deleteTitle'), t('deleteBody', { title: thread.title }), [
      { text: t('cancel'), style: 'cancel' },
      {
        text: t('delete'),
        style: 'destructive',
        onPress: () =>
          remove.mutate(thread.id, {
            onError: (error) => Alert.alert(t('deleteTitle'), coachErrorMessage(error, 'delete')),
          }),
      },
    ]);
  };

  return (
    <ScrollView
      contentContainerStyle={{ padding: 20, paddingBottom: 48 }}
      refreshControl={
        <RefreshControl
          refreshing={list.isRefetching}
          onRefresh={() => {
            void list.refetch();
            void facts.refetch();
          }}
          tintColor={colors.brand[600]}
        />
      }
    >
      <View className="bg-surface border border-stone-100 rounded-2xl p-4">
        <View className="flex-row items-center">
          <View className="w-10 h-10 rounded-full bg-brand-100 items-center justify-center me-3">
            <Ionicons name="chatbubbles-outline" size={20} color={colors.brand[600]} />
          </View>
          <View className="flex-1">
            <Text className="text-stone-900 font-semibold">{balanceLine(list.data)}</Text>
            {renewal ? <Text className="text-stone-500 text-xs mt-0.5">{t('renews', { date: renewal })}</Text> : null}
          </View>
        </View>
        <Text className="text-stone-500 text-sm mt-3 leading-5">{t('intro')}</Text>
        {left < 1 ? <Text className="text-warning text-sm mt-3 leading-5">{t('noneLeft')}</Text> : null}
        {atLimit ? <Text className="text-warning text-sm mt-3 leading-5">{t('threadLimit', { max: MAX_COACH_THREADS })}</Text> : null}
        <Button
          className="mt-4"
          fullWidth
          disabled={atLimit}
          onPress={() => router.push(`/(dashboard)/career/coach/${NEW_THREAD}` as Href)}
          icon={<Ionicons name="add" size={18} color="#fff" />}
        >
          {t('newConversation')}
        </Button>
      </View>

      {facts.data && !hasConfirmedFacts(facts.data.items) ? (
        <TouchableOpacity
          onPress={() => router.push('/(dashboard)/career/profile' as Href)}
          accessibilityRole="link"
          accessibilityLabel={t('noFactsTitle')}
          accessibilityHint={t('noFactsBody')}
          className="bg-brand-50 border border-brand-100 rounded-2xl p-4 mt-4 flex-row items-center"
        >
          <View className="flex-1">
            <Text className="text-stone-900 font-semibold">{t('noFactsTitle')}</Text>
            <Text className="text-stone-600 text-sm mt-1 leading-5">{t('noFactsBody')}</Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color={colors.stone[400]} style={RTL_FLIP} />
        </TouchableOpacity>
      ) : null}

      <Text className="text-sm font-semibold text-stone-500 uppercase tracking-wide mt-6 mb-2" accessibilityRole="header">
        {t('conversations')}
      </Text>
      {threads.length === 0 ? (
        <View className="bg-surface border border-stone-100 rounded-2xl p-4">
          <Text className="font-semibold text-stone-800">{t('emptyTitle')}</Text>
          <Text className="text-stone-500 text-sm mt-1 leading-5">{t('emptyBody')}</Text>
        </View>
      ) : (
        threads.map((thread) => (
          <View key={thread.id} className="bg-surface border border-stone-100 rounded-2xl mb-3 flex-row items-center">
            <Pressable
              onPress={() => router.push(`/(dashboard)/career/coach/${thread.id}` as Href)}
              accessibilityRole="button"
              accessibilityLabel={t('threadA11y', { title: thread.title, count: thread.messageCount })}
              className="flex-1 p-4 active:bg-stone-50 rounded-2xl"
            >
              <Text className="font-bold text-stone-900" numberOfLines={2}>
                {thread.title}
              </Text>
              <Text className="text-stone-500 text-xs mt-1">
                {t('threadMeta', { count: thread.messageCount, date: formatDay(thread.updatedAt) ?? '' })}
              </Text>
            </Pressable>
            <TouchableOpacity
              onPress={() => confirmDelete(thread)}
              disabled={remove.isPending}
              accessibilityRole="button"
              accessibilityLabel={t('deleteA11y', { title: thread.title })}
              className="h-11 w-11 items-center justify-center me-2"
            >
              <Ionicons name="trash-outline" size={20} color={colors.stone[500]} />
            </TouchableOpacity>
          </View>
        ))
      )}
    </ScrollView>
  );
}
