import { useLocalSearchParams, useRouter, type Href } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, KeyboardAvoidingView, Platform, ScrollView, Switch, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { CareerHeader, Pill } from '../../../../src/components/career/CareerHeader';
import { Button } from '../../../../src/components/ui/Button';
import { EmptyState } from '../../../../src/components/ui/EmptyState';
import { ErrorState } from '../../../../src/components/ui/ErrorState';
import { Input } from '../../../../src/components/ui/Input';
import { SkeletonCard } from '../../../../src/components/ui/Skeleton';
import { useCreateFact, useDeleteFact, useFactRevisions, useSaveFact } from '../../../../src/hooks/career/profile';
import { useCareerAccess, useCareerFacts } from '../../../../src/hooks/useCareer';
import { useLeaveGuard } from '../../../../src/hooks/useLeaveGuard';
import {
  changedPatch,
  draftsEqual,
  factFields,
  factTitle,
  fieldErrorMap,
  fieldHint,
  isFactType,
  missingFieldsLine,
  newFactValue,
  revisionLine,
  SOURCE_LABEL,
  toDraft,
  typeLabel,
  uncertainNote,
  unplacedErrors,
  type FactDraft,
  type FactType,
} from '../../../../src/lib/career/profile';
import { careerErrorMessage, formatDay } from '../../../../src/lib/career-view';
import { achievementNeedsNumber } from '../../../../src/lib/career/facts-assist';
import { hasKey, useT } from '../../../../src/i18n';
import { colors } from '../../../../src/theme/colors';
import { fieldErrors } from '../../../../../../packages/career-api-client/src/client';
import type { Fact } from '../../../../../../packages/career-api-client/src/types';

const EMPTY: Record<string, never> = {};

/**
 * One career fact: add (`id` = "new", `type` = fact type) or edit, confirm
 * (the consent that it may be used in drafts), delete, and its revision
 * history. Same fields and checks as the website's FactEditor.
 */
export default function CareerFactScreen() {
  const params = useLocalSearchParams<{ id: string; type?: string }>();
  const router = useRouter();
  const t = useT('careerProfile');
  const tk = useT('career');
  const tc = useT('common');
  const isNew = params.id === 'new';
  const access = useCareerAccess();
  const facts = useCareerFacts();
  const fact = isNew ? undefined : facts.data?.items.find((f) => f.id === params.id);
  const type: FactType | undefined = isNew ? (isFactType(params.type) ? params.type : 'experience') : fact?.factType;

  const create = useCreateFact();
  const save = useSaveFact();
  const remove = useDeleteFact();
  const pending = create.isPending || save.isPending || remove.isPending;

  const [draft, setDraft] = useState<FactDraft | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [showHistory, setShowHistory] = useState(false);
  const [leave, setLeave] = useState(false);
  const revisions = useFactRevisions(fact?.id, showHistory);

  const baseline = type ? toDraft(type, fact?.value ?? EMPTY) : {};
  const current = draft ?? baseline;
  const dirty = draft !== null && !draftsEqual(draft, baseline);
  useLeaveGuard(dirty && !leave);

  // Leave after a create or delete, once the guard has seen the clean state.
  useEffect(() => {
    if (!leave) return;
    if (router.canGoBack()) router.back();
    else router.replace('/(dashboard)/career/profile' as Href);
  }, [leave, router]);

  const setField = (field: string, value: string) => {
    setDraft((prev) => ({ ...(prev ?? baseline), [field]: value }));
    setErrors((prev) => {
      if (!prev[field]) return prev;
      const next = { ...prev };
      delete next[field];
      return next;
    });
  };

  const showServerError = (error: unknown, fallback: string) => {
    const fields = fieldErrors(error);
    if (fields.length > 0) {
      setErrors(fieldErrorMap(fields));
      return;
    }
    Alert.alert(tk('shared.notSaved'), careerErrorMessage(error, fallback));
  };

  const submitNew = (confirm: boolean) => {
    if (!type) return;
    const result = newFactValue(type, current, confirm ? 'confirmed' : 'draft');
    if (!result.ok) {
      if ('empty' in result) Alert.alert(t('fact.nothingToSave'), t('fact.fillOne'));
      else setErrors(fieldErrorMap(result.errors));
      return;
    }
    setErrors({});
    create.mutate(
      { fact: { factType: type, value: result.value, source: 'manual' }, confirm },
      {
        onSuccess: () => {
          setDraft(null);
          setLeave(true);
        },
        onError: (error) => showServerError(error, t('fact.addFailed')),
      },
    );
  };

  const submitExisting = (target: Fact, confirm: boolean) => {
    const result = changedPatch(target.factType, target.value, current, confirm ? 'confirmed' : target.confirmation);
    if (!result.ok) {
      setErrors(fieldErrorMap(result.errors));
      return;
    }
    setErrors({});
    if (!confirm && result.patch === null) {
      setDraft(null);
      return;
    }
    save.mutate(
      { factId: target.id, patch: result.patch, confirm },
      {
        onSuccess: () => setDraft(null),
        onError: (error) =>
          showServerError(error, confirm ? t('fact.confirmFailed') : tk('shared.changesNotSaved')),
      },
    );
  };

  const onDelete = (target: Fact) => {
    Alert.alert(t('fact.deleteTitle'), tk('shared.keepsTextNote'), [
      { text: tc('cancel'), style: 'cancel' },
      {
        text: tc('delete'),
        style: 'destructive',
        onPress: () =>
          remove.mutate(target.id, {
            onSuccess: () => {
              setDraft(null);
              setLeave(true);
            },
            onError: (error) => Alert.alert(tk('shared.notDeleted'), careerErrorMessage(error, t('fact.deleteFailed'))),
          }),
      },
    ]);
  };

  const experiences = (facts.data?.items ?? []).filter((f) => f.factType === 'experience');

  let content: React.ReactNode;
  if (access.data && !access.data.enabled) {
    content = <EmptyState icon="lock-closed-outline" title={tk('shared.notIncluded')} description={tk('shared.v1Unchanged')} />;
  } else if (leave) {
    content = (
      <View className="p-5">
        <SkeletonCard />
      </View>
    );
  } else if (access.isLoading || facts.isLoading) {
    content = (
      <View className="p-5">
        <SkeletonCard />
        <SkeletonCard />
      </View>
    );
  } else if (access.error || facts.error) {
    content = <ErrorState message={careerErrorMessage(facts.error ?? access.error, t('screen.loadFailed'))} onRetry={() => void facts.refetch()} />;
  } else if (!type || (!isNew && !fact)) {
    content = <ErrorState message={t('fact.gone')} onRetry={() => void facts.refetch()} />;
  } else {
    const extra = unplacedErrors(type, errors);
    const missing = fact ? missingFieldsLine(fact.missingFields) : null;
    content = (
      <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 140 }} keyboardShouldPersistTaps="handled">
        {fact ? (
          <View className="flex-row flex-wrap items-center gap-2 mb-3">
            <Pill label={fact.confirmation === 'confirmed' ? tk('shared.confirmedPill') : tk('shared.draftPill')} tone={fact.confirmation === 'confirmed' ? 'success' : 'warning'} />
            <Text className="text-xs font-semibold text-stone-500">{SOURCE_LABEL[fact.source] ?? fact.source}</Text>
          </View>
        ) : (
          <Text className="text-stone-500 text-sm mb-4 leading-5">
            {t('fact.newIntro')}
          </Text>
        )}
        {missing ? <Text className="text-warning text-sm mb-3">{missing}</Text> : null}
        <View className="bg-white border border-stone-100 rounded-2xl p-4">
          {factFields(type).map(({ field, spec, label }) => {
            const uncertain = fact?.uncertain[field];
            const error = errors[field];
            const value = current[field] ?? '';
            let control: React.ReactNode;
            if (spec.kind === 'boolean') {
              control = (
                <View className="flex-row items-center justify-between min-h-[44px] mb-4">
                  <Text className="text-sm font-medium text-stone-700 flex-1 me-3">{label}</Text>
                  <Switch
                    value={value === 'true'}
                    onValueChange={(on) => setField(field, on ? 'true' : '')}
                    accessibilityLabel={label}
                    trackColor={{ true: colors.brand[600] }}
                  />
                </View>
              );
            } else if (spec.kind === 'ref') {
              const options: { id: string; title: string }[] = [
                { id: '', title: t('fact.noLinkedRole') },
                ...experiences.map((role) => ({ id: role.id, title: factTitle('experience', role.value) })),
              ];
              control = (
                <View className="mb-4" accessibilityRole="radiogroup" accessibilityLabel={label}>
                  <Text className="text-sm font-medium text-stone-700 mb-1.5">{label}</Text>
                  {options.map((option) => {
                    const selected = value === option.id;
                    return (
                      <TouchableOpacity
                        key={option.id || 'none'}
                        onPress={() => setField(field, option.id)}
                        className={`flex-row items-center min-h-[44px] px-3 mb-2 rounded-xl border ${selected ? 'border-brand-600 bg-brand-50' : 'border-stone-200 bg-white'}`}
                        accessibilityRole="radio"
                        accessibilityState={{ selected, checked: selected }}
                      >
                        <View className={`w-4 h-4 rounded-full border me-3 ${selected ? 'border-brand-600 bg-brand-600' : 'border-stone-300'}`} />
                        <Text className="text-stone-800 flex-1" numberOfLines={2}>
                          {option.title}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                  {error ? <Text className="mt-1 text-xs text-red-500">{error}</Text> : null}
                </View>
              );
            } else {
              const long = spec.kind === 'longtext';
              control = (
                <Input
                  label={label}
                  value={value}
                  onChangeText={(text) => setField(field, text)}
                  error={error}
                  hint={fieldHint(spec)}
                  multiline={long}
                  textAlignVertical={long ? 'top' : undefined}
                  className={long ? 'min-h-[110px]' : undefined}
                  keyboardType={spec.kind === 'email' ? 'email-address' : spec.kind === 'url' ? 'url' : spec.kind === 'date' ? 'numbers-and-punctuation' : 'default'}
                  autoCapitalize={spec.kind === 'email' || spec.kind === 'url' ? 'none' : 'sentences'}
                  autoCorrect={spec.kind === 'email' || spec.kind === 'url' || spec.kind === 'date' ? false : undefined}
                  accessibilityLabel={label}
                />
              );
            }
            return (
              <View key={field}>
                {control}
                {uncertain ? <Text className="text-warning text-xs -mt-2 mb-4">{uncertainNote(uncertain.reason, uncertain.raw)}</Text> : null}
                {type === 'achievement' && field === 'metric' && achievementNeedsNumber(String(current.statement ?? ''), String(current.metric ?? '')) ? (
                  <Text className="text-stone-600 text-sm -mt-2 mb-4 leading-5" accessibilityRole="text" accessibilityLiveRegion="polite">
                    {t('web.achievement_prompt')}
                  </Text>
                ) : null}
              </View>
            );
          })}
          {extra ? <Text className="text-xs text-red-500">{extra}</Text> : null}
        </View>

        {fact ? (
          <View className="mt-4">
            <View className="flex-row gap-3">
              <View className="flex-1">
                <Button variant="outline" fullWidth onPress={() => setShowHistory((open) => !open)} accessibilityState={{ expanded: showHistory }}>
                  {showHistory ? t('fact.hideHistory') : t('fact.history')}
                </Button>
              </View>
              <View className="flex-1">
                <Button variant="outline" fullWidth onPress={() => onDelete(fact)} disabled={pending} loading={remove.isPending}>
                  {tc('delete')}
                </Button>
              </View>
            </View>
            {showHistory ? (
              <View className="bg-white border border-stone-100 rounded-2xl p-4 mt-3">
                {revisions.isLoading ? (
                  <ActivityIndicator color={colors.brand[600]} />
                ) : revisions.error ? (
                  <Text className="text-stone-500 text-sm">{careerErrorMessage(revisions.error, t('fact.historyFailed'))}</Text>
                ) : (revisions.data ?? []).length === 0 ? (
                  <Text className="text-stone-500 text-sm">{t('fact.noEarlier')}</Text>
                ) : (
                  (revisions.data ?? []).map((revision) => (
                    <View key={revision.revision} className="py-2 border-b border-stone-100">
                      <Text className="text-stone-800 text-sm font-semibold">{revisionLine(revision)}</Text>
                      {formatDay(revision.changedAt) ? <Text className="text-stone-500 text-xs mt-0.5">{formatDay(revision.changedAt)}</Text> : null}
                    </View>
                  ))
                )}
              </View>
            ) : null}
          </View>
        ) : null}
      </ScrollView>
    );
  }

  const ready = Boolean(type) && (isNew || Boolean(fact)) && !leave && access.data?.enabled === true;
  const canConfirm = isNew || fact?.confirmation === 'draft';
  const newKey = `careerProfile.fact.newTitle.${type ?? 'experience'}`;
  const title = isNew
    ? hasKey(newKey)
      ? t(`fact.newTitle.${type ?? 'experience'}`)
      : typeLabel(type ?? 'experience')
    : fact
      ? factTitle(fact.factType, fact.value)
      : t('fact.fallbackTitle');

  return (
    <SafeAreaView className="flex-1 bg-stone-50" edges={['top', 'bottom']}>
      <CareerHeader title={title} subtitle={dirty ? tk('shared.unsavedChanges') : fact ? typeLabel(fact.factType) : undefined} />
      <KeyboardAvoidingView className="flex-1" behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        {content}
        {ready ? (
          <View className="absolute bottom-0 start-0 end-0 bg-white border-t border-stone-100 px-5 py-3 flex-row gap-3">
            <View className="flex-1">
              <Button
                variant="outline"
                fullWidth
                disabled={pending || (!isNew && !dirty)}
                loading={(create.isPending || save.isPending) && !canConfirm}
                onPress={() => (fact ? submitExisting(fact, false) : submitNew(false))}
              >
                {tc('save')}
              </Button>
            </View>
            {canConfirm ? (
              <View className="flex-1">
                <Button fullWidth disabled={pending} loading={create.isPending || save.isPending} onPress={() => (fact ? submitExisting(fact, true) : submitNew(true))}>
                  {dirty || isNew ? t('fact.saveAndConfirm') : tk('shared.confirm')}
                </Button>
              </View>
            ) : null}
          </View>
        ) : null}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
