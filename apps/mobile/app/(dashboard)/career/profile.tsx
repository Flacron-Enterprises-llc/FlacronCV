import { Ionicons } from '@expo/vector-icons';
import { useRouter, type Href } from 'expo-router';
import React, { useState } from 'react';
import { Alert, FlatList, RefreshControl, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { CareerHeader, Pill } from '../../../src/components/career/CareerHeader';
import { Button } from '../../../src/components/ui/Button';
import { EmptyState } from '../../../src/components/ui/EmptyState';
import { ErrorState } from '../../../src/components/ui/ErrorState';
import { Input } from '../../../src/components/ui/Input';
import { Modal } from '../../../src/components/ui/Modal';
import { SkeletonCard } from '../../../src/components/ui/Skeleton';
import { useCareerProfile, useImportAllowance, useImportResume, useSetPreferences } from '../../../src/hooks/career/profile';
import { useCareerAccess, useCareerFacts, useFactActions } from '../../../src/hooks/useCareer';
import { useLeaveGuard } from '../../../src/hooks/useLeaveGuard';
import {
  allowanceLine,
  ARRANGEMENT_LABEL,
  checkImportText,
  checkPreferences,
  countsLine,
  FACT_TYPES,
  importFailure,
  missingSectionsLine,
  PAY_PERIODS,
  PERIOD_LABEL,
  preferenceErrorMessage,
  preferencesDraftsEqual,
  preferencesSummary,
  SCHEDULE_LABEL,
  SCHEDULES,
  SENIORITIES,
  SENIORITY_LABEL,
  toggle,
  toPreferencesDraft,
  typeLabel,
  WORK_ARRANGEMENTS,
  type ImportOutcome,
  type PreferencesDraft,
} from '../../../src/lib/career/profile';
import { careerErrorMessage, FACT_TYPE_LABEL, factSummary } from '../../../src/lib/career-view';
import { colors } from '../../../src/theme/colors';
import { fieldErrors } from '../../../../../packages/career-api-client/src/client';
import type { Fact, ImportAllowance } from '../../../../../packages/career-api-client/src/types';

/**
 * Career profile on mobile, matching the website's profile screen: the facts
 * drafts are built from (add, edit, confirm = consent, remove; history on the
 * fact screen), résumé import from pasted text with the daily allowance, and
 * the career preferences matching reads.
 */
export default function CareerProfileScreen() {
  const router = useRouter();
  const access = useCareerAccess();
  const facts = useCareerFacts();
  const profile = useCareerProfile();
  const allowance = useImportAllowance();
  const { confirm, remove } = useFactActions();
  const busy = confirm.isPending || remove.isPending;

  const [chooserOpen, setChooserOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [prefsOpen, setPrefsOpen] = useState(false);
  const [prefsDraft, setPrefsDraft] = useState<PreferencesDraft | null>(null);
  const prefsDirty = prefsOpen && prefsDraft !== null && !preferencesDraftsEqual(prefsDraft, toPreferencesDraft(profile.data?.preferences));
  const [importText, setImportText] = useState('');
  useLeaveGuard(prefsDirty || (importOpen && importText.trim().length > 0));

  const onConfirm = (fact: Fact) => {
    confirm.mutate(fact.id, {
      onError: (error) => Alert.alert('Not confirmed', careerErrorMessage(error, 'Could not confirm this fact. Nothing was changed.')),
    });
  };

  const onRemove = (fact: Fact) => {
    Alert.alert('Remove this fact?', 'Drafts already made keep their text. New drafts will no longer use it.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove',
        style: 'destructive',
        onPress: () =>
          remove.mutate(fact.id, {
            onError: (error) => Alert.alert('Not removed', careerErrorMessage(error, 'Could not remove this fact. Nothing was changed.')),
          }),
      },
    ]);
  };

  const openFact = (id: string) => router.push(`/(dashboard)/career/fact/${id}` as Href);
  const addFact = (type: string) => {
    setChooserOpen(false);
    router.push(`/(dashboard)/career/fact/new?type=${type}` as Href);
  };

  const body = () => {
    if (access.data && !access.data.enabled) {
      return <EmptyState icon="lock-closed-outline" title="Career tools are not included in your plan" description="Your FlacronCV CVs and letters are unchanged." />;
    }
    if (facts.isLoading || access.isLoading) {
      return (
        <View className="p-5">
          <SkeletonCard />
          <SkeletonCard />
        </View>
      );
    }
    if (facts.error || access.error) {
      return <ErrorState message={careerErrorMessage(facts.error ?? access.error, 'Could not load your career profile.')} onRetry={() => void facts.refetch()} />;
    }
    const items = facts.data?.items ?? [];
    const prefs = preferencesSummary(profile.data?.preferences);
    return (
      <FlatList
        data={items}
        keyExtractor={(f) => f.id}
        contentContainerStyle={{ padding: 20, paddingBottom: 40 }}
        refreshControl={
          <RefreshControl
            refreshing={facts.isRefetching}
            onRefresh={() => {
              void facts.refetch();
              void profile.refetch();
              void allowance.refetch();
            }}
            tintColor={colors.brand[600]}
          />
        }
        ListHeaderComponent={
          <View>
            <Text className="text-stone-500 text-sm mb-1 leading-5">
              Drafts use only confirmed facts. Confirming a fact means you agree it is accurate and may be used in your career drafts.
            </Text>
            {items.length > 0 ? <Text className="text-stone-700 text-sm font-semibold mb-4 leading-5">{countsLine(items)}</Text> : <View className="mb-4" />}

            <View className="bg-white border border-stone-100 rounded-2xl p-4 mb-3">
              <View className="flex-row items-center mb-1">
                <Ionicons name="document-text-outline" size={18} color={colors.stone[500]} />
                <Text className="font-bold text-stone-900 ml-2">Import a resume</Text>
              </View>
              <Text className="text-stone-500 text-sm leading-5">
                Paste your resume text; the facts it finds arrive as drafts for you to review. This does not use a document credit.
              </Text>
              <Text className="text-stone-700 text-sm mt-2">
                {allowance.data
                  ? allowanceLine(allowance.data)
                  : allowance.isLoading
                    ? 'Checking today’s imports…'
                    : careerErrorMessage(allowance.error, 'Could not check today’s imports.')}
              </Text>
              <View className="mt-3 self-start">
                <Button variant="outline" size="sm" onPress={() => setImportOpen(true)} disabled={!allowance.data || allowance.data.remaining <= 0}>
                  Paste resume text
                </Button>
              </View>
            </View>

            <Button fullWidth onPress={() => setChooserOpen(true)} icon={<Ionicons name="add" size={18} color={colors.white} />}>
              Add a fact
            </Button>
            <View className="h-4" />
            {items.length === 0 ? (
              <EmptyState icon="person-outline" title="No career facts yet" description="Add a fact yourself, or import a resume. An import does not use a document credit." />
            ) : null}
          </View>
        }
        ListFooterComponent={
          <View className="bg-white border border-stone-100 rounded-2xl p-4 mt-2">
            <Text className="font-bold text-stone-900 mb-1">Preferences</Text>
            {profile.isLoading ? (
              <Text className="text-stone-500 text-sm">Loading…</Text>
            ) : profile.error ? (
              <Text className="text-stone-500 text-sm">{careerErrorMessage(profile.error, 'Could not load your preferences.')}</Text>
            ) : prefs.length === 0 ? (
              <Text className="text-stone-500 text-sm leading-5">No preferences yet. Matching uses your target roles, locations and how you want to work.</Text>
            ) : (
              prefs.map((line) => (
                <Text key={line} className="text-stone-700 text-sm leading-5">
                  {line}
                </Text>
              ))
            )}
            <View className="mt-3 self-start">
              <Button
                variant="outline"
                size="sm"
                disabled={!profile.data}
                onPress={() => {
                  setPrefsDraft(toPreferencesDraft(profile.data?.preferences));
                  setPrefsOpen(true);
                }}
              >
                Edit preferences
              </Button>
            </View>
          </View>
        }
        renderItem={({ item }) => {
          const { title, detail } = factSummary(item.factType, item.value as unknown as Record<string, unknown>);
          const confirmed = item.confirmation === 'confirmed';
          const uncertain = Object.keys(item.uncertain ?? {}).length > 0;
          return (
            <View className="bg-white border border-stone-100 rounded-2xl p-4 mb-3">
              <TouchableOpacity onPress={() => openFact(item.id)} accessibilityRole="button" accessibilityLabel={`Edit ${title}`} accessibilityHint="Opens the fact to edit it">
                <View className="flex-row items-center justify-between mb-1">
                  <Text className="text-xs font-semibold text-stone-500 uppercase tracking-wide">{FACT_TYPE_LABEL[item.factType] ?? item.factType}</Text>
                  <Pill label={confirmed ? 'CONFIRMED' : 'DRAFT'} tone={confirmed ? 'success' : 'warning'} />
                </View>
                <Text className="font-bold text-stone-900">{title}</Text>
                {detail ? <Text className="text-stone-500 text-sm mt-0.5">{detail}</Text> : null}
                {item.missingFields.length > 0 ? <Text className="text-warning text-xs mt-2">{`Missing: ${item.missingFields.join(', ')}`}</Text> : null}
                {uncertain ? <Text className="text-warning text-xs mt-1">Some fields need checking.</Text> : null}
              </TouchableOpacity>
              <View className="flex-row mt-3 gap-2">
                {!confirmed ? (
                  <TouchableOpacity
                    disabled={busy || item.missingFields.length > 0}
                    onPress={() => onConfirm(item)}
                    className={`px-4 min-h-[44px] justify-center rounded-xl ${item.missingFields.length > 0 ? 'bg-stone-100' : 'bg-brand-600'}`}
                    accessibilityRole="button"
                    accessibilityLabel={`Confirm ${title}`}
                    accessibilityState={{ disabled: busy || item.missingFields.length > 0 }}
                  >
                    <Text className={item.missingFields.length > 0 ? 'text-stone-400 font-semibold' : 'text-white font-semibold'}>Confirm</Text>
                  </TouchableOpacity>
                ) : null}
                <TouchableOpacity
                  onPress={() => openFact(item.id)}
                  className="px-4 min-h-[44px] justify-center rounded-xl border border-stone-200"
                  accessibilityRole="button"
                  accessibilityLabel={`Edit ${title}`}
                >
                  <Text className="text-stone-700 font-semibold">Edit</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  disabled={busy}
                  onPress={() => onRemove(item)}
                  className="px-4 min-h-[44px] justify-center rounded-xl border border-stone-200"
                  accessibilityRole="button"
                  accessibilityLabel={`Remove ${title}`}
                >
                  <Text className="text-stone-700 font-semibold">Remove</Text>
                </TouchableOpacity>
              </View>
            </View>
          );
        }}
      />
    );
  };

  return (
    <SafeAreaView className="flex-1 bg-stone-50" edges={['top', 'bottom']}>
      <CareerHeader title="Career profile" subtitle="The facts your career drafts are built from" />
      {body()}

      <Modal visible={chooserOpen} onClose={() => setChooserOpen(false)} title="Add a fact" size="lg">
        <Text className="text-stone-500 text-sm mb-3">Choose the fact type.</Text>
        {FACT_TYPES.map((type) => (
          <TouchableOpacity
            key={type}
            onPress={() => addFact(type)}
            className="flex-row items-center justify-between min-h-[48px] px-4 mb-2 rounded-xl border border-stone-200 bg-white"
            accessibilityRole="button"
            accessibilityLabel={`Add ${typeLabel(type)}`}
          >
            <Text className="text-stone-800 font-semibold">{typeLabel(type)}</Text>
            <Ionicons name="chevron-forward" size={18} color={colors.stone[400]} />
          </TouchableOpacity>
        ))}
        <View className="h-6" />
      </Modal>

      <ImportSheet visible={importOpen} text={importText} onText={setImportText} onClose={() => setImportOpen(false)} allowance={allowance.data} />

      {prefsDraft ? (
        <PreferencesSheet
          visible={prefsOpen}
          draft={prefsDraft}
          dirty={prefsDirty}
          onChange={setPrefsDraft}
          onClose={() => {
            setPrefsOpen(false);
            setPrefsDraft(null);
          }}
        />
      ) : null}
    </SafeAreaView>
  );
}

function ImportSheet({
  visible,
  text,
  onText,
  onClose,
  allowance,
}: {
  visible: boolean;
  text: string;
  onText: (text: string) => void;
  onClose: () => void;
  allowance: ImportAllowance | undefined;
}) {
  const run = useImportResume();
  const [problem, setProblem] = useState<ImportOutcome | null>(null);
  const [inputError, setInputError] = useState<string | null>(null);

  const close = () => {
    if (run.isPending) return;
    setProblem(null);
    setInputError(null);
    onClose();
  };

  const submit = () => {
    const checked = checkImportText(text);
    if (!checked.ok) {
      setInputError(checked.message);
      return;
    }
    setInputError(null);
    setProblem(null);
    run.mutate(checked.text, {
      onSuccess: (result) => {
        onText('');
        setProblem(null);
        onClose();
        const missing = missingSectionsLine(result.missing);
        Alert.alert(
          result.facts.length === 1 ? '1 fact imported' : `${result.facts.length} facts imported`,
          ['They are drafts: review and confirm each one before your drafts use it.', missing].filter(Boolean).join('\n\n'),
        );
      },
      onError: (error) => {
        const fields = fieldErrors(error);
        if (fields.some((f) => f.field === 'text')) {
          setInputError(fields[0]?.reason === 'too_long' ? 'That text is too long. Paste at most 100,000 characters.' : 'Paste the text of your resume first.');
          return;
        }
        setProblem(importFailure(error, allowance));
      },
    });
  };

  const shown = allowance && problem?.kind === 'limit' ? { ...allowance, limit: problem.limit, remaining: 0, resetsAt: problem.resetsAt || allowance.resetsAt } : allowance;
  const limited = shown !== undefined && shown.remaining <= 0;
  return (
    <Modal visible={visible} onClose={close} title="Import a resume" size="full" closeDisabled={run.isPending}>
      <Text className="text-stone-500 text-sm leading-5 mb-2">This does not use a document credit. Nothing is added until the import finishes.</Text>
      {shown ? <Text className="text-stone-700 text-sm mb-3">{allowanceLine(shown)}</Text> : null}
      {problem && problem.kind !== 'limit' ? (
        <View className={`${problem.kind === 'unavailable' ? 'bg-warning-bg' : 'bg-error-bg'} rounded-xl p-3 mb-3`} accessibilityRole="alert">
          <Text className={`${problem.kind === 'unavailable' ? 'text-warning' : 'text-error'} font-semibold`}>{problem.title}</Text>
          <Text className="text-stone-700 text-sm mt-1 leading-5">{problem.body}</Text>
        </View>
      ) : null}
      <TextInput
        value={text}
        onChangeText={(next) => {
          onText(next);
          if (inputError) setInputError(null);
        }}
        multiline
        textAlignVertical="top"
        placeholder="Paste the text of your resume here"
        placeholderTextColor={colors.stone[400]}
        accessibilityLabel="Resume text"
        editable={!run.isPending}
        className={`bg-white border ${inputError ? 'border-red-400' : 'border-stone-200'} rounded-xl px-3 py-3 text-base text-stone-900 min-h-[220px]`}
      />
      {inputError ? (
        <Text className="mt-1 text-xs text-red-500">{inputError}</Text>
      ) : (
        <Text className="mt-1 text-xs text-stone-400">{`${text.length.toLocaleString('en-US')} characters`}</Text>
      )}
      <View className="mt-4 mb-8">
        <Button fullWidth onPress={submit} loading={run.isPending} disabled={limited || text.trim().length === 0}>
          Import
        </Button>
      </View>
    </Modal>
  );
}

function Chip({ label, selected, onPress, radio = false }: { label: string; selected: boolean; onPress: () => void; radio?: boolean }) {
  return (
    <TouchableOpacity
      onPress={onPress}
      className={`px-4 min-h-[44px] justify-center rounded-full border ${selected ? 'border-brand-600 bg-brand-50' : 'border-stone-200 bg-white'}`}
      accessibilityRole={radio ? 'radio' : 'checkbox'}
      accessibilityState={radio ? { selected, checked: selected } : { checked: selected }}
    >
      <Text className={selected ? 'text-brand-700 font-semibold' : 'text-stone-700'}>{label}</Text>
    </TouchableOpacity>
  );
}

function PreferencesSheet({
  visible,
  draft,
  dirty,
  onChange,
  onClose,
}: {
  visible: boolean;
  draft: PreferencesDraft;
  dirty: boolean;
  onChange: (next: PreferencesDraft) => void;
  onClose: () => void;
}) {
  const save = useSetPreferences();
  const [error, setError] = useState<string | null>(null);
  const set = (patch: Partial<PreferencesDraft>) => {
    onChange({ ...draft, ...patch });
    if (error) setError(null);
  };

  const close = () => {
    if (save.isPending) return;
    if (!dirty) {
      onClose();
      return;
    }
    Alert.alert('Discard changes?', 'Your preference changes are not saved.', [
      { text: 'Keep editing', style: 'cancel' },
      { text: 'Discard', style: 'destructive', onPress: onClose },
    ]);
  };

  const submit = () => {
    const checked = checkPreferences(draft);
    if (!checked.ok) {
      setError(checked.message);
      return;
    }
    setError(null);
    save.mutate(checked.value, {
      onSuccess: () => onClose(),
      onError: (failure) => {
        const fields = fieldErrors(failure);
        setError(fields.length > 0 ? preferenceErrorMessage(fields[0].field) : careerErrorMessage(failure, 'Your preferences were not saved. Try again.'));
      },
    });
  };

  return (
    <Modal visible={visible} onClose={close} title="Preferences" size="full" closeDisabled={save.isPending}>
      <Input label="Target roles" hint="Separate items with commas" value={draft.targetRoles} onChangeText={(v) => set({ targetRoles: v })} />
      <Input label="Locations" hint="Separate items with commas" value={draft.locations} onChangeText={(v) => set({ locations: v })} />

      <Text className="text-sm font-medium text-stone-700 mb-1.5">Work arrangement</Text>
      <View className="flex-row flex-wrap gap-2 mb-4">
        {WORK_ARRANGEMENTS.map((item) => (
          <Chip key={item} label={ARRANGEMENT_LABEL[item]} selected={draft.arrangements.includes(item)} onPress={() => set({ arrangements: toggle(draft.arrangements, item) })} />
        ))}
      </View>

      <Text className="text-sm font-medium text-stone-700 mb-1.5">Schedule</Text>
      <View className="flex-row flex-wrap gap-2 mb-4">
        {SCHEDULES.map((item) => (
          <Chip key={item} label={SCHEDULE_LABEL[item]} selected={draft.schedules.includes(item)} onPress={() => set({ schedules: toggle(draft.schedules, item) })} />
        ))}
      </View>

      <Text className="text-sm font-medium text-stone-700 mb-1.5">Seniority</Text>
      <View className="flex-row flex-wrap gap-2 mb-4" accessibilityRole="radiogroup">
        <Chip radio label="No preference" selected={draft.seniority === null} onPress={() => set({ seniority: null })} />
        {SENIORITIES.map((item) => (
          <Chip radio key={item} label={SENIORITY_LABEL[item]} selected={draft.seniority === item} onPress={() => set({ seniority: item })} />
        ))}
      </View>

      <View className="flex-row gap-3">
        <View className="flex-1">
          <Input label="Minimum pay" keyboardType="number-pad" value={draft.amount} onChangeText={(v) => set({ amount: v })} />
        </View>
        <View className="w-28">
          <Input label="Currency" autoCapitalize="characters" maxLength={3} placeholder="USD" value={draft.currency} onChangeText={(v) => set({ currency: v })} />
        </View>
      </View>
      <Text className="text-sm font-medium text-stone-700 mb-1.5">Pay period</Text>
      <View className="flex-row flex-wrap gap-2 mb-4" accessibilityRole="radiogroup">
        {PAY_PERIODS.map((item) => (
          <Chip radio key={item} label={PERIOD_LABEL[item]} selected={draft.period === item} onPress={() => set({ period: item })} />
        ))}
      </View>

      <Input label="Learning hours a week" keyboardType="number-pad" value={draft.hours} onChangeText={(v) => set({ hours: v })} />
      <Input label="Career goals" multiline textAlignVertical="top" className="min-h-[90px]" value={draft.goals} onChangeText={(v) => set({ goals: v })} />

      {error ? (
        <Text className="text-sm text-red-500 mb-3" accessibilityRole="alert">
          {error}
        </Text>
      ) : null}
      <View className="mb-10">
        <Button fullWidth onPress={submit} loading={save.isPending} disabled={!dirty}>
          Save preferences
        </Button>
      </View>
    </Modal>
  );
}
