import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import axios from 'axios';
import React, { useState } from 'react';
import { ActivityIndicator, Alert, FlatList, KeyboardAvoidingView, Platform, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useSupportTicket, useAddTicketMessage, useCloseTicket } from '../../../src/hooks/useSupport';
import { TICKET_STATUS_LABEL, TicketMessage } from '../../../src/types/support.types';
import { TicketStatus } from '../../../src/types/enums';
import { requestFailureMessage as apiFailureMessage } from '../../../src/lib/api-errors';
import { useAuthStore } from '../../../src/store/auth-store';
import { formatDate } from '../../../src/lib/utils';
import { ErrorState } from '../../../src/components/ui/ErrorState';
import { colors } from '../../../src/theme/colors';

function requestFailureMessage(err: unknown): string {
  if (axios.isAxiosError(err) && !err.response) {
    return 'No connection. Check your network and try again.';
  }
  return 'Could not send. Please try again.';
}

function loadFailureMessage(err: unknown): string {
  if (axios.isAxiosError(err) && !err.response) {
    return 'No connection. Check your network and try again.';
  }
  return 'Could not load this ticket. Please try again.';
}

export default function TicketDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { firebaseUser } = useAuthStore();
  const { data: ticket, isLoading, isError, error, refetch } = useSupportTicket(id);
  const addMessage = useAddTicketMessage(id!);
  const closeTicket = useCloseTicket(id!);
  const [messageText, setMessageText] = useState('');

  const messages = ticket?.messages ?? [];

  const handleSend = async () => {
    if (!messageText.trim()) return;
    const text = messageText.trim();
    try {
      await addMessage.mutateAsync(text);
      setMessageText('');
    } catch (err) {
      Alert.alert('Could not send', requestFailureMessage(err));
    }
  };

  const handleClose = () => {
    Alert.alert(
      'Close ticket',
      'Close this ticket? You will not be able to reply to it. Create a new ticket if you need further help.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Close ticket',
          style: 'destructive',
          onPress: () =>
            closeTicket.mutate(undefined, {
              onSuccess: () => Alert.alert('Ticket closed'),
              onError: (err) =>
                Alert.alert('Could not close', apiFailureMessage(err, 'Failed to close ticket')),
            }),
        },
      ],
    );
  };

  const renderMessage = ({ item }: { item: TicketMessage }) => {
    const isMe = item.authorId === firebaseUser?.uid;
    return (
      <View className={['mb-3', isMe ? 'items-end' : 'items-start'].join(' ')}>
        <View
          className={['max-w-[83%] px-4 py-3 rounded-2xl', isMe ? 'bg-brand-600 rounded-tr-sm' : 'bg-stone-100 rounded-tl-sm'].join(' ')}
          style={{ maxWidth: '83%' }}
        >
          {!isMe && (
            <Text className="text-xs font-bold text-stone-500 mb-1">{item.authorName}</Text>
          )}
          <Text className={isMe ? 'text-white' : 'text-stone-900'}>{item.content}</Text>
        </View>
        <Text className="text-xs text-stone-400 mt-1 mx-1">{formatDate(item.createdAt)}</Text>
      </View>
    );
  };

  if (isLoading) {
    return (
      <SafeAreaView className="flex-1 bg-white items-center justify-center" edges={['top', 'bottom']}>
        <ActivityIndicator size="large" color={colors.brand[600]} />
      </SafeAreaView>
    );
  }

  if (isError || !ticket) {
    return (
      <SafeAreaView className="flex-1 bg-white" edges={['top', 'bottom']}>
        <View className="flex-row items-center px-4 py-3 border-b border-stone-100">
          <TouchableOpacity
            onPress={() => router.back()}
            className="mr-3"
            accessibilityRole="button"
            accessibilityLabel="Go back"
          >
            <Ionicons name="arrow-back" size={22} color={colors.stone[700]} />
          </TouchableOpacity>
          <Text className="font-bold text-stone-900">Support</Text>
        </View>
        <ErrorState
          message={loadFailureMessage(error)}
          onRetry={() => void refetch()}
        />
      </SafeAreaView>
    );
  }

  const isClosed = ticket.status === TicketStatus.CLOSED;

  return (
    <SafeAreaView className="flex-1 bg-white" edges={['top', 'bottom']}>
      <View className="flex-row items-center px-4 py-3 border-b border-stone-100">
        <TouchableOpacity
          onPress={() => router.back()}
          className="mr-3"
          accessibilityRole="button"
          accessibilityLabel="Go back"
        >
          <Ionicons name="arrow-back" size={22} color={colors.stone[700]} />
        </TouchableOpacity>
        <View className="flex-1">
          <Text className="font-bold text-stone-900" numberOfLines={1}>{ticket.subject}</Text>
          <Text className="text-stone-400 text-xs">
            {TICKET_STATUS_LABEL[ticket.status] ?? ticket.status?.replace(/_/g, ' ')}
          </Text>
        </View>
        {!isClosed ? (
          <TouchableOpacity
            onPress={handleClose}
            disabled={closeTicket.isPending}
            className="ml-2 flex-row items-center px-3 min-h-[44px] rounded-xl"
            accessibilityRole="button"
            accessibilityLabel="Close ticket"
            accessibilityState={{ disabled: closeTicket.isPending, busy: closeTicket.isPending }}
          >
            {closeTicket.isPending ? (
              <ActivityIndicator size="small" color={colors.error.DEFAULT} />
            ) : (
              <Ionicons name="close-circle-outline" size={18} color={colors.error.DEFAULT} />
            )}
            <Text className="text-red-600 font-semibold text-sm ml-1">Close</Text>
          </TouchableOpacity>
        ) : null}
      </View>

      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} className="flex-1">
        <FlatList
          data={messages}
          renderItem={renderMessage}
          keyExtractor={(item) => item.id}
          contentContainerStyle={{ padding: 16, flexGrow: 1 }}
          showsVerticalScrollIndicator={false}
          inverted={false}
          ListHeaderComponent={
            <View className="bg-stone-50 rounded-xl p-3 mb-4">
              <Text className="text-sm text-stone-600 capitalize">
                {ticket.category.replace('_', ' ')}
              </Text>
              <Text className="text-xs text-stone-400 mt-2">{formatDate(ticket.createdAt)}</Text>
            </View>
          }
        />

        {isClosed ? (
          <View className="px-4 py-4 border-t border-stone-100 bg-stone-50">
            <Text className="text-sm font-medium text-stone-500 text-center">
              This ticket is closed. Create a new ticket if you need further help.
            </Text>
          </View>
        ) : (
          <View className="flex-row items-end px-4 py-3 border-t border-stone-100 gap-2">
            <View className="flex-1 border border-stone-200 rounded-2xl px-4 py-3 max-h-28">
              <TextInput
                value={messageText}
                onChangeText={setMessageText}
                placeholder="Type your message..."
                placeholderTextColor={colors.stone[400]}
                multiline
                className="text-stone-900 text-base"
              />
            </View>
            <TouchableOpacity
              onPress={() => void handleSend()}
              disabled={!messageText.trim() || addMessage.isPending}
              accessibilityRole="button"
              accessibilityLabel="Send reply"
              accessibilityState={{ disabled: !messageText.trim() || addMessage.isPending }}
              className={['w-11 h-11 rounded-full items-center justify-center', messageText.trim() ? 'bg-brand-600' : 'bg-stone-200'].join(' ')}
            >
              {addMessage.isPending ? (
                <ActivityIndicator size="small" color={colors.white} />
              ) : (
                <Ionicons name="send" size={18} color={messageText.trim() ? colors.white : colors.stone[400]} />
              )}
            </TouchableOpacity>
          </View>
        )}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
