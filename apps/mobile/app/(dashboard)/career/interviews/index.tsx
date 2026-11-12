import { Ionicons } from '@expo/vector-icons';
import * as Crypto from 'expo-crypto';
import { useRouter, type Href } from 'expo-router';
import React, { useRef, useState } from 'react';
import { Alert, Pressable, RefreshControl, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { InterviewStage, OpportunityItem } from '../../../../../../packages/career-api-client/src/types';
import { CareerHeader, Pill } from '../../../../src/components/career/CareerHeader';
import { Button } from '../../../../src/components/ui/Button';
import { EmptyState } from '../../../../src/components/ui/EmptyState';
import { ErrorState } from '../../../../src/components/ui/ErrorState';
import { SkeletonCard } from '../../../../src/components/ui/Skeleton';
import { useCreateInterview, useInterviews } from '../../../../src/hooks/career/interviews';
import { useCareerAccess, useCareerOpportunities } from '../../../../src/hooks/useCareer';
import {
  INTERVIEW_STAGES,
  NOT_A_SCORE,
  STAGE_LABEL,
  interviewErrorMessage,
  interviewsLeft,
  sessionStatus,
} from '../../../../src/lib/career/interviews';
import { formatDay } from '../../../../src/lib/career-view';
import { colors } from '../../../../src/theme/colors';

/**
 * Text interview practice, as on the website (career/interviews): the
 * allowance, the sessions on this account, and starting a session for a saved
 * opportunity and a stage. Starting uses one text interview after a
 * confirmation; a retry of the same start reuses its idempotency key so it is
 * never charged twice. Questions come from the AI provider, which is not
 * configured locally: that refusal is shown as such and nothing is charged.
 */
export default function InterviewsScreen() {
  const router = useRouter();
  const access = useCareerAccess();
  const list = useInterviews();
  const opportunities = useCareerOpportunities();
  const create = useCreateInterview();
  const [opportunityId, setOpportunityId] = useState<string | null>(null);
  const [stage, setStage] = useState<InterviewStage>('behavioral');
  const [startError, setStartError] = useState<string | null>(null);
  // One key per start action; reused only when the same start is retried.
  const pending = useRef<{ selection: string; key: string } | null>(null);

  const features = access.data?.features;
  const voiceOn = features?.voiceMinutes === true;
  const remaining = interviewsLeft(list.data);
  const openings = opportunities.data?.items ?? [];
  const selected = openings.find((o) => o.id === opportunityId) ?? null;

  const start = () => {
    if (!selected) return;
    const selection = `${selected.id}:${stage}`;
    if (!pending.current || pending.current.selection !== selection) pending.current = { selection, key: Crypto.randomUUID() };
    const key = pending.current.key;
    setStartError(null);
    create.mutate(
      { opportunityId: selected.id, stage, idempotencyKey: key },
      {
        onSuccess: (paid) => {
          pending.current = null;
          router.push(`/(dashboard)/career/interviews/${paid.session.id}` as Href);
        },
        onError: (error) => setStartError(interviewErrorMessage(error, 'start')),
      },
    );
  };

  const confirmStart = () => {
    if (!selected) return;
    Alert.alert(
      'Start this session',
      `This uses 1 text interview. ${remaining} left. You get up to ten questions, feedback, and a summary.`,
      [
        { text: 'Not now', style: 'cancel' },
        { text: 'Use 1 text interview', onPress: start },
      ],
    );
  };

  let content: React.ReactNode;
  if (access.data && (!access.data.enabled || features?.textInterviewSessions === false)) {
    content = <EmptyState icon="lock-closed-outline" title="Career tools are not included in your plan" />;
  } else if (access.isLoading || list.isLoading) {
    content = (
      <View className="p-5">
        <SkeletonCard />
        <SkeletonCard />
      </View>
    );
  } else if (access.error || list.error || !list.data) {
    content = (
      <ErrorState
        message={interviewErrorMessage(list.error ?? access.error, 'load')}
        onRetry={() => {
          void access.refetch();
          void list.refetch();
        }}
      />
    );
  } else {
    const sessions = list.data.items;
    content = (
      <ScrollView
        contentContainerStyle={{ padding: 20, paddingBottom: 48 }}
        refreshControl={
          <RefreshControl
            refreshing={list.isRefetching}
            onRefresh={() => {
              void list.refetch();
              void opportunities.refetch();
            }}
            tintColor={colors.brand[600]}
          />
        }
      >
        <Text className="text-stone-900 font-semibold">{`Text interviews left: ${remaining}`}</Text>
        <Text className="text-stone-500 text-sm mt-1 leading-5">{NOT_A_SCORE}</Text>

        <View className="mt-4 gap-3">
          <LinkRow
            icon="star-outline"
            title="STAR stories"
            body="Situation, task, action, result from your confirmed facts. Saving a story does not use a text interview."
            onPress={() => router.push('/(dashboard)/career/interviews/stories' as Href)}
          />
          {voiceOn ? (
            <LinkRow
              icon="mic-outline"
              title="Voice practice"
              body="Practice out loud and type what you said. This app does not record audio."
              onPress={() => router.push('/(dashboard)/career/interviews/voice' as Href)}
            />
          ) : null}
        </View>

        <View className="bg-white border border-stone-100 rounded-2xl p-4 mt-5">
          <Text className="font-bold text-stone-900 text-base" accessibilityRole="header">
            {sessions.length > 0 ? 'Start another session' : 'Start a practice session'}
          </Text>
          <Text className="text-stone-500 text-sm mt-1 leading-5">
            One text interview covers up to ten questions, feedback, and a summary.
          </Text>

          <Text className="text-sm font-medium text-stone-700 mt-4 mb-2">Opportunity</Text>
          {opportunities.isLoading ? (
            <SkeletonCard />
          ) : openings.length === 0 ? (
            <View>
              <Text className="text-stone-500 text-sm leading-5">Open a listing to practice against it. Save or paste one on the website first.</Text>
              <Button variant="outline" className="mt-3 self-start" onPress={() => router.push('/(dashboard)/career/opportunities' as Href)}>
                Saved opportunities
              </Button>
            </View>
          ) : (
            <OpportunityPicker items={openings} selectedId={opportunityId} onSelect={setOpportunityId} />
          )}

          <Text className="text-sm font-medium text-stone-700 mt-4 mb-2">Stage</Text>
          <View className="flex-row flex-wrap gap-2" accessibilityRole="radiogroup">
            {INTERVIEW_STAGES.map((item) => {
              const on = item === stage;
              return (
                <Pressable
                  key={item}
                  onPress={() => setStage(item)}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: on, checked: on }}
                  accessibilityLabel={`${STAGE_LABEL[item]} stage`}
                  className={`min-h-[44px] px-4 justify-center rounded-full border ${on ? 'bg-brand-600 border-brand-600' : 'bg-white border-stone-200'}`}
                >
                  <Text className={`text-sm font-semibold ${on ? 'text-white' : 'text-stone-700'}`}>{STAGE_LABEL[item]}</Text>
                </Pressable>
              );
            })}
          </View>

          {startError ? (
            <View className="bg-warning-bg rounded-xl p-3 mt-4" accessibilityLiveRegion="polite">
              <Text className="text-warning text-sm leading-5">{startError}</Text>
            </View>
          ) : null}
          {remaining < 1 ? (
            <Text className="text-stone-500 text-sm mt-4">No text interviews left. A session cannot be started now.</Text>
          ) : null}

          <Button className="mt-4" fullWidth onPress={confirmStart} loading={create.isPending} disabled={!selected || remaining < 1}>
            {sessions.length > 0 ? 'Start another session' : 'Start a practice session'}
          </Button>
        </View>

        <Text className="text-sm font-semibold text-stone-500 uppercase tracking-wide mt-6 mb-2" accessibilityRole="header">
          Your sessions
        </Text>
        {sessions.length === 0 ? (
          <View className="bg-white border border-stone-100 rounded-2xl p-4">
            <Text className="font-semibold text-stone-800">No session yet</Text>
            <Text className="text-stone-500 text-sm mt-1">Start one above for a saved opportunity.</Text>
          </View>
        ) : (
          sessions.map((session) => (
            <Pressable
              key={session.id}
              onPress={() => router.push(`/(dashboard)/career/interviews/${session.id}` as Href)}
              accessibilityRole="button"
              accessibilityLabel={`${session.title}, ${STAGE_LABEL[session.stage]} stage, ${sessionStatus(session)}`}
              className="bg-white border border-stone-100 rounded-2xl p-4 mb-3 active:bg-stone-50"
            >
              <View className="flex-row items-start justify-between">
                <Text className="font-bold text-stone-900 flex-1 mr-2">{session.title}</Text>
                <Pill label={STAGE_LABEL[session.stage].toUpperCase()} tone="brand" />
              </View>
              <Text className="text-stone-500 text-sm mt-1">{sessionStatus(session)}</Text>
              <Text className="text-stone-400 text-xs mt-1">{`Started ${formatDay(session.createdAt) ?? ''}`}</Text>
            </Pressable>
          ))
        )}
      </ScrollView>
    );
  }

  return (
    <SafeAreaView className="flex-1 bg-stone-50" edges={['top', 'bottom']}>
      <CareerHeader title="Interview practice" />
      {content}
    </SafeAreaView>
  );
}

function LinkRow({ icon, title, body, onPress }: { icon: keyof typeof Ionicons.glyphMap; title: string; body: string; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={title}
      accessibilityHint={body}
      className="bg-white border border-stone-100 rounded-2xl p-4 flex-row items-center active:bg-stone-50"
    >
      <View className="w-10 h-10 rounded-full bg-brand-100 items-center justify-center mr-3">
        <Ionicons name={icon} size={20} color={colors.brand[600]} />
      </View>
      <View className="flex-1">
        <Text className="font-bold text-stone-900">{title}</Text>
        <Text className="text-stone-500 text-xs mt-0.5 leading-4">{body}</Text>
      </View>
      <Ionicons name="chevron-forward" size={18} color={colors.stone[400]} />
    </Pressable>
  );
}

function OpportunityPicker({
  items,
  selectedId,
  onSelect,
}: {
  items: OpportunityItem[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  return (
    <View accessibilityRole="radiogroup">
      {items.map((item) => {
        const on = item.id === selectedId;
        return (
          <Pressable
            key={item.id}
            onPress={() => onSelect(item.id)}
            accessibilityRole="radio"
            accessibilityState={{ selected: on, checked: on }}
            accessibilityLabel={item.organization ? `${item.title}, ${item.organization}` : item.title}
            className={`min-h-[44px] flex-row items-center rounded-xl border px-3 py-2.5 mb-2 ${on ? 'border-brand-400 bg-brand-50' : 'border-stone-200 bg-white'}`}
          >
            <Ionicons name={on ? 'radio-button-on' : 'radio-button-off'} size={20} color={on ? colors.brand[600] : colors.stone[400]} />
            <View className="flex-1 ml-2">
              <Text className="text-stone-900 text-sm font-semibold">{item.title}</Text>
              {item.organization ? <Text className="text-stone-500 text-xs">{item.organization}</Text> : null}
            </View>
            {item.label === 'expired' ? <Pill label="EXPIRED" /> : null}
          </Pressable>
        );
      })}
    </View>
  );
}
