import { Ionicons } from '@expo/vector-icons';
import React, { useMemo, useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, Pressable, RefreshControl, ScrollView, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { CareerHeader } from '../../../../src/components/career/CareerHeader';
import { Button } from '../../../../src/components/ui/Button';
import { EmptyState } from '../../../../src/components/ui/EmptyState';
import { ErrorState } from '../../../../src/components/ui/ErrorState';
import { SkeletonCard } from '../../../../src/components/ui/Skeleton';
import { useCreateStarStory, useStarStories } from '../../../../src/hooks/career/interviews';
import { useCareerAccess, useCareerFacts } from '../../../../src/hooks/useCareer';
import { useLeaveGuard } from '../../../../src/hooks/useLeaveGuard';
import {
  EMPTY_STORY,
  STORY_FIELDS,
  STORY_FIELD_LABEL,
  STORY_MAX,
  interviewErrorMessage,
  storyErrorField,
  storyFieldErrors,
  storyInput,
  storyIsDirty,
  type StoryDraft,
  type StoryField,
} from '../../../../src/lib/career/interviews';
import { FACT_TYPE_LABEL, factSummary, formatDay } from '../../../../src/lib/career-view';
import { colors } from '../../../../src/theme/colors';
import { useT } from '../../../../src/i18n';

/**
 * STAR stories (situation, task, action, result), as on the website. A story
 * is built from confirmed facts: a number that is not in them is refused by the
 * career API. Picking facts is optional; without a pick the story is linked to
 * all confirmed facts. Saving a story uses no text interview.
 */
export default function StarStoriesScreen() {
  const t = useT('careerInterviews');
  const access = useCareerAccess();
  const stories = useStarStories();
  const facts = useCareerFacts();
  const create = useCreateStarStory();
  const [draft, setDraft] = useState<StoryDraft>(EMPTY_STORY);
  const [factIds, setFactIds] = useState<string[]>([]);
  const [errors, setErrors] = useState<Partial<Record<StoryField, string>>>({});
  const [formError, setFormError] = useState<string | null>(null);

  const dirty = storyIsDirty(draft);
  useLeaveGuard(dirty);

  const confirmed = useMemo(() => (facts.data?.items ?? []).filter((f) => f.confirmation === 'confirmed'), [facts.data]);

  const setField = (field: StoryField, text: string) => {
    setDraft((prev) => ({ ...prev, [field]: text }));
    if (errors[field]) setErrors((prev) => ({ ...prev, [field]: undefined }));
  };

  const toggleFact = (factId: string) =>
    setFactIds((prev) => (prev.includes(factId) ? prev.filter((x) => x !== factId) : [...prev, factId]));

  const save = () => {
    const local = storyFieldErrors(draft);
    setErrors(local);
    setFormError(null);
    if (Object.keys(local).length > 0) return;
    create.mutate(storyInput(draft, factIds.filter((x) => confirmed.some((f) => f.id === x))), {
      onSuccess: () => {
        setDraft(EMPTY_STORY);
        setFactIds([]);
        Alert.alert(t('stories.savedTitle'), t('stories.savedBody'));
      },
      onError: (error) => {
        const message = interviewErrorMessage(error, 'story');
        const field = storyErrorField(error);
        if (field) setErrors((prev) => ({ ...prev, [field]: message }));
        else setFormError(message);
      },
    });
  };

  let content: React.ReactNode;
  if (access.data && (!access.data.enabled || access.data.features?.textInterviewSessions === false)) {
    content = <EmptyState icon="lock-closed-outline" title={t('list.locked')} />;
  } else if (access.isLoading || stories.isLoading) {
    content = (
      <View className="p-5">
        <SkeletonCard />
        <SkeletonCard />
      </View>
    );
  } else if (access.error || stories.error || !stories.data) {
    content = <ErrorState message={interviewErrorMessage(stories.error ?? access.error, 'load')} onRetry={() => void stories.refetch()} />;
  } else {
    content = (
      <ScrollView
        contentContainerStyle={{ padding: 20, paddingBottom: 48 }}
        keyboardShouldPersistTaps="handled"
        refreshControl={<RefreshControl refreshing={stories.isRefetching} onRefresh={() => void stories.refetch()} tintColor={colors.brand[600]} />}
      >
        <View className="bg-white border border-stone-100 rounded-2xl p-4">
          <Text className="font-bold text-stone-900 text-base" accessibilityRole="header">
            {t('stories.newTitle')}
          </Text>
          <Text className="text-stone-500 text-sm mt-1 mb-4 leading-5">
            {t('stories.body')}
          </Text>
          {STORY_FIELDS.map((field) => (
            <View key={field} className="mb-4">
              <Text className="text-sm font-medium text-stone-700 mb-1.5">{STORY_FIELD_LABEL[field]}</Text>
              <TextInput
                value={draft[field]}
                onChangeText={(text) => setField(field, text)}
                multiline
                maxLength={STORY_MAX}
                textAlignVertical="top"
                accessibilityLabel={STORY_FIELD_LABEL[field]}
                placeholderTextColor={colors.stone[400]}
                className={`bg-white border rounded-xl px-3 py-2.5 text-base text-stone-900 min-h-[72px] ${errors[field] ? 'border-red-400' : 'border-stone-200'}`}
              />
              {errors[field] ? <Text className="mt-1 text-xs text-red-500">{errors[field]}</Text> : null}
            </View>
          ))}

          <Text className="text-sm font-medium text-stone-700 mb-1">{t('stories.factsLabel')}</Text>
          <Text className="text-stone-500 text-xs mb-2 leading-4">{t('stories.factsHelp')}</Text>
          {facts.isLoading ? (
            <SkeletonCard />
          ) : confirmed.length === 0 ? (
            <Text className="text-stone-500 text-sm mb-2">{t('stories.noFacts')}</Text>
          ) : (
            confirmed.map((fact) => {
              const on = factIds.includes(fact.id);
              const summary = factSummary(fact.factType, fact.value as Record<string, unknown>);
              return (
                <Pressable
                  key={fact.id}
                  onPress={() => toggleFact(fact.id)}
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: on }}
                  accessibilityLabel={`${FACT_TYPE_LABEL[fact.factType] ?? fact.factType}: ${summary.title}`}
                  className={`min-h-[44px] flex-row items-center rounded-xl border px-3 py-2 mb-2 ${on ? 'border-brand-400 bg-brand-50' : 'border-stone-200 bg-white'}`}
                >
                  <Ionicons name={on ? 'checkbox' : 'square-outline'} size={20} color={on ? colors.brand[600] : colors.stone[400]} />
                  <View className="flex-1 ms-2">
                    <Text className="text-stone-900 text-sm">{summary.title}</Text>
                    <Text className="text-stone-400 text-xs">{FACT_TYPE_LABEL[fact.factType] ?? fact.factType}</Text>
                  </View>
                </Pressable>
              );
            })
          )}

          {formError ? (
            <View className="bg-warning-bg rounded-xl p-3 mt-2" accessibilityLiveRegion="polite">
              <Text className="text-warning text-sm leading-5">{formError}</Text>
            </View>
          ) : null}
          <Button className="mt-3" fullWidth onPress={save} loading={create.isPending}>
            {t('stories.save')}
          </Button>
        </View>

        <Text className="text-sm font-semibold text-stone-500 uppercase tracking-wide mt-6 mb-2" accessibilityRole="header">
          {t('stories.yourStories')}
        </Text>
        {stories.data.items.length === 0 ? (
          <View className="bg-white border border-stone-100 rounded-2xl p-4">
            <Text className="font-semibold text-stone-800">{t('stories.emptyTitle')}</Text>
            <Text className="text-stone-500 text-sm mt-1">{t('stories.emptyBody')}</Text>
          </View>
        ) : (
          stories.data.items.map((story) => (
            <View key={story.id} className="bg-white border border-stone-100 rounded-2xl p-4 mb-3">
              {STORY_FIELDS.map((field) => (
                <View key={field} className="mb-2">
                  <Text className="text-xs font-semibold text-stone-500 uppercase tracking-wide">{STORY_FIELD_LABEL[field]}</Text>
                  <Text className="text-stone-800 text-sm leading-5">{story[field]}</Text>
                </View>
              ))}
              <Text className="text-stone-400 text-xs">{t('stories.savedLine', { date: formatDay(story.createdAt) ?? '', count: story.factIds.length })}</Text>
            </View>
          ))
        )}
      </ScrollView>
    );
  }

  return (
    <SafeAreaView className="flex-1 bg-stone-50" edges={['top', 'bottom']}>
      <CareerHeader title={t('stories.title')} subtitle={dirty ? t('stories.unsaved') : t('stories.subtitle')} />
      <KeyboardAvoidingView className="flex-1" behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        {content}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
