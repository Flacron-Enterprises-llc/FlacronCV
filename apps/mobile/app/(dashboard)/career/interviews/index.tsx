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
import { Input } from '../../../../src/components/ui/Input';
import { ErrorState } from '../../../../src/components/ui/ErrorState';
import { SkeletonCard } from '../../../../src/components/ui/Skeleton';
import { useCreateInterview, useInterviews } from '../../../../src/hooks/career/interviews';
import { useCareerAccess, useCareerOpportunities } from '../../../../src/hooks/useCareer';
import {
  INTERVIEW_STAGES,
  MAX_INTERVIEW_QUESTIONS,
  MAX_INTERVIEW_ROLE,
  QUESTION_COUNT_OPTIONS,
  STAGE_LABEL,
  interviewErrorMessage,
  interviewsLeft,
  notAScore,
  sessionStatus,
  startInterviewInput,
  type InterviewTarget,
} from '../../../../src/lib/career/interviews';
import { formatDay } from '../../../../src/lib/career-view';
import { colors } from '../../../../src/theme/colors';
import { useT } from '../../../../src/i18n';
import { RTL_FLIP } from '../../../../src/i18n/native';

/**
 * Text interview practice, as on the website (career/interviews): the
 * allowance, the sessions on this account, and starting a session for a saved
 * opportunity or a typed role, a stage and 3 to 10 questions. Starting uses one text interview after a
 * confirmation; a retry of the same start reuses its idempotency key so it is
 * never charged twice. Questions come from the AI provider, which is not
 * configured locally: that refusal is shown as such and nothing is charged.
 */
export default function InterviewsScreen() {
  const t = useT('careerInterviews');
  const router = useRouter();
  const access = useCareerAccess();
  const list = useInterviews();
  const opportunities = useCareerOpportunities();
  const create = useCreateInterview();
  const [opportunityId, setOpportunityId] = useState<string | null>(null);
  const [targetKind, setTargetKind] = useState<InterviewTarget['kind']>('listing');
  const [role, setRole] = useState('');
  const [stage, setStage] = useState<InterviewStage>('behavioral');
  const [questionCount, setQuestionCount] = useState(MAX_INTERVIEW_QUESTIONS);
  const [startError, setStartError] = useState<string | null>(null);
  // One key per start action; reused only when the same start is retried.
  const pending = useRef<{ selection: string; key: string } | null>(null);

  const features = access.data?.features;
  const voiceOn = features?.voiceMinutes === true;
  const remaining = interviewsLeft(list.data);
  const openings = opportunities.data?.items ?? [];
  const selected = openings.find((o) => o.id === opportunityId) ?? null;

  const target: InterviewTarget = targetKind === 'listing' ? { kind: 'listing', opportunityId: selected?.id ?? null } : { kind: 'role', role };
  const prepared = startInterviewInput(target, stage, questionCount);

  const start = () => {
    if (!prepared.ok) return;
    // The same choices reuse the same key, so a retry after a lost response is never charged twice.
    const selection = JSON.stringify(prepared.input);
    if (!pending.current || pending.current.selection !== selection) pending.current = { selection, key: Crypto.randomUUID() };
    const key = pending.current.key;
    setStartError(null);
    create.mutate(
      { body: prepared.input, idempotencyKey: key },
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
    if (!prepared.ok) {
      setStartError(prepared.message);
      return;
    }
    Alert.alert(
      t('list.confirmTitle'),
      t('list.confirmBodyCount', { count: remaining, questions: prepared.input.questionCount ?? MAX_INTERVIEW_QUESTIONS }),
      [
        { text: t('list.notNow'), style: 'cancel' },
        { text: t('list.confirmGo'), onPress: start },
      ],
    );
  };

  let content: React.ReactNode;
  if (access.data && (!access.data.enabled || features?.textInterviewSessions === false)) {
    content = <EmptyState icon="lock-closed-outline" title={t('list.locked')} />;
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
        <Text className="text-stone-900 font-semibold">{t('list.allowance', { remaining })}</Text>
        <Text className="text-stone-500 text-sm mt-1 leading-5">{notAScore()}</Text>

        <View className="mt-4 gap-3">
          <LinkRow
            icon="star-outline"
            title={t('list.storiesTitle')}
            body={t('list.storiesBody')}
            onPress={() => router.push('/(dashboard)/career/interviews/stories' as Href)}
          />
          {voiceOn ? (
            <LinkRow
              icon="mic-outline"
              title={t('list.voiceTitle')}
              body={t('list.voiceBody')}
              onPress={() => router.push('/(dashboard)/career/interviews/voice' as Href)}
            />
          ) : null}
        </View>

        <View className="bg-white border border-stone-100 rounded-2xl p-4 mt-5">
          <Text className="font-bold text-stone-900 text-base" accessibilityRole="header">
            {sessions.length > 0 ? t('list.startAnother') : t('list.start')}
          </Text>
          <Text className="text-stone-500 text-sm mt-1 leading-5">
            {t('list.startHelp')}
          </Text>

          <Text className="text-sm font-medium text-stone-700 mt-4 mb-2">{t('list.targetLabel')}</Text>
          <View className="flex-row flex-wrap gap-2 mb-3" accessibilityRole="radiogroup" accessibilityLabel={t('list.targetLabel')}>
            {(
              [
                ['listing', t('list.modeListing')],
                ['role', t('list.modeRole')],
              ] as const
            ).map(([kind, label]) => {
              const on = targetKind === kind;
              return (
                <Pressable
                  key={kind}
                  onPress={() => {
                    setTargetKind(kind);
                    setStartError(null);
                  }}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: on, checked: on }}
                  accessibilityLabel={label}
                  className={`min-h-[44px] px-4 justify-center rounded-full border ${on ? 'bg-brand-600 border-brand-600' : 'bg-white border-stone-200'}`}
                >
                  <Text className={`text-sm font-semibold ${on ? 'text-white' : 'text-stone-700'}`}>{label}</Text>
                </Pressable>
              );
            })}
          </View>
          {targetKind === 'role' ? (
            <Input
              label={t('list.roleLabel')}
              value={role}
              onChangeText={(text) => {
                setRole(text);
                setStartError(null);
              }}
              maxLength={MAX_INTERVIEW_ROLE}
              hint={t('list.roleHint')}
              autoCapitalize="sentences"
            />
          ) : opportunities.isLoading ? (
            <SkeletonCard />
          ) : openings.length === 0 ? (
            <View>
              <Text className="text-stone-500 text-sm leading-5">{t('list.noOpportunities')}</Text>
              <Button variant="outline" className="mt-3 self-start" onPress={() => router.push('/(dashboard)/career/opportunities' as Href)}>
                {t('list.savedOpportunities')}
              </Button>
            </View>
          ) : (
            <OpportunityPicker items={openings} selectedId={opportunityId} onSelect={setOpportunityId} />
          )}

          <Text className="text-sm font-medium text-stone-700 mt-4 mb-2">{t('list.stage')}</Text>
          <View className="flex-row flex-wrap gap-2" accessibilityRole="radiogroup">
            {INTERVIEW_STAGES.map((item) => {
              const on = item === stage;
              return (
                <Pressable
                  key={item}
                  onPress={() => setStage(item)}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: on, checked: on }}
                  accessibilityLabel={t('list.stageA11y', { stage: STAGE_LABEL[item] })}
                  className={`min-h-[44px] px-4 justify-center rounded-full border ${on ? 'bg-brand-600 border-brand-600' : 'bg-white border-stone-200'}`}
                >
                  <Text className={`text-sm font-semibold ${on ? 'text-white' : 'text-stone-700'}`}>{STAGE_LABEL[item]}</Text>
                </Pressable>
              );
            })}
          </View>

          <Text className="text-sm font-medium text-stone-700 mt-4 mb-2">{t('list.questionCount')}</Text>
          <View className="flex-row flex-wrap gap-2" accessibilityRole="radiogroup" accessibilityLabel={t('list.questionCount')}>
            {QUESTION_COUNT_OPTIONS.map((count) => {
              const on = count === questionCount;
              return (
                <Pressable
                  key={count}
                  onPress={() => setQuestionCount(count)}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: on, checked: on }}
                  accessibilityLabel={t('list.questionCountOption', { count })}
                  className={`min-h-[44px] min-w-[44px] px-3 items-center justify-center rounded-full border ${on ? 'bg-brand-600 border-brand-600' : 'bg-white border-stone-200'}`}
                >
                  <Text className={`text-sm font-semibold ${on ? 'text-white' : 'text-stone-700'}`}>{count}</Text>
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
            <Text className="text-stone-500 text-sm mt-4">{t('list.noneLeft')}</Text>
          ) : null}

          <Button className="mt-4" fullWidth onPress={confirmStart} loading={create.isPending} disabled={!prepared.ok || remaining < 1}>
            {sessions.length > 0 ? t('list.startAnother') : t('list.start')}
          </Button>
        </View>

        <Text className="text-sm font-semibold text-stone-500 uppercase tracking-wide mt-6 mb-2" accessibilityRole="header">
          {t('list.yourSessions')}
        </Text>
        {sessions.length === 0 ? (
          <View className="bg-white border border-stone-100 rounded-2xl p-4">
            <Text className="font-semibold text-stone-800">{t('list.emptyTitle')}</Text>
            <Text className="text-stone-500 text-sm mt-1">{t('list.emptyBody')}</Text>
          </View>
        ) : (
          sessions.map((session) => (
            <Pressable
              key={session.id}
              onPress={() => router.push(`/(dashboard)/career/interviews/${session.id}` as Href)}
              accessibilityRole="button"
              accessibilityLabel={t('list.sessionA11y', { title: session.title, stage: STAGE_LABEL[session.stage], status: sessionStatus(session) })}
              className="bg-white border border-stone-100 rounded-2xl p-4 mb-3 active:bg-stone-50"
            >
              <View className="flex-row items-start justify-between">
                <Text className="font-bold text-stone-900 flex-1 me-2">{session.title}</Text>
                <Pill label={STAGE_LABEL[session.stage].toUpperCase()} tone="brand" />
              </View>
              <Text className="text-stone-500 text-sm mt-1">{sessionStatus(session)}</Text>
              <Text className="text-stone-400 text-xs mt-1">{t('list.started', { date: formatDay(session.createdAt) ?? '' })}</Text>
            </Pressable>
          ))
        )}
      </ScrollView>
    );
  }

  return (
    <SafeAreaView className="flex-1 bg-stone-50" edges={['top', 'bottom']}>
      <CareerHeader title={t('list.title')} />
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
      <View className="w-10 h-10 rounded-full bg-brand-100 items-center justify-center me-3">
        <Ionicons name={icon} size={20} color={colors.brand[600]} />
      </View>
      <View className="flex-1">
        <Text className="font-bold text-stone-900">{title}</Text>
        <Text className="text-stone-500 text-xs mt-0.5 leading-4">{body}</Text>
      </View>
      <Ionicons name="chevron-forward" size={18} color={colors.stone[400]} style={RTL_FLIP} />
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
  const t = useT('careerInterviews');
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
            <View className="flex-1 ms-2">
              <Text className="text-stone-900 text-sm font-semibold">{item.title}</Text>
              {item.organization ? <Text className="text-stone-500 text-xs">{item.organization}</Text> : null}
            </View>
            {item.label === 'expired' ? <Pill label={t('list.expired')} /> : null}
          </Pressable>
        );
      })}
    </View>
  );
}
