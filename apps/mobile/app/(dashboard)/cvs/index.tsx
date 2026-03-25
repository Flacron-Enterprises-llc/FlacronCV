import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React, { useState } from 'react';
import {
  Alert,
  FlatList,
  RefreshControl,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { SkeletonCard } from '../../../src/components/ui/Skeleton';
import { EmptyState } from '../../../src/components/ui/EmptyState';
import { ErrorState } from '../../../src/components/ui/ErrorState';
import { useCVList, useDeleteCV, useDuplicateCV } from '../../../src/hooks/useCVs';
import { CV } from '../../../src/types/cv.types';
import { formatDate } from '../../../src/lib/utils';
import { CVStatus } from '../../../src/types/enums';

export default function CVsScreen() {
  const router = useRouter();
  const { data, isLoading, error, refetch } = useCVList();
  const deleteCV = useDeleteCV();
  const duplicateCV = useDuplicateCV();

  const cvs = data?.data ?? [];

  const handleDelete = (cv: CV) => {
    Alert.alert(
      'Delete CV',
      `Are you sure you want to delete "${cv.title}"? This cannot be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () =>
            deleteCV.mutate(cv.id, {
              onSuccess: () => Alert.alert('Deleted', `"${cv.title}" has been deleted.`),
              onError: () => Alert.alert('Error', 'Failed to delete CV. Please try again.'),
            }),
        },
      ],
    );
  };

  const handleDuplicate = (cv: CV) => {
    duplicateCV.mutate(cv.id, {
      onSuccess: () => Alert.alert('Duplicated', `"${cv.title} (Copy)" has been created.`),
      onError: () => Alert.alert('Error', 'Failed to duplicate CV. Please try again.'),
    });
  };

  const renderCV = ({ item }: { item: CV }) => (
    <TouchableOpacity
      onPress={() => router.push(`/(dashboard)/cvs/${item.id}`)}
      className="bg-white border border-stone-100 rounded-2xl p-4 mb-3 shadow-sm"
      activeOpacity={0.8}
    >
      <View className="flex-row items-start justify-between">
        <View className="flex-row items-center flex-1">
          <View className="w-12 h-12 rounded-xl bg-brand-50 items-center justify-center mr-3">
            <Ionicons name="document-text" size={22} color="#f97316" />
          </View>
          <View className="flex-1">
            <Text className="font-bold text-stone-900 text-base" numberOfLines={1}>
              {item.title}
            </Text>
            <Text className="text-stone-500 text-xs mt-0.5">
              {item.personalInfo?.headline ?? 'No headline'}
            </Text>
            <View className="flex-row items-center mt-1.5 gap-2">
              <View className={['px-2 py-0.5 rounded-full', item.status === CVStatus.PUBLISHED ? 'bg-green-100' : 'bg-stone-100'].join(' ')}>
                <Text className={['text-xs font-medium', item.status === CVStatus.PUBLISHED ? 'text-green-700' : 'text-stone-500'].join(' ')}>
                  {item.status}
                </Text>
              </View>
              <Text className="text-xs text-stone-400">
                Updated {formatDate(item.updatedAt)}
              </Text>
            </View>
          </View>
        </View>

        <View className="flex-row gap-1 ml-2">
          <TouchableOpacity
            onPress={() => handleDuplicate(item)}
            disabled={duplicateCV.isPending}
            className="p-2 rounded-xl bg-stone-50"
          >
            <Ionicons
              name={duplicateCV.isPending ? 'time-outline' : 'copy-outline'}
              size={16}
              color="#78716c"
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
              color="#ef4444"
            />
          </TouchableOpacity>
        </View>
      </View>

      {/* Progress bar */}
      <View className="mt-3 h-1 bg-stone-100 rounded-full overflow-hidden">
        <View className="h-full bg-brand-400 rounded-full" style={{ width: '70%' }} />
      </View>
      <Text className="text-xs text-stone-400 mt-1">
        v{item.version} · {item.downloadCount} downloads
      </Text>
    </TouchableOpacity>
  );

  if (error) {
    return <ErrorState message="Failed to load CVs" onRetry={refetch} />;
  }

  return (
    <SafeAreaView className="flex-1 bg-stone-50">
      {/* Header */}
      <View className="px-5 pt-4 pb-4 bg-white border-b border-stone-100">
        <View className="flex-row items-center justify-between">
          <Text className="text-xl font-black text-stone-900">My CVs</Text>
          <TouchableOpacity
            onPress={() => router.push('/(dashboard)/cvs/new')}
            className="flex-row items-center bg-brand-500 px-4 py-2 rounded-xl"
          >
            <Ionicons name="add" size={18} color="#fff" />
            <Text className="text-white font-bold ml-1">New CV</Text>
          </TouchableOpacity>
        </View>
        {data && (
          <Text className="text-stone-400 text-sm mt-1">
            {data.total} {data.total === 1 ? 'CV' : 'CVs'} created
          </Text>
        )}
      </View>

      {isLoading ? (
        <View className="p-5">
          {[1, 2, 3].map((i) => <SkeletonCard key={i} />)}
        </View>
      ) : cvs.length === 0 ? (
        <EmptyState
          icon="document-text-outline"
          title="No CVs yet"
          description="Create your first professional CV and land your dream job."
          actionLabel="Create Your First CV"
          onAction={() => router.push('/(dashboard)/cvs/new')}
        />
      ) : (
        <FlatList
          data={cvs}
          renderItem={renderCV}
          keyExtractor={(item) => item.id}
          contentContainerStyle={{ padding: 20 }}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl refreshing={false} onRefresh={refetch} tintColor="#f97316" />
          }
        />
      )}
    </SafeAreaView>
  );
}
