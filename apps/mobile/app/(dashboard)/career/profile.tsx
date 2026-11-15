import { Ionicons } from '@expo/vector-icons';
import * as DocumentPicker from 'expo-document-picker';
import { File as DeviceFile } from 'expo-file-system';
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
  extractResumeFile,
  FACT_TYPES,
  importFailure,
  missingSectionsLine,
  PAY_PERIODS,
  PERIOD_LABEL,
  preferenceErrorMessage,
  preferencesDraftsEqual,
  preferencesSummary,
  RESUME_PICKER_TYPES,
  resumeFileErrorMessage,
  ResumeFileError,
  SCHEDULE_LABEL,
  SCHEDULES,
  SENIORITIES,
  SENIORITY_LABEL,
  toggle,
  toPreferencesDraft,
  typeLabel,
  WORK_ARRANGEMENTS,
  type ExtractedResumeFile,
  type ImportOutcome,
  type PreferencesDraft,
} from '../../../src/lib/career/profile';
import { careerErrorMessage, FACT_TYPE_LABEL, factSummary } from '../../../src/lib/career-view';
import { formatNumber, useT } from '../../../src/i18n';
import { RTL_FLIP } from '../../../src/i18n/native';
import { colors } from '../../../src/theme/colors';
import { fieldErrors } from '../../../../../packages/career-api-client/src/client';
import type { Fact, ImportAllowance } from '../../../../../packages/career-api-client/src/types';

/**
 * Career profile on mobile, matching the website's profile screen: the facts
 * drafts are built from (add, edit, confirm = consent, remove; history on the
 * fact screen), résumé import from pasted text or a Word / text file with the
 * daily allowance, and the career preferences matching reads. As on the web,
 * a file is read on the device and only its text is sent; PDF needs a text
 * engine the phone does not have, so it is explained instead.
 */
export default function CareerProfileScreen() {
  const router = useRouter();
  const t = useT('careerProfile');
  const tk = useT('career');
  const tc = useT('common');
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
      onError: (error) => Alert.alert(tk('shared.notConfirmed'), careerErrorMessage(error, t('screen.confirmFailed'))),
    });
  };

  const onRemove = (fact: Fact) => {
    Alert.alert(t('screen.removeTitle'), tk('shared.keepsTextNote'), [
      { text: tc('cancel'), style: 'cancel' },
      {
        text: tc('remove'),
        style: 'destructive',
        onPress: () =>
          remove.mutate(fact.id, {
            onError: (error) => Alert.alert(tk('shared.notRemoved'), careerErrorMessage(error, t('screen.removeFailed'))),
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
      return <EmptyState icon="lock-closed-outline" title={tk('shared.notIncluded')} description={tk('shared.v1Unchanged')} />;
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
      return <ErrorState message={careerErrorMessage(facts.error ?? access.error, t('screen.loadFailed'))} onRetry={() => void facts.refetch()} />;
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
              {t('screen.intro')}
            </Text>
            {items.length > 0 ? <Text className="text-stone-700 text-sm font-semibold mb-4 leading-5">{countsLine(items)}</Text> : <View className="mb-4" />}

            <View className="bg-white border border-stone-100 rounded-2xl p-4 mb-3">
              <View className="flex-row items-center mb-1">
                <Ionicons name="document-text-outline" size={18} color={colors.stone[500]} />
                <Text className="font-bold text-stone-900 ms-2">{t('import.title')}</Text>
              </View>
              <Text className="text-stone-500 text-sm leading-5">
                {[t('import.cardBody'), t('import.cardFileNote')].join(' ')}
              </Text>
              <Text className="text-stone-700 text-sm mt-2">
                {allowance.data
                  ? allowanceLine(allowance.data)
                  : allowance.isLoading
                    ? t('import.checking')
                    : careerErrorMessage(allowance.error, t('import.checkFailed'))}
              </Text>
              <View className="mt-3 self-start">
                <Button variant="outline" size="sm" onPress={() => setImportOpen(true)} disabled={!allowance.data || allowance.data.remaining <= 0}>
                  {t('import.paste')}
                </Button>
              </View>
            </View>

            <Button fullWidth onPress={() => setChooserOpen(true)} icon={<Ionicons name="add" size={18} color={colors.white} />}>
              {t('screen.addFact')}
            </Button>
            <View className="h-4" />
            {items.length === 0 ? (
              <EmptyState icon="person-outline" title={t('screen.emptyTitle')} description={t('screen.emptyBody')} />
            ) : null}
          </View>
        }
        ListFooterComponent={
          <View>
          <View className="bg-white border border-stone-100 rounded-2xl p-4 mt-2">
            <Text className="font-bold text-stone-900 mb-1">{t('screen.prefsTitle')}</Text>
            {profile.isLoading ? (
              <Text className="text-stone-500 text-sm">{tc('loading')}</Text>
            ) : profile.error ? (
              <Text className="text-stone-500 text-sm">{careerErrorMessage(profile.error, t('screen.prefsLoadFailed'))}</Text>
            ) : prefs.length === 0 ? (
              <Text className="text-stone-500 text-sm leading-5">{t('screen.prefsEmpty')}</Text>
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
                {t('screen.editPrefs')}
              </Button>
            </View>
          </View>
          <LinkCard
            title={t('web.sharing_title')}
            body={t('web.sharing_body')}
            link={t('web.sharing_link')}
            onPress={() => router.push('/(dashboard)/career/portfolios' as Href)}
          />
          <LinkCard
            title={t('web.mode_title')}
            body={t('web.mode_body')}
            link={t('web.mode_link')}
            onPress={() => router.push('/(dashboard)/career/relocation' as Href)}
          />
          </View>
        }
        renderItem={({ item }) => {
          const { title, detail } = factSummary(item.factType, item.value as unknown as Record<string, unknown>);
          const confirmed = item.confirmation === 'confirmed';
          const uncertain = Object.keys(item.uncertain ?? {}).length > 0;
          return (
            <View className="bg-white border border-stone-100 rounded-2xl p-4 mb-3">
              <TouchableOpacity onPress={() => openFact(item.id)} accessibilityRole="button" accessibilityLabel={t('screen.editA11y', { title })} accessibilityHint={t('screen.editHint')}>
                <View className="flex-row items-center justify-between mb-1">
                  <Text className="text-xs font-semibold text-stone-500 uppercase tracking-wide">{FACT_TYPE_LABEL[item.factType] ?? item.factType}</Text>
                  <Pill label={confirmed ? tk('shared.confirmedPill') : tk('shared.draftPill')} tone={confirmed ? 'success' : 'warning'} />
                </View>
                <Text className="font-bold text-stone-900">{title}</Text>
                {detail ? <Text className="text-stone-500 text-sm mt-0.5">{detail}</Text> : null}
                {item.missingFields.length > 0 ? <Text className="text-warning text-xs mt-2">{t('screen.missing', { fields: item.missingFields.join(', ') })}</Text> : null}
                {uncertain ? <Text className="text-warning text-xs mt-1">{t('screen.uncertain')}</Text> : null}
              </TouchableOpacity>
              <View className="flex-row mt-3 gap-2">
                {!confirmed ? (
                  <TouchableOpacity
                    disabled={busy || item.missingFields.length > 0}
                    onPress={() => onConfirm(item)}
                    className={`px-4 min-h-[44px] justify-center rounded-xl ${item.missingFields.length > 0 ? 'bg-stone-100' : 'bg-brand-600'}`}
                    accessibilityRole="button"
                    accessibilityLabel={t('screen.confirmA11y', { title })}
                    accessibilityState={{ disabled: busy || item.missingFields.length > 0 }}
                  >
                    <Text className={item.missingFields.length > 0 ? 'text-stone-400 font-semibold' : 'text-white font-semibold'}>{tk('shared.confirm')}</Text>
                  </TouchableOpacity>
                ) : null}
                <TouchableOpacity
                  onPress={() => openFact(item.id)}
                  className="px-4 min-h-[44px] justify-center rounded-xl border border-stone-200"
                  accessibilityRole="button"
                  accessibilityLabel={t('screen.editA11y', { title })}
                >
                  <Text className="text-stone-700 font-semibold">{tk('shared.edit')}</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  disabled={busy}
                  onPress={() => onRemove(item)}
                  className="px-4 min-h-[44px] justify-center rounded-xl border border-stone-200"
                  accessibilityRole="button"
                  accessibilityLabel={t('screen.removeA11y', { title })}
                >
                  <Text className="text-stone-700 font-semibold">{tc('remove')}</Text>
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
      <CareerHeader title={t('screen.title')} subtitle={t('screen.subtitle')} />
      {body()}

      <Modal visible={chooserOpen} onClose={() => setChooserOpen(false)} title={t('screen.addFact')} size="lg">
        <Text className="text-stone-500 text-sm mb-3">{t('chooser.body')}</Text>
        {FACT_TYPES.map((type) => (
          <TouchableOpacity
            key={type}
            onPress={() => addFact(type)}
            className="flex-row items-center justify-between min-h-[48px] px-4 mb-2 rounded-xl border border-stone-200 bg-white"
            accessibilityRole="button"
            accessibilityLabel={t('chooser.addA11y', { type: typeLabel(type) })}
          >
            <Text className="text-stone-800 font-semibold">{typeLabel(type)}</Text>
            <Ionicons name="chevron-forward" size={18} color={colors.stone[400]} style={RTL_FLIP} />
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
  const t = useT('careerProfile');
  const [problem, setProblem] = useState<ImportOutcome | null>(null);
  const [inputError, setInputError] = useState<string | null>(null);
  // Text read from a file; sent with its name and format while the box still holds exactly that text.
  const [fromFile, setFromFile] = useState<ExtractedResumeFile | null>(null);
  const [reading, setReading] = useState(false);
  const fileApplies = fromFile !== null && fromFile.text === text;

  const close = () => {
    if (run.isPending || reading) return;
    setProblem(null);
    setInputError(null);
    onClose();
  };

  const pickFile = async () => {
    setInputError(null);
    setProblem(null);
    let asset: DocumentPicker.DocumentPickerAsset | undefined;
    try {
      const picked = await DocumentPicker.getDocumentAsync({ type: RESUME_PICKER_TYPES, copyToCacheDirectory: true, multiple: false });
      if (picked.canceled) return;
      asset = picked.assets[0];
    } catch {
      setInputError(resumeFileErrorMessage('failed'));
      return;
    }
    if (!asset) return;
    const uri = asset.uri;
    setReading(true);
    try {
      const extracted = await extractResumeFile(
        { name: asset.name, mimeType: asset.mimeType, size: asset.size },
        { bytes: () => new DeviceFile(uri).bytes(), text: () => new DeviceFile(uri).text() },
      );
      onText(extracted.text);
      setFromFile(extracted);
    } catch (error) {
      setInputError(resumeFileErrorMessage(error instanceof ResumeFileError ? error.code : 'failed'));
    } finally {
      setReading(false);
    }
  };

  const submit = () => {
    const checked = checkImportText(text);
    if (!checked.ok) {
      setInputError(checked.message);
      return;
    }
    setInputError(null);
    setProblem(null);
    const input =
      fromFile && fromFile.text === checked.text
        ?{ text: checked.text, fileName: fromFile.fileName, format: fromFile.format }
        : checked.text;
    run.mutate(input, {
      onSuccess: (result) => {
        onText('');
        setFromFile(null);
        setProblem(null);
        onClose();
        const missing = missingSectionsLine(result.missing);
        Alert.alert(
          t('import.imported', { count: result.facts.length }),
          [t('import.importedBody'), missing].filter(Boolean).join('\n\n'),
        );
      },
      onError: (error) => {
        const fields = fieldErrors(error);
        if (fields.some((f) => f.field === 'text')) {
          setInputError(fields[0]?.reason === 'too_long' ? t('import.tooLong') : t('import.empty'));
          return;
        }
        setProblem(importFailure(error, allowance));
      },
    });
  };

  const shown = allowance && problem?.kind === 'limit' ? { ...allowance, limit: problem.limit, remaining: 0, resetsAt: problem.resetsAt || allowance.resetsAt } : allowance;
  const limited = shown !== undefined && shown.remaining <= 0;
  return (
    <Modal visible={visible} onClose={close} title={t('import.title')} size="full" closeDisabled={run.isPending || reading}>
      <Text className="text-stone-500 text-sm leading-5 mb-2">{t('import.sheetBody')}</Text>
      {shown ? <Text className="text-stone-700 text-sm mb-3">{allowanceLine(shown)}</Text> : null}
      {problem && problem.kind !== 'limit' ? (
        <View className={`${problem.kind === 'unavailable' ? 'bg-warning-bg' : 'bg-error-bg'} rounded-xl p-3 mb-3`} accessibilityRole="alert">
          <Text className={`${problem.kind === 'unavailable' ? 'text-warning' : 'text-error'} font-semibold`}>{problem.title}</Text>
          <Text className="text-stone-700 text-sm mt-1 leading-5">{problem.body}</Text>
        </View>
      ) : null}
      <View className="self-start">
        <Button
          variant="outline"
          size="sm"
          className="min-h-[44px]"
          onPress={() => void pickFile()}
          loading={reading}
          disabled={run.isPending || reading || limited}
          icon={<Ionicons name="document-attach-outline" size={18} color={colors.stone[700]} />}
        >
          {t('import.file.choose')}
        </Button>
      </View>
      <Text className="text-stone-400 text-xs mt-1 mb-3 leading-4">{t('import.file.hint')}</Text>
      {fileApplies && fromFile?.fileName ? (
        <Text className="text-stone-700 text-sm mb-2 leading-5">{t('import.file.readFrom', { name: fromFile.fileName })}</Text>
      ) : null}
      <TextInput
        value={text}
        onChangeText={(next) => {
          onText(next);
          if (inputError) setInputError(null);
        }}
        multiline
        textAlignVertical="top"
        placeholder={t('import.placeholder')}
        placeholderTextColor={colors.stone[400]}
        accessibilityLabel={t('import.textA11y')}
        editable={!run.isPending && !reading}
        className={`bg-white border ${inputError ? 'border-red-400' : 'border-stone-200'} rounded-xl px-3 py-3 text-base text-stone-900 min-h-[220px]`}
      />
      {inputError ? (
        <Text className="mt-1 text-xs text-red-500" accessibilityRole="alert">
          {inputError}
        </Text>
      ) : (
        <Text className="mt-1 text-xs text-stone-400">{t('import.characters', { count: formatNumber(text.length) })}</Text>
      )}
      <View className="mt-4 mb-8">
        <Button fullWidth onPress={submit} loading={run.isPending} disabled={limited || reading || text.trim().length === 0}>
          {t('import.submit')}
        </Button>
      </View>
    </Modal>
  );
}

/** Website profile cards "Sharing and portfolio" and "Career mode": both are part of this version. */
function LinkCard({ title, body, link, onPress }: { title: string; body: string; link: string; onPress: () => void }) {
  return (
    <View className="bg-white border border-stone-100 rounded-2xl p-4 mt-3">
      <Text className="font-bold text-stone-900 mb-1" accessibilityRole="header">
        {title}
      </Text>
      <Text className="text-stone-500 text-sm leading-5">{body}</Text>
      <TouchableOpacity onPress={onPress} className="min-h-[44px] flex-row items-center self-start" accessibilityRole="link">
        <Text className="text-brand-600 font-semibold text-sm me-1">{link}</Text>
        <Ionicons name="chevron-forward" size={16} color={colors.brand[600]} style={RTL_FLIP} />
      </TouchableOpacity>
    </View>
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
  const t = useT('careerProfile');
  const tk = useT('career');
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
    Alert.alert(tk('shared.discardChanges'), t('prefs.discardBody'), [
      { text: tk('shared.keepEditing'), style: 'cancel' },
      { text: tk('shared.discard'), style: 'destructive', onPress: onClose },
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
        setError(fields.length > 0 ? preferenceErrorMessage(fields[0].field) : careerErrorMessage(failure, t('prefs.saveFailed')));
      },
    });
  };

  return (
    <Modal visible={visible} onClose={close} title={t('screen.prefsTitle')} size="full" closeDisabled={save.isPending}>
      <Input label={t('prefFields.targetRoles')} hint={t('hints.list')} value={draft.targetRoles} onChangeText={(v) => set({ targetRoles: v })} />
      <Input label={t('prefFields.locations')} hint={t('hints.list')} value={draft.locations} onChangeText={(v) => set({ locations: v })} />

      <Text className="text-sm font-medium text-stone-700 mb-1.5">{t('prefFields.arrangements')}</Text>
      <View className="flex-row flex-wrap gap-2 mb-4">
        {WORK_ARRANGEMENTS.map((item) => (
          <Chip key={item} label={ARRANGEMENT_LABEL[item]} selected={draft.arrangements.includes(item)} onPress={() => set({ arrangements: toggle(draft.arrangements, item) })} />
        ))}
      </View>

      <Text className="text-sm font-medium text-stone-700 mb-1.5">{t('prefFields.schedules')}</Text>
      <View className="flex-row flex-wrap gap-2 mb-4">
        {SCHEDULES.map((item) => (
          <Chip key={item} label={SCHEDULE_LABEL[item]} selected={draft.schedules.includes(item)} onPress={() => set({ schedules: toggle(draft.schedules, item) })} />
        ))}
      </View>

      <Text className="text-sm font-medium text-stone-700 mb-1.5">{t('prefFields.seniority')}</Text>
      <View className="flex-row flex-wrap gap-2 mb-4" accessibilityRole="radiogroup">
        <Chip radio label={t('prefs.noPreference')} selected={draft.seniority === null} onPress={() => set({ seniority: null })} />
        {SENIORITIES.map((item) => (
          <Chip radio key={item} label={SENIORITY_LABEL[item]} selected={draft.seniority === item} onPress={() => set({ seniority: item })} />
        ))}
      </View>

      <View className="flex-row gap-3">
        <View className="flex-1">
          <Input label={t('prefFields.minimumPay')} keyboardType="number-pad" value={draft.amount} onChangeText={(v) => set({ amount: v })} />
        </View>
        <View className="w-28">
          <Input label={t('prefs.currency')} autoCapitalize="characters" maxLength={3} placeholder="USD" value={draft.currency} onChangeText={(v) => set({ currency: v })} />
        </View>
      </View>
      <Text className="text-sm font-medium text-stone-700 mb-1.5">{t('prefs.period')}</Text>
      <View className="flex-row flex-wrap gap-2 mb-4" accessibilityRole="radiogroup">
        {PAY_PERIODS.map((item) => (
          <Chip radio key={item} label={PERIOD_LABEL[item]} selected={draft.period === item} onPress={() => set({ period: item })} />
        ))}
      </View>

      <Input label={t('prefFields.learningHoursPerWeek')} keyboardType="number-pad" value={draft.hours} onChangeText={(v) => set({ hours: v })} />
      <Input label={t('prefFields.careerGoals')} multiline textAlignVertical="top" className="min-h-[90px]" value={draft.goals} onChangeText={(v) => set({ goals: v })} />

      {error ? (
        <Text className="text-sm text-red-500 mb-3" accessibilityRole="alert">
          {error}
        </Text>
      ) : null}
      <View className="mb-10">
        <Button fullWidth onPress={submit} loading={save.isPending} disabled={!dirty}>
          {t('prefs.save')}
        </Button>
      </View>
    </Modal>
  );
}
