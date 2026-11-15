import { Ionicons } from '@expo/vector-icons';
import { useRouter, type Href } from 'expo-router';
import React, { useState } from 'react';
import { RefreshControl, ScrollView, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { CareerReminder } from '../../../../../packages/career-api-client/src/types';
import { CareerHeader, Pill } from '../../../src/components/career/CareerHeader';
import { Button } from '../../../src/components/ui/Button';
import { EmptyState } from '../../../src/components/ui/EmptyState';
import { SkeletonCard } from '../../../src/components/ui/Skeleton';
import { useMarkReminderRead, useReminders } from '../../../src/hooks/career/alerts';
import { useCareerAccess } from '../../../src/hooks/useCareer';
import { useT } from '../../../src/i18n';
import { RTL_FLIP } from '../../../src/i18n/native';
import { reminderLine, reminderRoute } from '../../../src/lib/career/reminders';
import { colors } from '../../../src/theme/colors';

/**
 * Career reminders (website: the alert centre's reminders card): listing
 * deadlines, application follow-ups, interviews and certification expiry,
 * with what already passed kept as history. Follow-up and interview dates
 * from the Job Tracker are synced first. Reminders never use alert items.
 * Device notifications for tracker dates are scheduled by the Job Tracker
 * (src/lib/job-reminders.ts) when notifications are on.
 */
export default function CareerRemindersScreen() {
  const t = useT('careerAlerts.centre');
  const tr = useT('careerAlerts.remindersScreen');
  const tk = useT('career');
  const tc = useT('common');
  const router = useRouter();
  const access = useCareerAccess();
  const reminders = useReminders();
  const markRead = useMarkReminderRead();
  const [historyOpen, setHistoryOpen] = useState(false);

  let content: React.ReactNode;
  if (access.data && !access.data.enabled) {
    content = <EmptyState icon="lock-closed-outline" title={tk('shared.notIncluded')} />;
  } else if (access.isLoading || reminders.isLoading) {
    content = (
      <View className="p-5">
        <SkeletonCard />
        <SkeletonCard />
      </View>
    );
  } else if (reminders.error || !reminders.data) {
    content = (
      <View className="p-5">
        <View className="bg-white border border-stone-100 rounded-2xl p-4">
          <Text className="text-stone-700 text-sm">{t('reminders_error')}</Text>
          <Button variant="outline" size="sm" className="mt-3 self-start" onPress={() => void reminders.refetch()}>
            {tc('retry')}
          </Button>
        </View>
      </View>
    );
  } else {
    const list = reminders.data;
    content = (
      <ScrollView
        contentContainerStyle={{ padding: 20, paddingBottom: 48 }}
        refreshControl={<RefreshControl refreshing={reminders.isRefetching} onRefresh={() => void reminders.refetch()} tintColor={colors.brand[600]} />}
      >
        <Text className="text-stone-500 text-sm leading-5 mb-2">{t('reminders_body')}</Text>
        <Text className="text-stone-400 text-xs leading-4 mb-4">{tr('deviceNote')}</Text>
        {list.unread > 0 ? (
          <View className="mb-3">
            <Pill label={tr('unread', { count: list.unread })} tone="brand" />
          </View>
        ) : null}
        {list.upcoming.length === 0 ? (
          <View className="bg-white border border-stone-100 rounded-2xl p-4 mb-3">
            <Text className="text-stone-500 text-sm">{t('reminders_empty')}</Text>
          </View>
        ) : (
          list.upcoming.map((reminder) => (
            <ReminderRow
              key={reminder.id}
              reminder={reminder}
              onOpen={(route) => router.push(route as Href)}
              onRead={() => markRead.mutate(reminder.id)}
              reading={markRead.isPending && markRead.variables === reminder.id}
            />
          ))
        )}
        {list.history.length > 0 ? (
          <View className="mt-4">
            <TouchableOpacity
              onPress={() => setHistoryOpen((open) => !open)}
              className="flex-row items-center min-h-[44px]"
              accessibilityRole="button"
              accessibilityState={{ expanded: historyOpen }}
            >
              <Ionicons name={historyOpen ? 'chevron-down' : 'chevron-forward'} size={18} color={colors.stone[500]} style={historyOpen ? undefined : RTL_FLIP} />
              <Text className="text-stone-700 font-semibold text-sm ms-1.5">{t('reminders_history', { count: list.history.length })}</Text>
            </TouchableOpacity>
            {historyOpen
              ? list.history.map((reminder) => (
                  <View key={reminder.id} className="py-2 border-b border-stone-100">
                    <Text className="text-stone-600 text-sm">{reminder.title}</Text>
                    <Text className="text-stone-400 text-xs mt-0.5">{reminderLine(reminder)}</Text>
                  </View>
                ))
              : null}
          </View>
        ) : null}
      </ScrollView>
    );
  }

  return (
    <SafeAreaView className="flex-1 bg-stone-50" edges={['top', 'bottom']}>
      <CareerHeader title={t('reminders_title')} />
      {content}
    </SafeAreaView>
  );
}

function ReminderRow({
  reminder,
  onOpen,
  onRead,
  reading,
}: {
  reminder: CareerReminder;
  onOpen: (route: string) => void;
  onRead: () => void;
  reading: boolean;
}) {
  const t = useT('careerAlerts.centre');
  const route = reminderRoute(reminder.link);
  const title = <Text className={`text-sm ${route ? 'text-brand-700 font-semibold' : 'text-stone-900 font-semibold'}`}>{reminder.title}</Text>;
  return (
    <View className="bg-white border border-stone-100 rounded-2xl p-4 mb-3">
      <View className="flex-row items-start">
        <View className="flex-1 me-2">
          {route ? (
            <TouchableOpacity onPress={() => onOpen(route)} className="min-h-[44px] justify-center" accessibilityRole="link">
              {title}
            </TouchableOpacity>
          ) : (
            title
          )}
          <Text className="text-stone-500 text-xs mt-0.5">{reminderLine(reminder)}</Text>
        </View>
        {!reminder.read ? <Pill label={t('unread')} tone="brand" /> : null}
      </View>
      {!reminder.read ? (
        <TouchableOpacity
          onPress={onRead}
          disabled={reading}
          className="min-h-[44px] justify-center self-start"
          accessibilityRole="button"
          accessibilityLabel={`${t('mark_read')}: ${reminder.title}`}
        >
          <Text className="text-brand-600 font-semibold text-sm">{t('mark_read')}</Text>
        </TouchableOpacity>
      ) : null}
    </View>
  );
}
