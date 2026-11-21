import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React from 'react';
import { ActivityIndicator, Alert, FlatList, RefreshControl, ScrollView, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { EmptyState } from '../../../src/components/ui/EmptyState';
import { ErrorState } from '../../../src/components/ui/ErrorState';
import { SkeletonCard } from '../../../src/components/ui/Skeleton';
import {
  useCoverLetterList,
  useDeleteCoverLetter,
  useDuplicateCoverLetter,
} from '../../../src/hooks/useCoverLetters';
import { useAuthStore } from '../../../src/store/auth-store';
import { canCreateCoverLetter, planForDisplay } from '../../../src/lib/entitlements';
import { alertIfUnverifiedEmail } from '../../../src/lib/email-verification';
import {
  coverLetterLimitReachedMessage,
  upgradeAlertButtons,
} from '../../../src/config/paid-upgrades';
import { CoverLetter } from '../../../src/types/cover-letter.types';
import { toDate } from '../../../src/lib/utils';
import { formatDate, useT } from '../../../src/i18n';
import { isLimitRejection, isNetworkFailure, requestFailureMessage } from '../../../src/lib/api-errors';
import { colors } from '../../../src/theme/colors';
import { CoverLetterStatus } from '../../../src/types/enums';

export default function CoverLettersScreen() {
  const t = useT('coverLetters');
  const tc = useT('common');
  const router = useRouter();
  const { data, isLoading, error, refetch, isRefetching } = useCoverLetterList();
  const deleteCL = useDeleteCoverLetter();
  const duplicateCL = useDuplicateCoverLetter();
  const { user } = useAuthStore();

  const coverLetters = data?.items ?? [];

  const handleDelete = (cl: CoverLetter) => {
    Alert.alert(
      t('list.deleteTitle'),
      t('list.deleteBody', { title: cl.title }),
      [
        { text: tc('cancel'), style: 'cancel' },
        {
          text: tc('delete'),
          style: 'destructive',
          onPress: () =>
            deleteCL.mutate(cl.id, {
              onSuccess: () => Alert.alert(t('list.deletedTitle'), t('list.deletedBody', { title: cl.title })),
              onError: (err) =>
                Alert.alert(
                  t('list.deleteErrorTitle'),
                  requestFailureMessage(err, t('list.deleteError')),
                ),
            }),
        },
      ],
    );
  };

  const alertLimitReached = () => {
    Alert.alert(
      t('limitReachedTitle'),
      coverLetterLimitReachedMessage(planForDisplay(user?.subscription)),
      upgradeAlertButtons(() => router.push('/(dashboard)/settings/plans')),
    );
  };

  /** Web list "Duplicate": the copy counts as a cover letter creation. */
  const handleDuplicate = (cl: CoverLetter) => {
    if (duplicateCL.isPending) return;
    if (user?.usage && !canCreateCoverLetter(user.subscription, user.usage.coverLettersCreated)) {
      alertLimitReached();
      return;
    }
    duplicateCL.mutate(cl.id, {
      onSuccess: (copy) =>
        Alert.alert(
          t('list.duplicatedTitle'),
          copy?.title ? t('list.duplicatedAs', { title: copy.title }) : t('list.duplicated'),
        ),
      onError: (err) => {
        if (alertIfUnverifiedEmail(err)) return;
        if (isLimitRejection(err)) {
          alertLimitReached();
          return;
        }
        Alert.alert(
          t('list.duplicateErrorTitle'),
          isNetworkFailure(err)
            ? requestFailureMessage(err, '')
            : t('list.duplicateError'),
        );
      },
    });
  };

  const renderItem = ({ item }: { item: CoverLetter }) => {
    const duplicating = duplicateCL.isPending && duplicateCL.variables === item.id;
    const subtitle = [item.companyName, item.jobTitle].filter(Boolean).join(' · ');
    return (
      <TouchableOpacity
        onPress={() => router.push(`/(dashboard)/cover-letters/${item.id}`)}
        className="bg-surface border border-stone-100 rounded-2xl p-4 mb-3 shadow-sm"
        activeOpacity={0.8}
      >
        <View className="flex-row items-start justify-between">
          <View className="flex-row items-center flex-1">
            <View className="w-12 h-12 rounded-xl bg-brand-50 items-center justify-center me-3">
              <Ionicons name="mail" size={22} color={colors.brand[600]} />
            </View>
            <View className="flex-1">
              <Text className="font-bold text-stone-900 text-base" numberOfLines={1}>{item.title}</Text>
              {subtitle ? (
                <Text className="text-stone-500 text-xs mt-0.5" numberOfLines={1}>
                  {subtitle}
                </Text>
              ) : null}
              <View className="flex-row items-center mt-1.5 gap-2">
                <View className={['px-2 py-0.5 rounded-full', item.status === CoverLetterStatus.FINAL ? 'bg-success-bg' : 'bg-stone-100'].join(' ')}>
                  <Text className={['text-xs font-medium', item.status === CoverLetterStatus.FINAL ? 'text-success' : 'text-stone-500'].join(' ')}>
                    {item.status === CoverLetterStatus.FINAL ? t('status.final') : t('status.draft')}
                  </Text>
                </View>
                <Text className="text-xs text-stone-400">{t('list.updated', { date: formatDate(toDate(item.updatedAt)) })}</Text>
              </View>
            </View>
          </View>
          <TouchableOpacity
            onPress={() => handleDuplicate(item)}
            disabled={duplicateCL.isPending}
            accessibilityRole="button"
            accessibilityLabel={t('list.duplicateA11y', { title: item.title })}
            accessibilityState={{ disabled: duplicateCL.isPending, busy: duplicating }}
            className="w-11 h-11 items-center justify-center rounded-xl bg-stone-50 ms-2"
          >
            {duplicating ? (
              <ActivityIndicator size="small" color={colors.brand[600]} />
            ) : (
              <Ionicons name="copy-outline" size={16} color={colors.stone[700]} />
            )}
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => handleDelete(item)}
            disabled={deleteCL.isPending}
            accessibilityRole="button"
            accessibilityLabel={t('list.deleteA11y', { title: item.title })}
            className="w-11 h-11 items-center justify-center rounded-xl bg-stone-50 ms-2"
          >
            <Ionicons
              name={deleteCL.isPending ? 'time-outline' : 'trash-outline'}
              size={16}
              color={colors.error.DEFAULT}
            />
          </TouchableOpacity>
        </View>
        {item.aiGenerated && (
          <View className="flex-row items-center mt-2">
            <Ionicons name="sparkles" size={12} color={colors.brand[600]} />
            <Text className="text-brand-600 text-xs ms-1">{t('list.generated')}</Text>
          </View>
        )}
      </TouchableOpacity>
    );
  };

  if (error) {
    return (
      <ErrorState
        message={requestFailureMessage(error, t('list.loadError'))}
        onRetry={refetch}
      />
    );
  }

  return (
    <SafeAreaView className="flex-1 bg-stone-50" edges={['top']}>
      <View className="px-5 pt-4 pb-4 bg-surface border-b border-stone-100">
        <View className="flex-row items-center justify-between">
          <Text className="text-2xl font-black text-ink" accessibilityRole="header">{t('list.title')}</Text>
          <TouchableOpacity onPress={() => router.push('/(dashboard)/cover-letters/new')} className="flex-row items-center bg-brand-600 px-4 min-h-[42px] rounded-full">
            <Ionicons name="add" size={18} color={colors.white} />
            <Text className="text-white font-bold ms-1">{t('list.new')}</Text>
          </TouchableOpacity>
        </View>
      </View>

      {isLoading ? (
        <View className="p-5">{[1, 2, 3].map((i) => <SkeletonCard key={i} />)}</View>
      ) : coverLetters.length === 0 ? (
        <ScrollView
          contentContainerStyle={{ flexGrow: 1 }}
          refreshControl={
            <RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor={colors.brand[600]} />
          }
        >
          <EmptyState
            icon="mail-outline"
            title={t('list.emptyTitle')}
            description={t('list.emptyDescription')}
            actionLabel={t('list.emptyAction')}
            onAction={() => router.push('/(dashboard)/cover-letters/new')}
          />
        </ScrollView>
      ) : (
        <FlatList
          data={coverLetters}
          renderItem={renderItem}
          keyExtractor={(item) => item.id}
          contentContainerStyle={{ padding: 20 }}
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor={colors.brand[600]} />}
        />
      )}
    </SafeAreaView>
  );
}
