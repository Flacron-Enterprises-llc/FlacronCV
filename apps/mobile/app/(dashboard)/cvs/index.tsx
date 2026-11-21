import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React from 'react';
import {
  Alert,
  FlatList,
  RefreshControl,
  ScrollView,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { SkeletonCard } from '../../../src/components/ui/Skeleton';
import { EmptyState } from '../../../src/components/ui/EmptyState';
import { ErrorState } from '../../../src/components/ui/ErrorState';
import { useCVList, useDeleteCV, useDuplicateCV } from '../../../src/hooks/useCVs';
import { useCurrentUser } from '../../../src/hooks/useUser';
import { CV } from '../../../src/types/cv.types';
import { toDate } from '../../../src/lib/utils';
import { formatDate, hasKey, useT } from '../../../src/i18n';
import { canCreateCV, planForDisplay } from '../../../src/lib/entitlements';
import { isLimitRejection, requestFailureMessage } from '../../../src/lib/api-errors';
import { alertIfUnverifiedEmail } from '../../../src/lib/email-verification';
import {
  cvLimitReachedMessage,
  upgradeAlertButtons,
} from '../../../src/config/paid-upgrades';
import { colors } from '../../../src/theme/colors';
import { CVStatus } from '../../../src/types/enums';

export default function CVsScreen() {
  const router = useRouter();
  const { data, isLoading, error, refetch, isRefetching } = useCVList();
  const { data: user } = useCurrentUser();
  const deleteCV = useDeleteCV();
  const duplicateCV = useDuplicateCV();
  const t = useT('cvs');
  const tc = useT('common');

  const cvs = data?.items ?? [];
  const cvsCreated = user?.usage?.cvsCreated;

  const handleDelete = (cv: CV) => {
    Alert.alert(
      t('delete.title'),
      t('delete.body', { title: cv.title }),
      [
        { text: tc('cancel'), style: 'cancel' },
        {
          text: tc('delete'),
          style: 'destructive',
          onPress: () =>
            deleteCV.mutate(cv.id, {
              onSuccess: () => Alert.alert(t('delete.done'), t('delete.doneBody', { title: cv.title })),
              onError: (err) =>
                Alert.alert(
                  t('delete.failedTitle'),
                  requestFailureMessage(err, t('delete.failed')),
                ),
            }),
        },
      ],
    );
  };

  const handleDuplicate = (cv: CV) => {
    const created = user?.usage?.cvsCreated;
    if (typeof created === 'number' && !canCreateCV(user?.subscription, created)) {
      Alert.alert(
        t('limitTitle'),
        cvLimitReachedMessage(planForDisplay(user?.subscription)),
        upgradeAlertButtons(() => router.push('/(dashboard)/settings/plans')),
      );
      return;
    }

    duplicateCV.mutate(cv.id, {
      onSuccess: () => Alert.alert(t('duplicate.done'), t('duplicate.doneBody', { title: cv.title })),
      onError: (err) => {
        if (alertIfUnverifiedEmail(err)) return;
        if (isLimitRejection(err)) {
          Alert.alert(
            t('limitTitle'),
            cvLimitReachedMessage(planForDisplay(user?.subscription)),
            upgradeAlertButtons(() => router.push('/(dashboard)/settings/plans')),
          );
          return;
        }
        Alert.alert(
          t('duplicate.failedTitle'),
          requestFailureMessage(err, t('duplicate.failed')),
        );
      },
    });
  };

  const renderCV = ({ item }: { item: CV }) => (
    <TouchableOpacity
      onPress={() => router.push(`/(dashboard)/cvs/${item.id}`)}
      className="bg-surface border border-stone-100 rounded-2xl p-4 mb-3 shadow-sm"
      activeOpacity={0.8}
    >
      <View className="flex-row items-start justify-between">
        <View className="flex-row items-center flex-1">
          <View className="w-12 h-12 rounded-xl bg-brand-50 items-center justify-center me-3">
            <Ionicons name="document-text" size={22} color={colors.brand[600]} />
          </View>
          <View className="flex-1">
            <Text className="font-bold text-stone-900 text-base" numberOfLines={1}>
              {item.title}
            </Text>
            <Text className="text-stone-500 text-xs mt-0.5">
              {item.personalInfo?.headline ?? t('list.noHeadline')}
            </Text>
            <View className="flex-row items-center mt-1.5 gap-2">
              <View className={['px-2 py-0.5 rounded-full', item.status === CVStatus.PUBLISHED ? 'bg-success-bg' : 'bg-stone-100'].join(' ')}>
                <Text className={['text-xs font-medium', item.status === CVStatus.PUBLISHED ? 'text-success' : 'text-stone-500'].join(' ')}>
                  {hasKey(`cvs.list.status.${item.status}`) ? t(`list.status.${item.status}`) : item.status}
                </Text>
              </View>
              <Text className="text-xs text-stone-400">
                {t('list.updated', { date: formatDate(toDate(item.updatedAt)) })}
              </Text>
            </View>
          </View>
        </View>

        <View className="flex-row gap-1 ms-2">
          <TouchableOpacity
            onPress={() => handleDuplicate(item)}
            disabled={duplicateCV.isPending}
            className="p-2 rounded-xl bg-stone-50"
          >
            <Ionicons
              name={duplicateCV.isPending ? 'time-outline' : 'copy-outline'}
              size={16}
              color={colors.stone[500]}
            />
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => handleDelete(item)}
            disabled={deleteCV.isPending}
            className="p-2 rounded-xl bg-stone-50"
          >
            <Ionicons
              name={deleteCV.isPending ? 'time-outline' : 'trash-outline'}
              size={16}
              color={colors.error.DEFAULT}
            />
          </TouchableOpacity>
        </View>
      </View>

      <Text className="text-xs text-stone-400 mt-3">
        {t('list.meta', { version: item.version, count: item.downloadCount })}
      </Text>
    </TouchableOpacity>
  );

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
      {/* Header */}
      <View className="px-5 pt-4 pb-4 bg-surface border-b border-stone-100">
        <View className="flex-row items-center justify-between">
          <Text className="text-2xl font-black text-ink" accessibilityRole="header">{t('list.title')}</Text>
          <TouchableOpacity
            onPress={() => router.push('/(dashboard)/cvs/new')}
            className="flex-row items-center bg-brand-600 px-4 min-h-[42px] rounded-full"
          >
            <Ionicons name="add" size={18} color={colors.white} />
            <Text className="text-white font-bold ms-1">{t('list.newCv')}</Text>
          </TouchableOpacity>
        </View>
        {typeof cvsCreated === 'number' && (
          <Text className="text-stone-400 text-sm mt-1">
            {t('list.createdCount', { count: cvsCreated })}
          </Text>
        )}
      </View>

      {isLoading ? (
        <View className="p-5">
          {[1, 2, 3].map((i) => <SkeletonCard key={i} />)}
        </View>
      ) : cvs.length === 0 ? (
        <ScrollView
          contentContainerStyle={{ flexGrow: 1 }}
          refreshControl={
            <RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor={colors.brand[600]} />
          }
        >
          <EmptyState
            icon="document-text-outline"
            title={t('list.emptyTitle')}
            description={t('list.emptyDescription')}
            actionLabel={t('list.emptyAction')}
            onAction={() => router.push('/(dashboard)/cvs/new')}
          />
        </ScrollView>
      ) : (
        <FlatList
          data={cvs}
          renderItem={renderCV}
          keyExtractor={(item) => item.id}
          contentContainerStyle={{ padding: 20 }}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor={colors.brand[600]} />
          }
        />
      )}
    </SafeAreaView>
  );
}
