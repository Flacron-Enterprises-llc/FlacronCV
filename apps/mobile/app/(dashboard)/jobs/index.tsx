import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React, { useMemo, useState } from 'react';
import {
  FlatList,
  RefreshControl,
  ScrollView,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Badge } from '../../../src/components/ui/Badge';
import { EmptyState } from '../../../src/components/ui/EmptyState';
import { ErrorState } from '../../../src/components/ui/ErrorState';
import { SkeletonCard } from '../../../src/components/ui/Skeleton';
import { useJobList } from '../../../src/hooks/useJobs';
import { requestFailureMessage } from '../../../src/lib/api-errors';
import { formatDate } from '../../../src/lib/utils';
import { colors } from '../../../src/theme/colors';
import { JobStatus } from '../../../src/types/enums';
import { JobApplication } from '../../../src/types/job.types';

const STATUS_FILTERS: { value: 'all' | JobStatus; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: JobStatus.WISHLIST, label: 'Wishlist' },
  { value: JobStatus.APPLIED, label: 'Applied' },
  { value: JobStatus.INTERVIEWING, label: 'Interviewing' },
  { value: JobStatus.OFFER, label: 'Offer' },
  { value: JobStatus.REJECTED, label: 'Rejected' },
  { value: JobStatus.ACCEPTED, label: 'Accepted' },
];

const STATUS_BADGE: Record<JobStatus, 'default' | 'info' | 'warning' | 'brand' | 'danger' | 'success'> = {
  [JobStatus.WISHLIST]: 'default',
  [JobStatus.APPLIED]: 'info',
  [JobStatus.INTERVIEWING]: 'warning',
  [JobStatus.OFFER]: 'brand',
  [JobStatus.REJECTED]: 'danger',
  [JobStatus.ACCEPTED]: 'success',
};

const STATUS_LABEL: Record<JobStatus, string> = {
  [JobStatus.WISHLIST]: 'Wishlist',
  [JobStatus.APPLIED]: 'Applied',
  [JobStatus.INTERVIEWING]: 'Interviewing',
  [JobStatus.OFFER]: 'Offer',
  [JobStatus.REJECTED]: 'Rejected',
  [JobStatus.ACCEPTED]: 'Accepted',
};

export default function JobsScreen() {
  const router = useRouter();
  const { data, isLoading, error, refetch, isRefetching } = useJobList();
  const [filter, setFilter] = useState<'all' | JobStatus>('all');
  const [search, setSearch] = useState('');

  const jobs = useMemo(() => {
    const visible = (data ?? []).filter((j) => !j.archived);
    const q = search.trim().toLowerCase();
    return visible
      .filter((j) => filter === 'all' || j.status === filter)
      .filter(
        (j) =>
          !q ||
          j.company.toLowerCase().includes(q) ||
          j.position.toLowerCase().includes(q),
      );
  }, [data, filter, search]);

  const renderJob = ({ item }: { item: JobApplication }) => (
    <TouchableOpacity
      onPress={() => router.push(`./${item.id}`)}
      className="bg-white border border-stone-100 rounded-2xl p-4 mb-3"
      activeOpacity={0.8}
    >
      <View className="flex-row items-start justify-between">
        <View className="flex-1 mr-2">
          <Text className="font-bold text-stone-900" numberOfLines={1}>
            {item.position}
          </Text>
          <Text className="text-stone-500 text-sm mt-0.5" numberOfLines={1}>
            {item.company}
          </Text>
        </View>
        <Badge variant={STATUS_BADGE[item.status] ?? 'default'}>
          {STATUS_LABEL[item.status] ?? item.status}
        </Badge>
      </View>
      <Text className="text-stone-400 text-xs mt-2">
        {item.appliedDate
          ? `Applied ${formatDate(item.appliedDate)}`
          : `Updated ${formatDate(item.updatedAt)}`}
      </Text>
    </TouchableOpacity>
  );

  return (
    <SafeAreaView className="flex-1 bg-stone-50" edges={['top', 'bottom']}>
      <View className="px-5 pt-4 pb-3 bg-white border-b border-stone-100">
        <View className="flex-row items-center justify-between mb-3">
          <View className="flex-row items-center flex-1 mr-3">
            <TouchableOpacity
              onPress={() => router.back()}
              className="mr-3"
              accessibilityLabel="Go back"
            >
              <Ionicons name="arrow-back" size={22} color={colors.stone[700]} />
            </TouchableOpacity>
            <Text className="text-xl font-black text-stone-900">Job Tracker</Text>
          </View>
          <TouchableOpacity
            onPress={() => router.push('./new')}
            className="flex-row items-center bg-brand-600 px-4 py-2 rounded-xl"
          >
            <Ionicons name="add" size={18} color={colors.white} />
            <Text className="text-white font-bold ml-1">Log job</Text>
          </TouchableOpacity>
        </View>
        <TextInput
          value={search}
          onChangeText={setSearch}
          placeholder="Search company or title"
          placeholderTextColor={colors.stone[400]}
          className="bg-stone-50 border border-stone-200 rounded-xl px-3 py-2.5 text-base text-stone-900"
        />
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          className="mt-3"
          contentContainerStyle={{ gap: 8 }}
        >
          {STATUS_FILTERS.map((opt) => {
            const selected = filter === opt.value;
            return (
              <TouchableOpacity
                key={opt.value}
                onPress={() => setFilter(opt.value)}
                className={[
                  'px-3 py-1.5 rounded-full border',
                  selected ? 'bg-brand-600 border-brand-600' : 'bg-white border-stone-200',
                ].join(' ')}
              >
                <Text className={selected ? 'text-white text-sm font-semibold' : 'text-stone-700 text-sm'}>
                  {opt.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </View>

      {error ? (
        <ErrorState
          message={requestFailureMessage(error, 'Could not load jobs. Please try again.')}
          onRetry={() => void refetch()}
        />
      ) : isLoading ? (
        <View className="p-5">{[1, 2, 3].map((i) => <SkeletonCard key={i} />)}</View>
      ) : (data ?? []).filter((j) => !j.archived).length === 0 ? (
        <ScrollView
          contentContainerStyle={{ flexGrow: 1 }}
          refreshControl={
            <RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor={colors.brand[600]} />
          }
        >
          <EmptyState
            icon="briefcase-outline"
            title="No applications yet"
            description="Log a job after you apply — title, company, and status is enough."
            actionLabel="Log a job"
            onAction={() => router.push('./new')}
          />
        </ScrollView>
      ) : jobs.length === 0 ? (
        <ScrollView
          contentContainerStyle={{ flexGrow: 1 }}
          refreshControl={
            <RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor={colors.brand[600]} />
          }
        >
          <EmptyState
            icon="search-outline"
            title="No matches"
            description="Try a different status or search."
          />
        </ScrollView>
      ) : (
        <FlatList
          data={jobs}
          renderItem={renderJob}
          keyExtractor={(item) => item.id}
          contentContainerStyle={{ padding: 20 }}
          refreshControl={
            <RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor={colors.brand[600]} />
          }
        />
      )}
    </SafeAreaView>
  );
}
