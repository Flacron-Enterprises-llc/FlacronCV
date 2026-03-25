import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React from 'react';
import { Alert, FlatList, RefreshControl, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { EmptyState } from '../../../src/components/ui/EmptyState';
import { ErrorState } from '../../../src/components/ui/ErrorState';
import { SkeletonCard } from '../../../src/components/ui/Skeleton';
import { useCoverLetterList, useDeleteCoverLetter } from '../../../src/hooks/useCoverLetters';
import { CoverLetter } from '../../../src/types/cover-letter.types';
import { formatDate } from '../../../src/lib/utils';
import { CoverLetterStatus } from '../../../src/types/enums';

export default function CoverLettersScreen() {
  const router = useRouter();
  const { data, isLoading, error, refetch } = useCoverLetterList();
  const deleteCL = useDeleteCoverLetter();

  const coverLetters = data?.data ?? [];

  const handleDelete = (cl: CoverLetter) => {
    Alert.alert('Delete Cover Letter', `Delete "${cl.title}"?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () =>
          deleteCL.mutate(cl.id, {
            onSuccess: () => Alert.alert('Deleted', `"${cl.title}" has been deleted.`),
            onError: () => Alert.alert('Error', 'Failed to delete cover letter. Please try again.'),
          }),
      },
    ]);
  };

  const renderItem = ({ item }: { item: CoverLetter }) => (
    <TouchableOpacity
      onPress={() => router.push(`/(dashboard)/cover-letters/${item.id}`)}
      className="bg-white border border-stone-100 rounded-2xl p-4 mb-3 shadow-sm"
      activeOpacity={0.8}
    >
      <View className="flex-row items-start justify-between">
        <View className="flex-row items-center flex-1">
          <View className="w-12 h-12 rounded-xl bg-blue-50 items-center justify-center mr-3">
            <Ionicons name="mail" size={22} color="#3b82f6" />
          </View>
          <View className="flex-1">
            <Text className="font-bold text-stone-900 text-base" numberOfLines={1}>{item.title}</Text>
            <Text className="text-stone-500 text-xs mt-0.5" numberOfLines={1}>
              {item.companyName} · {item.jobTitle}
            </Text>
            <View className="flex-row items-center mt-1.5 gap-2">
              <View className={['px-2 py-0.5 rounded-full', item.status === CoverLetterStatus.FINAL ? 'bg-green-100' : 'bg-stone-100'].join(' ')}>
                <Text className={['text-xs font-medium', item.status === CoverLetterStatus.FINAL ? 'text-green-700' : 'text-stone-500'].join(' ')}>
                  {item.status}
                </Text>
              </View>
              <Text className="text-xs text-stone-400">Updated {formatDate(item.updatedAt)}</Text>
            </View>
          </View>
        </View>
        <TouchableOpacity
          onPress={() => handleDelete(item)}
          disabled={deleteCL.isPending}
          className="p-2 rounded-xl bg-stone-50 ml-2"
        >
          <Ionicons
            name={deleteCL.isPending ? 'time-outline' : 'trash-outline'}
            size={16}
            color="#ef4444"
          />
        </TouchableOpacity>
      </View>
      {item.aiGenerated && (
        <View className="flex-row items-center mt-2">
          <Ionicons name="sparkles" size={12} color="#8b5cf6" />
          <Text className="text-purple-600 text-xs ml-1">AI Generated</Text>
        </View>
      )}
    </TouchableOpacity>
  );

  if (error) return <ErrorState message="Failed to load cover letters" onRetry={refetch} />;

  return (
    <SafeAreaView className="flex-1 bg-stone-50">
      <View className="px-5 pt-4 pb-4 bg-white border-b border-stone-100">
        <View className="flex-row items-center justify-between">
          <Text className="text-xl font-black text-stone-900">Cover Letters</Text>
          <TouchableOpacity onPress={() => router.push('/(dashboard)/cover-letters/new')} className="flex-row items-center bg-blue-500 px-4 py-2 rounded-xl">
            <Ionicons name="add" size={18} color="#fff" />
            <Text className="text-white font-bold ml-1">New</Text>
          </TouchableOpacity>
        </View>
      </View>

      {isLoading ? (
        <View className="p-5">{[1, 2, 3].map((i) => <SkeletonCard key={i} />)}</View>
      ) : coverLetters.length === 0 ? (
        <EmptyState
          icon="mail-outline"
          title="No cover letters yet"
          description="Create tailored cover letters with AI assistance."
          actionLabel="Create Cover Letter"
          onAction={() => router.push('/(dashboard)/cover-letters/new')}
        />
      ) : (
        <FlatList
          data={coverLetters}
          renderItem={renderItem}
          keyExtractor={(item) => item.id}
          contentContainerStyle={{ padding: 20 }}
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={false} onRefresh={refetch} tintColor="#3b82f6" />}
        />
      )}
    </SafeAreaView>
  );
}
