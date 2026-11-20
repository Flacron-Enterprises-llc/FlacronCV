import { Ionicons } from '@expo/vector-icons';
import * as Crypto from 'expo-crypto';
import { useLocalSearchParams, useRouter, type Href } from 'expo-router';
import React, { useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { CoachMessage } from '../../../../../../packages/career-api-client/src/types';
import { CareerHeader } from '../../../../src/components/career/CareerHeader';
import { FeatureState } from '../../../../src/components/career/FeatureState';
import { ErrorState } from '../../../../src/components/ui/ErrorState';
import { SkeletonCard } from '../../../../src/components/ui/Skeleton';
import { promptForError, showUpgradePrompt, upgradeAlertButtons } from '../../../../src/config/paid-upgrades';
import { useAskCoach, useCoachThread, useCoachThreads } from '../../../../src/hooks/career/coach';
import { useCareerOpportunities } from '../../../../src/hooks/useCareer';
import {
  MAX_COACH_QUESTION,
  MAX_COACH_TURNS,
  NEW_THREAD,
  askInput,
  balanceLine,
  coachErrorMessage,
  coachLeft,
  coachRefusal,
  messageBlocks,
  questionCounter,
  starterQuestions,
  threadFull,
  withPending,
} from '../../../../src/lib/career/coach';
import { opportunityParam } from '../../../../src/lib/career/documents';
import { planForDisplay } from '../../../../src/lib/entitlements';
import { useAuthStore } from '../../../../src/store/auth-store';
import { colors } from '../../../../src/theme/colors';
import { useLocale, useT } from '../../../../src/i18n';
import { RTL_FLIP } from '../../../../src/i18n/native';

/**
 * One coach conversation, or a new one (`/career/coach/new`, optionally
 * `?opportunityId=` for a saved listing). Each reply uses one coaching
 * response; the same question retried reuses its idempotency key so it is
 * never charged twice. A refusal the plan solves opens the plans prompt.
 */
export default function CoachThreadScreen() {
  const t = useT('careerCoach');
  const params = useLocalSearchParams<{ id: string; opportunityId?: string }>();
  const isNew = params.id === NEW_THREAD;
  const thread = useCoachThread(isNew ? undefined : params.id);
  return (
    <SafeAreaView className="flex-1 bg-stone-50" edges={['top', 'bottom']}>
      <CareerHeader title={isNew ? t('newConversation') : (thread.data?.title ?? t('title'))} />
      <FeatureState href="/career/coach">
        <Conversation threadId={isNew ? null : params.id} initialOpportunityId={isNew ? opportunityParam(params.opportunityId) : null} />
      </FeatureState>
    </SafeAreaView>
  );
}

function Conversation({ threadId, initialOpportunityId }: { threadId: string | null; initialOpportunityId: string | null }) {
  const t = useT('careerCoach');
  const router = useRouter();
  const locale = useLocale();
  const thread = useCoachThread(threadId ?? undefined);
  const list = useCoachThreads();
  const opportunities = useCareerOpportunities();
  const ask = useAskCoach();
  const [text, setText] = useState('');
  const [opportunityId, setOpportunityId] = useState<string | null>(initialOpportunityId);
  const [pendingText, setPendingText] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const scroll = useRef<ScrollView>(null);
  // One key per question; a retry of the same question in the same thread reuses it.
  const pendingKey = useRef<{ selection: string; key: string } | null>(null);

  if (threadId && thread.isLoading) {
    return (
      <View className="p-5">
        <SkeletonCard />
        <SkeletonCard />
      </View>
    );
  }
  if (threadId && (thread.error || !thread.data)) {
    return <ErrorState message={coachErrorMessage(thread.error, 'load')} onRetry={() => void thread.refetch()} />;
  }

  const messages = thread.data?.messages ?? [];
  const shown = withPending(messages, pendingText);
  const full = thread.data ? threadFull(thread.data) : false;
  const left = coachLeft(list.data);
  const counter = questionCounter(text);
  const openings = opportunities.data?.items ?? [];
  const linked = thread.data?.opportunityId ? openings.find((item) => item.id === thread.data?.opportunityId) : null;

  const openPlans = () => router.push('/(dashboard)/settings/plans' as Href);

  const send = (raw: string) => {
    const prepared = askInput(raw, threadId ? { threadId } : { threadId: null, opportunityId }, locale);
    if (!prepared.ok) {
      setError(prepared.message);
      return;
    }
    const selection = JSON.stringify(prepared.input);
    if (!pendingKey.current || pendingKey.current.selection !== selection) {
      pendingKey.current = { selection, key: Crypto.randomUUID() };
    }
    setError(null);
    setPendingText(prepared.input.question);
    ask.mutate(
      { body: prepared.input, idempotencyKey: pendingKey.current.key },
      {
        onSuccess: (paid) => {
          pendingKey.current = null;
          setPendingText(null);
          setText('');
          if (!threadId) router.replace(`/(dashboard)/career/coach/${paid.thread.id}` as Href);
        },
        onError: (err) => {
          setPendingText(null);
          const plan = planForDisplay(useAuthStore.getState().user?.subscription);
          const prompt = promptForError(err, plan);
          if (prompt) {
            showUpgradePrompt(prompt, openPlans);
            return;
          }
          const refusal = coachRefusal(err);
          if (refusal) {
            Alert.alert(
              refusal === 'quota' ? t('limitTitle') : t('planTitle'),
              coachErrorMessage(err, 'send'),
              upgradeAlertButtons(openPlans),
            );
            return;
          }
          setError(coachErrorMessage(err, 'send'));
        },
      },
    );
  };

  const canSend = !ask.isPending && !full && text.trim().length > 0 && !counter.over;

  return (
    <KeyboardAvoidingView className="flex-1" behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={Platform.OS === 'ios' ? 8 : 0}>
      <ScrollView
        ref={scroll}
        className="flex-1"
        contentContainerStyle={{ padding: 16, paddingBottom: 24 }}
        keyboardShouldPersistTaps="handled"
        onContentSizeChange={() => scroll.current?.scrollToEnd({ animated: true })}
      >
        {list.data ? <Text className="text-stone-500 text-xs mb-3 text-center">{balanceLine(list.data)}</Text> : null}
        {linked ? (
          <Text className="text-stone-600 text-sm mb-3 text-center">{t('aboutListing', { title: linked.title })}</Text>
        ) : null}

        {shown.length === 0 ? (
          <View>
            <View className="bg-surface border border-stone-100 rounded-2xl p-4">
              <Text className="font-bold text-stone-900" accessibilityRole="header">
                {t('emptyThreadTitle')}
              </Text>
              <Text className="text-stone-500 text-sm mt-1 leading-5">{t('emptyThreadBody')}</Text>
            </View>

            {openings.length > 0 ? (
              <View className="mt-4">
                <Text className="text-sm font-medium text-stone-700 mb-2">{t('listingLabel')}</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }} accessibilityRole="radiogroup">
                  {[{ id: null as string | null, title: t('listingNone') }, ...openings.map((item) => ({ id: item.id as string | null, title: item.title }))].map((item) => {
                    const on = item.id === opportunityId;
                    return (
                      <Pressable
                        key={item.id ?? 'none'}
                        onPress={() => setOpportunityId(item.id)}
                        accessibilityRole="radio"
                        accessibilityState={{ selected: on, checked: on }}
                        accessibilityLabel={item.title}
                        className={`min-h-[44px] max-w-[240px] px-4 justify-center rounded-full border ${on ? 'bg-brand-600 border-brand-600' : 'bg-surface border-stone-200'}`}
                      >
                        <Text numberOfLines={1} className={`text-sm font-semibold ${on ? 'text-white' : 'text-stone-700'}`}>
                          {item.title}
                        </Text>
                      </Pressable>
                    );
                  })}
                </ScrollView>
              </View>
            ) : null}

            <Text className="text-sm font-medium text-stone-700 mt-5 mb-2">{t('startersLabel')}</Text>
            {starterQuestions().map((question) => (
              <TouchableOpacity
                key={question}
                onPress={() => setText(question)}
                accessibilityRole="button"
                accessibilityHint={t('starterHint')}
                className="bg-surface border border-stone-200 rounded-xl px-4 py-3 mb-2 min-h-[44px] justify-center"
              >
                <Text className="text-stone-800 text-sm leading-5">{question}</Text>
              </TouchableOpacity>
            ))}
          </View>
        ) : (
          shown.map((message) => <Bubble key={message.id} message={message} />)
        )}

        {ask.isPending ? (
          <View className="self-start flex-row items-center bg-surface border border-stone-100 rounded-2xl px-4 py-3 mt-1" accessibilityLiveRegion="polite">
            <ActivityIndicator size="small" color={colors.brand[600]} />
            <Text className="text-stone-500 text-sm ms-2">{t('thinking')}</Text>
          </View>
        ) : null}
      </ScrollView>

      <View className="bg-surface border-t border-stone-100 px-4 pt-3 pb-2">
        {error ? (
          <View className="bg-warning-bg rounded-xl p-3 mb-2" accessibilityLiveRegion="polite">
            <Text className="text-warning text-sm leading-5">{error}</Text>
          </View>
        ) : null}
        {full ? (
          <Text className="text-warning text-sm mb-2 leading-5">{t('turnLimit', { max: MAX_COACH_TURNS })}</Text>
        ) : list.data && left < 1 ? (
          <Text className="text-warning text-sm mb-2 leading-5">{t('noneLeft')}</Text>
        ) : null}
        <View className="flex-row items-end">
          <TextInput
            value={text}
            onChangeText={(value) => {
              setText(value);
              if (error) setError(null);
            }}
            placeholder={t('placeholder')}
            placeholderTextColor={colors.stone[400]}
            multiline
            maxLength={MAX_COACH_QUESTION + 200}
            editable={!full}
            accessibilityLabel={t('composerLabel')}
            className="flex-1 min-h-[44px] max-h-36 border border-stone-200 rounded-2xl px-4 py-2.5 text-stone-900 text-base bg-stone-50"
            style={{ textAlign: 'auto', textAlignVertical: 'top' }}
          />
          <TouchableOpacity
            onPress={() => send(text)}
            disabled={!canSend}
            accessibilityRole="button"
            accessibilityLabel={t('send')}
            accessibilityState={{ disabled: !canSend, busy: ask.isPending }}
            className={`h-11 w-11 rounded-full items-center justify-center ms-2 ${canSend ? 'bg-brand-600' : 'bg-stone-300'}`}
          >
            {ask.isPending ? <ActivityIndicator size="small" color="#fff" /> : <Ionicons name="send" size={18} color="#fff" style={RTL_FLIP} />}
          </TouchableOpacity>
        </View>
        <View className="flex-row justify-between mt-1.5">
          <Text className="text-stone-400 text-[11px] flex-1 me-2 leading-4">{t('disclaimer')}</Text>
          <Text className={`text-[11px] ${counter.over ? 'text-error' : 'text-stone-400'}`}>{t('counter', { used: counter.used, max: counter.max })}</Text>
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}

function Bubble({ message }: { message: CoachMessage }) {
  const t = useT('careerCoach');
  const mine = message.role === 'user';
  const blocks = messageBlocks(message.content);
  return (
    <View
      className={`max-w-[88%] rounded-2xl px-4 py-3 mb-2 ${mine ? 'self-end bg-brand-600' : 'self-start bg-surface border border-stone-100'}`}
      accessible
      accessibilityLabel={`${mine ? t('you') : t('coach')}: ${message.content}`}
    >
      {blocks.map((block, index) =>
        block.kind === 'bullet' ? (
          <View key={index} className="flex-row mt-1">
            <Text className={mine ? 'text-white' : 'text-stone-800'}>{'•'}</Text>
            <Text selectable className={`flex-1 ms-2 text-[15px] leading-6 ${mine ? 'text-white' : 'text-stone-800'}`}>
              {block.text}
            </Text>
          </View>
        ) : (
          <Text key={index} selectable className={`text-[15px] leading-6 ${index > 0 ? 'mt-2' : ''} ${mine ? 'text-white' : 'text-stone-800'}`}>
            {block.text}
          </Text>
        ),
      )}
    </View>
  );
}
