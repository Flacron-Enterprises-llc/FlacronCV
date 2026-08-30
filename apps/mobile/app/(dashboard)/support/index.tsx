import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import axios from 'axios';
import React from 'react';
import { FlatList, RefreshControl, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { EmptyState } from '../../../src/components/ui/EmptyState';
import { ErrorState } from '../../../src/components/ui/ErrorState';
import { SkeletonCard } from '../../../src/components/ui/Skeleton';
import { useSupportTickets } from '../../../src/hooks/useSupport';
import { SupportTicket } from '../../../src/types/support.types';
import { formatDate } from '../../../src/lib/utils';
import { TicketStatus } from '../../../src/types/enums';
import { colors } from '../../../src/theme/colors';

const STATUS_COLORS: Record<TicketStatus, { bg: string; text: string }> = {
  [TicketStatus.OPEN]: { bg: colors.brand[100], text: colors.brand[700] },
  [TicketStatus.IN_PROGRESS]: { bg: colors.warning.bg, text: colors.warning.DEFAULT },
  [TicketStatus.WAITING_ON_CUSTOMER]: { bg: colors.stone[100], text: colors.stone[700] },
  [TicketStatus.RESOLVED]: { bg: colors.success.bg, text: colors.success.DEFAULT },
  [TicketStatus.CLOSED]: { bg: colors.stone[200], text: colors.stone[500] },
};

function loadFailureMessage(err: unknown): string {
  if (axios.isAxiosError(err) && !err.response) {
    return 'No connection. Check your network and try again.';
  }
  return 'Could not load tickets. Please try again.';
}

export default function SupportScreen() {
  const router = useRouter();
  const { data, isLoading, error, refetch } = useSupportTickets();

  const tickets = data ?? [];

  const renderTicket = ({ item }: { item: SupportTicket }) => {
    const statusColor = STATUS_COLORS[item.status];
    return (
      <TouchableOpacity
        onPress={() => router.push(`/(dashboard)/support/${item.id}`)}
        className="bg-white border border-stone-100 rounded-2xl p-4 mb-3"
        activeOpacity={0.8}
      >
        <View className="flex-row items-start justify-between">
          <View className="flex-1">
            <Text className="font-bold text-stone-900" numberOfLines={1}>{item.title}</Text>
            <Text className="text-stone-500 text-sm mt-0.5 capitalize">{item.category.replace('_', ' ')}</Text>
          </View>
          <View className="px-2 py-0.5 rounded-full ml-2" style={{ backgroundColor: statusColor.bg }}>
            <Text className="text-xs font-medium" style={{ color: statusColor.text }}>
              {item.status.replace('_', ' ')}
            </Text>
          </View>
        </View>
        <Text className="text-stone-400 text-xs mt-2">{formatDate(item.createdAt)}</Text>
      </TouchableOpacity>
    );
  };

  return (
    <SafeAreaView className="flex-1 bg-stone-50" edges={['top', 'bottom']}>
      <View className="px-5 pt-4 pb-4 bg-white border-b border-stone-100">
        <View className="flex-row items-center justify-between">
          <Text className="text-xl font-black text-stone-900">Support</Text>
          <TouchableOpacity onPress={() => router.push('/(dashboard)/support/new')} className="flex-row items-center bg-brand-600 px-4 py-2 rounded-xl">
            <Ionicons name="add" size={18} color={colors.white} />
            <Text className="text-white font-bold ml-1">New Ticket</Text>
          </TouchableOpacity>
        </View>
      </View>

      {error ? (
        <ErrorState message={loadFailureMessage(error)} onRetry={() => void refetch()} />
      ) : isLoading ? (
        <View className="p-5">{[1, 2].map((i) => <SkeletonCard key={i} />)}</View>
      ) : tickets.length === 0 ? (
        <EmptyState
          icon="help-circle-outline"
          title="No support tickets"
          description="Need help? Create a support ticket and we'll get back to you."
          actionLabel="Create Ticket"
          onAction={() => router.push('/(dashboard)/support/new')}
        />
      ) : (
        <FlatList
          data={tickets}
          renderItem={renderTicket}
          keyExtractor={(item) => item.id}
          contentContainerStyle={{ padding: 20 }}
          refreshControl={<RefreshControl refreshing={false} onRefresh={refetch} tintColor={colors.brand[600]} />}
        />
      )}
    </SafeAreaView>
  );
}
