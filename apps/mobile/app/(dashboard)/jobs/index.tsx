import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React, { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  RefreshControl,
  ScrollView,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { shareInterviewIcs } from '../../../src/components/jobs/share-interview-ics';
import { Badge } from '../../../src/components/ui/Badge';
import { EmptyState } from '../../../src/components/ui/EmptyState';
import { ErrorState } from '../../../src/components/ui/ErrorState';
import { Modal } from '../../../src/components/ui/Modal';
import { SkeletonCard } from '../../../src/components/ui/Skeleton';
import { useArchiveJob, useJobList } from '../../../src/hooks/useJobs';
import { useT } from '../../../src/i18n';
import { RTL_FLIP } from '../../../src/i18n/native';
import { requestFailureMessage } from '../../../src/lib/api-errors';
import { promptForError, showUpgradePrompt } from '../../../src/config/paid-upgrades';
import { planForDisplay } from '../../../src/lib/entitlements';
import { useAuthStore } from '../../../src/store/auth-store';
import {
  checklistProgress,
  filterAndSortJobs,
  jobContacts,
  jobOutcomeLabel,
  normalizeStatus,
  jobSortLabel,
  type JobSortKey,
  jobStatusLabel,
  SORT_KEYS,
  STATUS_ORDER,
  statusCounts,
  visibleJobs,
} from '../../../src/lib/job-tracker';
import { formatDate } from '../../../src/lib/utils';
import { colors } from '../../../src/theme/colors';
import { JobStatus } from '../../../src/types/enums';
import { JobApplication } from '../../../src/types/job.types';

const STATUS_BADGE: Record<string, 'default' | 'info' | 'warning' | 'brand' | 'danger' | 'success'> = {
  saved: 'default',
  preparing: 'info',
  applied: 'info',
  interviewing: 'warning',
  offered: 'brand',
  rejected: 'danger',
  withdrawn: 'default',
};

function MetaLine({
  icon,
  text,
  accent,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  text: string;
  accent?: boolean;
}) {
  return (
    <View className="flex-row items-center me-3 mt-1">
      <Ionicons name={icon} size={13} color={accent ? colors.brand[600] : colors.stone[400]} />
      <Text
        className={accent ? 'text-brand-600 text-xs font-medium ms-1' : 'text-stone-500 text-xs ms-1'}
        numberOfLines={1}
      >
        {text}
      </Text>
    </View>
  );
}

export default function JobsScreen() {
  const t = useT('jobs');
  const router = useRouter();
  const { data, isLoading, error, refetch, isRefetching } = useJobList();
  const archiveJob = useArchiveJob();
  const [filter, setFilter] = useState<'all' | JobStatus>('all');
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState<JobSortKey>('updated');
  const [showArchived, setShowArchived] = useState(false);
  const [sortOpen, setSortOpen] = useState(false);

  // Same model as the website: archived rows are a separate view, and counts,
  // search and sort all operate on that visible set.
  const visible = useMemo(() => visibleJobs(data ?? [], showArchived), [data, showArchived]);
  const counts = useMemo(() => statusCounts(visible), [visible]);
  const jobs = useMemo(
    () => filterAndSortJobs(visible, { status: filter, search, sort }),
    [visible, filter, search, sort],
  );
  const sortLabel = jobSortLabel(sort);

  const toggleArchive = (job: JobApplication) => {
    const archived = !job.archived;
    archiveJob.mutate(
      { job, archived },
      {
        onSuccess: () => Alert.alert(archived ? t('archive.archived') : t('archive.restored')),
        onError: (err) => {
          const prompt = promptForError(err, planForDisplay(useAuthStore.getState().user?.subscription));
          if (prompt) {
            showUpgradePrompt(prompt, () => router.push('/(dashboard)/settings/plans'));
            return;
          }
          Alert.alert(t('form.saveErrorTitle'), requestFailureMessage(err, t('form.archiveError')));
        },
      },
    );
  };

  const renderJob = ({ item }: { item: JobApplication }) => {
    const archivePending = archiveJob.isPending && archiveJob.variables?.job.id === item.id;
    const statusLabel = jobStatusLabel(item.status);
    const outcomeLabel = jobOutcomeLabel(item);
    const contact = jobContacts(item)[0];
    const progress = checklistProgress(item);
    const names = { position: item.position, company: item.company };
    return (
      <View className="bg-surface border border-stone-100 rounded-2xl mb-3 overflow-hidden">
        <TouchableOpacity
          onPress={() => router.push(`./${item.id}`)}
          className="p-4 pb-1"
          activeOpacity={0.8}
          accessibilityRole="button"
          accessibilityLabel={t('card.a11yLabel', { ...names, status: statusLabel })}
          accessibilityHint={t('card.a11yHint')}
        >
          <View className="flex-row items-start justify-between">
            <View className="flex-1 me-2">
              <Text className="font-bold text-stone-900" numberOfLines={1}>
                {item.position}
              </Text>
              <Text className="text-stone-500 text-sm mt-0.5" numberOfLines={1}>
                {item.company}
              </Text>
            </View>
            <Badge variant={STATUS_BADGE[normalizeStatus(item.status)] ?? 'default'}>{statusLabel}</Badge>
          </View>
          {outcomeLabel ? <Text className="text-stone-600 text-xs font-medium mt-1">{outcomeLabel}</Text> : null}
          <View className="flex-row flex-wrap mt-1">
            {item.location ? <MetaLine icon="location-outline" text={item.location} /> : null}
            <MetaLine
              icon="time-outline"
              text={
                item.appliedDate
                  ? t('card.applied', { date: formatDate(item.appliedDate) })
                  : t('card.updated', { date: formatDate(item.updatedAt) })
              }
            />
            {item.salaryRange ? <MetaLine icon="cash-outline" text={item.salaryRange} /> : null}
            {contact?.name || contact?.email ? (
              <MetaLine icon="person-outline" text={contact.name || contact.email || ''} />
            ) : null}
            {item.deadline ? (
              <MetaLine icon="flag-outline" text={t('card.deadline', { date: formatDate(item.deadline) })} accent />
            ) : null}
            {progress.total > 0 ? (
              <MetaLine icon="checkbox-outline" text={t('card.checklist', { done: progress.done, total: progress.total })} />
            ) : null}
            {item.interviewDate ? (
              <MetaLine icon="calendar-outline" text={t('card.interview', { date: formatDate(item.interviewDate) })} accent />
            ) : null}
            {item.followUpDate ? (
              <MetaLine icon="notifications-outline" text={t('card.followUp', { date: formatDate(item.followUpDate) })} />
            ) : null}
          </View>
        </TouchableOpacity>
        <View className="flex-row justify-end px-2">
          {item.interviewDate ? (
            <TouchableOpacity
              onPress={() => void shareInterviewIcs(item)}
              className="w-11 h-11 items-center justify-center"
              accessibilityRole="button"
              accessibilityLabel={t('card.addToCalendar', names)}
            >
              <Ionicons name="calendar-outline" size={20} color={colors.stone[500]} />
            </TouchableOpacity>
          ) : null}
          <TouchableOpacity
            onPress={() => toggleArchive(item)}
            disabled={archivePending}
            className="w-11 h-11 items-center justify-center"
            accessibilityRole="button"
            accessibilityLabel={
              item.archived
                ? t('card.restore', names)
                : t('card.archive', names)
            }
            accessibilityState={{ disabled: archivePending, busy: archivePending }}
          >
            {archivePending ? (
              <ActivityIndicator size="small" color={colors.stone[400]} />
            ) : (
              <Ionicons
                name={item.archived ? 'arrow-undo-outline' : 'archive-outline'}
                size={20}
                color={colors.stone[500]}
              />
            )}
          </TouchableOpacity>
        </View>
      </View>
    );
  };

  const refresh = (
    <RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor={colors.brand[600]} />
  );

  return (
    <SafeAreaView className="flex-1 bg-stone-50" edges={['top', 'bottom']}>
      <View className="px-5 pt-4 pb-3 bg-surface border-b border-stone-100">
        <View className="flex-row items-center justify-between mb-3">
          <View className="flex-row items-center flex-1 me-3">
            <TouchableOpacity
              onPress={() => router.back()}
              className="me-3"
              accessibilityRole="button"
              accessibilityLabel={t('goBack')}
            >
              <Ionicons name="arrow-back" size={22} color={colors.stone[700]} style={RTL_FLIP} />
            </TouchableOpacity>
            <Text className="text-xl font-black text-stone-900">{t('list.title')}</Text>
          </View>
          <TouchableOpacity
            onPress={() => router.push('./new')}
            className="flex-row items-center bg-brand-600 px-4 py-2 rounded-xl"
            accessibilityRole="button"
          >
            <Ionicons name="add" size={18} color={colors.white} />
            <Text className="text-white font-bold ms-1">{t('list.logJob')}</Text>
          </TouchableOpacity>
        </View>
        <TextInput
          value={search}
          onChangeText={setSearch}
          placeholder={t('list.searchPlaceholder')}
          placeholderTextColor={colors.stone[400]}
          accessibilityLabel={t('list.searchLabel')}
          className="bg-stone-50 border border-stone-200 rounded-xl px-3 py-2.5 text-base text-stone-900"
        />
        <View className="flex-row mt-3 gap-2">
          <TouchableOpacity
            onPress={() => setSortOpen(true)}
            className="flex-1 flex-row items-center justify-between bg-surface border border-stone-200 rounded-xl px-3 min-h-[44px]"
            accessibilityRole="button"
            accessibilityLabel={t('list.sortByLabel', { label: sortLabel })}
          >
            <View className="flex-row items-center flex-1">
              <Ionicons name="swap-vertical" size={16} color={colors.stone[500]} />
              <Text className="text-stone-700 text-sm ms-1.5" numberOfLines={1}>
                {sortLabel}
              </Text>
            </View>
            <Ionicons name="chevron-down" size={16} color={colors.stone[400]} />
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => {
              setShowArchived((v) => !v);
              setFilter('all');
            }}
            className={[
              'flex-row items-center rounded-xl px-3 min-h-[44px]',
              showArchived ? 'bg-brand-600' : 'bg-stone-100',
            ].join(' ')}
            accessibilityRole="switch"
            accessibilityLabel={t('list.showArchived')}
            accessibilityState={{ checked: showArchived }}
          >
            <Ionicons
              name="archive-outline"
              size={16}
              color={showArchived ? colors.white : colors.stone[700]}
            />
            <Text
              className={
                showArchived ? 'text-white text-sm font-semibold ms-1.5' : 'text-stone-700 text-sm ms-1.5'
              }
            >
              {t('list.archived')}
            </Text>
          </TouchableOpacity>
        </View>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          className="mt-3"
          contentContainerStyle={{ gap: 8 }}
        >
          {(['all', ...STATUS_ORDER] as const).map((value) => {
            const selected = filter === value;
            const count = value === 'all' ? visible.length : (counts[value] ?? 0);
            const label = value === 'all' ? t('list.all') : jobStatusLabel(value);
            return (
              <TouchableOpacity
                key={value}
                onPress={() => setFilter(value)}
                className={[
                  'flex-row items-center px-3 py-1.5 rounded-full border',
                  selected ? 'bg-brand-600 border-brand-600' : 'bg-surface border-stone-200',
                ].join(' ')}
                accessibilityRole="button"
                accessibilityLabel={`${label}, ${count}`}
                accessibilityState={{ selected }}
              >
                <Text className={selected ? 'text-white text-sm font-semibold' : 'text-stone-700 text-sm'}>
                  {label}
                </Text>
                <Text
                  className={
                    selected
                      ? 'text-white text-xs font-semibold ms-1.5'
                      : 'text-stone-400 text-xs font-semibold ms-1.5'
                  }
                >
                  {count}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </View>

      {error ? (
        <ErrorState
          message={requestFailureMessage(error, t('list.loadError'))}
          onRetry={() => void refetch()}
        />
      ) : isLoading ? (
        <View className="p-5">{[1, 2, 3].map((i) => <SkeletonCard key={i} />)}</View>
      ) : visible.length === 0 ? (
        <ScrollView contentContainerStyle={{ flexGrow: 1 }} refreshControl={refresh}>
          {showArchived ? (
            <EmptyState
              icon="archive-outline"
              title={t('list.emptyArchivedTitle')}
              description={t('list.emptyArchivedDesc')}
            />
          ) : (
            <EmptyState
              icon="briefcase-outline"
              title={t('list.emptyTitle')}
              description={t('list.emptyDesc')}
              actionLabel={t('list.emptyAction')}
              onAction={() => router.push('./new')}
            />
          )}
        </ScrollView>
      ) : jobs.length === 0 ? (
        <ScrollView contentContainerStyle={{ flexGrow: 1 }} refreshControl={refresh}>
          <EmptyState icon="search-outline" title={t('list.noMatchesTitle')} description={t('list.noMatchesDesc')} />
        </ScrollView>
      ) : (
        <FlatList
          data={jobs}
          renderItem={renderJob}
          keyExtractor={(item) => item.id}
          contentContainerStyle={{ padding: 20 }}
          refreshControl={refresh}
        />
      )}

      <Modal visible={sortOpen} onClose={() => setSortOpen(false)} title={t('list.sortTitle')} size="md">
        {SORT_KEYS.map((key) => {
          const selected = key === sort;
          return (
            <TouchableOpacity
              key={key}
              onPress={() => {
                setSort(key);
                setSortOpen(false);
              }}
              className="flex-row items-center justify-between py-3 border-b border-stone-100 min-h-[44px]"
              accessibilityRole="radio"
              accessibilityState={{ checked: selected }}
            >
              <Text className={selected ? 'text-brand-600 font-semibold' : 'text-stone-900'}>
                {jobSortLabel(key)}
              </Text>
              {selected ? <Ionicons name="checkmark" size={18} color={colors.brand[600]} /> : null}
            </TouchableOpacity>
          );
        })}
      </Modal>
    </SafeAreaView>
  );
}
