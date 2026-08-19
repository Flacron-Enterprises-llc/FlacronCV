import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useState } from 'react';
import { ActivityIndicator, FlatList, KeyboardAvoidingView, Platform, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useSupportTicket, useAddTicketMessage } from '../../../src/hooks/useSupport';
import { TicketMessage } from '../../../src/types/support.types';
import { useAuthStore } from '../../../src/store/auth-store';
import { formatDate } from '../../../src/lib/utils';

export default function TicketDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { firebaseUser } = useAuthStore();
  const { data: ticket, isLoading } = useSupportTicket(id);
  const addMessage = useAddTicketMessage(id!);
  const [messageText, setMessageText] = useState('');

  const messages = ticket?.messages ?? [];

  const handleSend = async () => {
    if (!messageText.trim()) return;
    const text = messageText.trim();
    setMessageText('');
    await addMessage.mutateAsync(text);
  };

  const renderMessage = ({ item }: { item: TicketMessage }) => {
    const isMe = item.authorId === firebaseUser?.uid;
    return (
      <View className={['mb-3', isMe ? 'items-end' : 'items-start'].join(' ')}>
        <View className={['max-w-5/6 px-4 py-3 rounded-2xl', isMe ? 'bg-brand-500 rounded-tr-sm' : 'bg-stone-100 rounded-tl-sm'].join(' ')}>
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
      <SafeAreaView className="flex-1 bg-white items-center justify-center">
        <ActivityIndicator size="large" color="#f97316" />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView className="flex-1 bg-white" edges={['top', 'bottom']}>
      <View className="flex-row items-center px-4 py-3 border-b border-stone-100">
        <TouchableOpacity onPress={() => router.back()} className="mr-3">
          <Ionicons name="arrow-back" size={22} color="#374151" />
        </TouchableOpacity>
        <View className="flex-1">
          <Text className="font-bold text-stone-900" numberOfLines={1}>{ticket?.title}</Text>
          <Text className="text-stone-400 text-xs capitalize">{ticket?.status?.replace('_', ' ')}</Text>
        </View>
      </View>

      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} className="flex-1">
        <FlatList
          data={messages}
          renderItem={renderMessage}
          keyExtractor={(item) => item.id}
          contentContainerStyle={{ padding: 16, flexGrow: 1 }}
          showsVerticalScrollIndicator={false}
          inverted={false}
          ListHeaderComponent={
            ticket && (
              <View className="bg-stone-50 rounded-xl p-3 mb-4">
                <Text className="text-sm text-stone-600">{ticket.description}</Text>
                <Text className="text-xs text-stone-400 mt-2">{formatDate(ticket.createdAt)}</Text>
              </View>
            )
          }
        />

        {/* Message Input */}
        <View className="flex-row items-end px-4 py-3 border-t border-stone-100 gap-2">
          <View className="flex-1 border border-stone-200 rounded-2xl px-4 py-3 max-h-28">
            <TextInput
              value={messageText}
              onChangeText={setMessageText}
              placeholder="Type your message..."
              placeholderTextColor="#a8a29e"
              multiline
              className="text-stone-900 text-base"
            />
          </View>
          <TouchableOpacity
            onPress={handleSend}
            disabled={!messageText.trim() || addMessage.isPending}
            className={['w-11 h-11 rounded-full items-center justify-center', messageText.trim() ? 'bg-brand-500' : 'bg-stone-200'].join(' ')}
          >
            {addMessage.isPending ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <Ionicons name="send" size={18} color={messageText.trim() ? '#fff' : '#a8a29e'} />
            )}
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
