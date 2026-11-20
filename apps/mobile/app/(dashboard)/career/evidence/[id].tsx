import { Ionicons } from '@expo/vector-icons';
import * as DocumentPicker from 'expo-document-picker';
import * as ImagePicker from 'expo-image-picker';
import { useLocalSearchParams, useRouter, type Href } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import React, { useEffect, useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, ScrollView, Switch, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { CareerHeader, Pill } from '../../../../src/components/career/CareerHeader';
import { Button } from '../../../../src/components/ui/Button';
import { EmptyState } from '../../../../src/components/ui/EmptyState';
import { ErrorState } from '../../../../src/components/ui/ErrorState';
import { Input } from '../../../../src/components/ui/Input';
import { SkeletonCard } from '../../../../src/components/ui/Skeleton';
import { UploadRefused, useEvidenceActions, useEvidenceGate, useEvidenceItem } from '../../../../src/hooks/career/evidence';
import { useCareerAccess, useCareerFacts } from '../../../../src/hooks/useCareer';
import { factTitle } from '../../../../src/lib/career/profile';
import { useLeaveGuard } from '../../../../src/hooks/useLeaveGuard';
import {
  EMPTY_EVIDENCE_FORM,
  EVIDENCE_LIMITS,
  EVIDENCE_PICKER_TYPES,
  EVIDENCE_TYPE_OPTIONS,
  evidenceFileErrorMessage,
  evidenceFormDirty,
  evidenceLabelLimit,
  evidenceLabelView,
  evidenceSaveErrorMessage,
  toggleFactId,
  verificationRows,
  evidenceTypeLabel,
  formatBytes,
  formFromEvidence,
  planFileUpload,
  planImageUpload,
  toCreateEvidenceInput,
  toUpdateEvidenceInput,
  validateEvidenceForm,
  type EvidenceForm,
  type EvidenceFormErrors,
  type UploadPlan,
} from '../../../../src/lib/career/evidence';
import { careerErrorMessage } from '../../../../src/lib/career-view';
import { colors } from '../../../../src/theme/colors';
import { useT } from '../../../../src/i18n';
import type { CareerEvidence } from '../../../../../../packages/career-api-client/src/types';

/**
 * One evidence item: create (route id "new") or edit, delete, and its private
 * file (attach a photo or a PDF / Word / image file, open through a
 * five-minute link, replace, remove). Same fields, file types and 10 MiB
 * limit as the website and the API.
 */
export default function EvidenceItemScreen() {
  const { id: rawId } = useLocalSearchParams<{ id: string }>();
  const id = typeof rawId === 'string' ? rawId : undefined;
  const isNew = id === 'new';
  const router = useRouter();
  const access = useCareerAccess();
  const gate = useEvidenceGate();
  const item = useEvidenceItem(isNew ? undefined : id);
  const actions = useEvidenceActions();
  const facts = useCareerFacts();
  const t = useT('careerEvidence');
  const tc = useT('common');

  const [form, setForm] = useState<EvidenceForm | null>(null);
  const [errors, setErrors] = useState<EvidenceFormErrors>({});
  const [leaveTo, setLeaveTo] = useState<{ kind: 'replace'; href: Href } | { kind: 'back' } | null>(null);

  const base = item.data ? formFromEvidence(item.data) : EMPTY_EVIDENCE_FORM;
  const current = form ?? base;
  const dirty = form !== null && evidenceFormDirty(form, base);
  useLeaveGuard(dirty);

  // Navigate only after the unsaved state is cleared, so the leave guard does not ask.
  useEffect(() => {
    if (!leaveTo || dirty) return;
    if (leaveTo.kind === 'back') router.back();
    else router.replace(leaveTo.href);
    setLeaveTo(null);
  }, [leaveTo, dirty, router]);

  const set = <K extends keyof EvidenceForm>(key: K, value: EvidenceForm[K]) => {
    setForm({ ...current, [key]: value });
    if (errors[key as keyof EvidenceFormErrors]) setErrors({ ...errors, [key]: undefined });
  };

  const saving = actions.create.isPending || actions.update.isPending;
  const fileBusy = actions.upload.isPending || actions.removeFile.isPending || actions.link.isPending;

  const onSave = () => {
    const found = validateEvidenceForm(current);
    setErrors(found);
    if (Object.keys(found).length > 0) return;
    // Sharing confidential material is confirmed once more, as on the website.
    const newlyShared =
      current.confidential && current.isPortfolioShared && !(base.confidential && base.isPortfolioShared && base.redactionConfirmed);
    if (newlyShared) {
      Alert.alert(
        t('redaction.confirmTitle'),
        t('redaction.confirmBody', { title: current.title.trim(), note: current.redactionNote.trim() || t('redaction.noNote') }),
        [
          { text: tc('cancel'), style: 'cancel' },
          { text: t('redaction.confirmGo'), onPress: send },
        ],
      );
      return;
    }
    send();
  };

  const send = () => {
    if (isNew) {
      actions.create.mutate(toCreateEvidenceInput(current), {
        onSuccess: (created) => {
          setForm(null);
          setLeaveTo({ kind: 'replace', href: `/(dashboard)/career/evidence/${encodeURIComponent(created.id)}` as Href });
        },
        onError: (error) => Alert.alert(t('alerts.notSaved'), evidenceSaveErrorMessage(error)),
      });
      return;
    }
    if (!item.data || !dirty) return;
    actions.update.mutate(
      { id: item.data.id, body: toUpdateEvidenceInput(current, item.data.attachmentStored, base) },
      {
        onSuccess: () => setForm(null),
        onError: (error) => Alert.alert(t('alerts.notSaved'), [evidenceSaveErrorMessage(error), t('alerts.changesKept')].join(' ')),
      },
    );
  };

  const onDelete = (evidence: CareerEvidence) => {
    Alert.alert(t('alerts.deleteTitle'), t('alerts.deleteBody'), [
      { text: tc('cancel'), style: 'cancel' },
      {
        text: tc('delete'),
        style: 'destructive',
        onPress: () =>
          actions.remove.mutate(evidence.id, {
            onSuccess: () => {
              setForm(null);
              setLeaveTo({ kind: 'back' });
            },
            onError: (error) => Alert.alert(t('alerts.notDeleted'), careerErrorMessage(error, t('alerts.deleteFailed'))),
          }),
      },
    ]);
  };

  const needsSaveFirst = () => {
    if (!dirty) return false;
    Alert.alert(t('alerts.saveFirstTitle'), t('alerts.saveFirstBody'));
    return true;
  };

  const onPickPhoto = async (evidence: CareerEvidence) => {
    if (needsSaveFirst()) return;
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert(t('alerts.photosTitle'), t('alerts.photosBody'));
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsEditing: false, quality: 0.9 });
    if (result.canceled) return;
    const asset = result.assets[0];
    if (!asset) return;
    const plan = planImageUpload({ uri: asset.uri, mimeType: asset.mimeType, fileName: asset.fileName, fileSize: asset.fileSize });
    upload(evidence, asset.uri, plan);
  };

  const onPickFile = async (evidence: CareerEvidence) => {
    if (needsSaveFirst()) return;
    let asset: DocumentPicker.DocumentPickerAsset | undefined;
    try {
      const result = await DocumentPicker.getDocumentAsync({ type: EVIDENCE_PICKER_TYPES, copyToCacheDirectory: true, multiple: false });
      if (result.canceled) return;
      asset = result.assets[0];
    } catch {
      Alert.alert(t('alerts.notAttached'), t('errors.fileFailed'));
      return;
    }
    if (!asset) return;
    const plan = planFileUpload({ uri: asset.uri, name: asset.name, mimeType: asset.mimeType, size: asset.size });
    upload(evidence, asset.uri, plan);
  };

  /** Shared by both pickers: the hook reads the file (`fetch(uri).blob()`), re-checks its size and re-types it to the checked MIME. */
  const upload = (evidence: CareerEvidence, uri: string, plan: UploadPlan) => {
    if (!plan.ok) {
      Alert.alert(t('alerts.notAttached'), plan.message);
      return;
    }
    actions.upload.mutate(
      { id: evidence.id, uri, contentType: plan.contentType, fileName: plan.fileName },
      {
        onError: (error) =>
          Alert.alert(t('alerts.notAttached'), error instanceof UploadRefused ? error.message : evidenceFileErrorMessage(error)),
      },
    );
  };

  const onOpenFile = (evidence: CareerEvidence) => {
    actions.link.mutate(evidence.id, {
      onSuccess: (link) => {
        void WebBrowser.openBrowserAsync(link.url).catch(() =>
          Alert.alert(t('alerts.openFailedTitle'), t('alerts.openFailedBody')),
        );
      },
      onError: (error) => Alert.alert(t('alerts.openFailedTitle'), evidenceFileErrorMessage(error)),
    });
  };

  const onRemoveFile = (evidence: CareerEvidence) => {
    if (needsSaveFirst()) return;
    Alert.alert(t('alerts.removeFileTitle'), t('alerts.removeFileBody'), [
      { text: tc('cancel'), style: 'cancel' },
      {
        text: tc('remove'),
        style: 'destructive',
        onPress: () =>
          actions.removeFile.mutate(evidence.id, {
            onError: (error) => Alert.alert(t('alerts.fileNotRemoved'), evidenceFileErrorMessage(error)),
          }),
      },
    ]);
  };

  const title = isNew ? t('item.newTitle') : (item.data?.title ?? t('item.fallbackTitle'));

  let content: React.ReactNode;
  if (gate === 'locked') {
    content = <EmptyState icon="lock-closed-outline" title={t('gate.locked')} />;
  } else if (gate === 'off') {
    content = <EmptyState icon="lock-closed-outline" title={t('gate.off')} description={t('gate.offBody')} />;
  } else if (gate === 'loading' || (!isNew && item.isLoading)) {
    content = (
      <View className="p-5">
        <SkeletonCard />
        <SkeletonCard />
      </View>
    );
  } else if (gate === 'error' || (!isNew && (item.error || !item.data))) {
    content = (
      <ErrorState
        message={careerErrorMessage(item.error ?? access.error, t('item.loadError'))}
        onRetry={() => void (item.error ? item.refetch() : access.refetch())}
      />
    );
  } else {
    const evidence = item.data;
    const label = evidence ? evidenceLabelView(evidence.evidenceLabel) : null;
    content = (
      <KeyboardAvoidingView className="flex-1" behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 48 }} keyboardShouldPersistTaps="handled">
          {evidence && label ? (
            <View className="flex-row items-center mb-4">
              <Pill label={label.text} tone={label.tone} />
              <Text className="text-stone-500 text-xs ms-2 flex-1">
                {evidence.verifierName ? t('item.checkedBy', { name: evidence.verifierName }) : t('item.labelsNote')}
              </Text>
            </View>
          ) : null}
          {evidence ? (
            <Text className="text-stone-500 text-xs leading-4 mb-4 -mt-2">{evidenceLabelLimit(evidence.evidenceLabel)}</Text>
          ) : null}

          <View className="bg-surface border border-stone-100 rounded-2xl p-4 mb-4">
            <Input
              label={t('form.title')}
              value={current.title}
              onChangeText={(v) => set('title', v)}
              maxLength={EVIDENCE_LIMITS.title}
              placeholder={t('form.titlePlaceholder')}
              error={errors.title}
              accessibilityLabel={t('form.titleA11y')}
            />

            <Text className="text-sm font-medium text-stone-700 mb-1.5">{isNew ? t('form.typeRequired') : t('form.type')}</Text>
            {isNew ? (
              <View className="flex-row flex-wrap gap-2 mb-4" accessibilityRole="radiogroup" accessibilityLabel={t('form.type')}>
                {EVIDENCE_TYPE_OPTIONS.map((option) => {
                  const selected = current.evidenceType === option.value;
                  return (
                    <TouchableOpacity
                      key={option.value}
                      onPress={() => set('evidenceType', option.value)}
                      className={`min-h-[44px] px-4 justify-center rounded-xl border ${selected ? 'bg-brand-600 border-brand-600' : 'bg-surface border-stone-200'}`}
                      accessibilityRole="radio"
                      accessibilityState={{ selected, checked: selected }}
                    >
                      <Text className={selected ? 'text-white font-semibold' : 'text-stone-700 font-semibold'}>{evidenceTypeLabel(option.value)}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            ) : (
              <Text className="text-stone-900 mb-4">
                {evidenceTypeLabel(current.evidenceType)} <Text className="text-stone-400 text-xs">{t('item.fixedAfterCreation')}</Text>
              </Text>
            )}

            <Input
              label={t('form.description')}
              value={current.description}
              onChangeText={(v) => set('description', v)}
              maxLength={EVIDENCE_LIMITS.description}
              placeholder={t('form.descriptionPlaceholder')}
              multiline
              textAlignVertical="top"
              style={{ minHeight: 88 }}
              error={errors.description}
            />
            <Input
              label={t('form.ownership')}
              value={current.ownershipStatement}
              onChangeText={(v) => set('ownershipStatement', v)}
              maxLength={EVIDENCE_LIMITS.ownershipStatement}
              placeholder={t('form.ownershipPlaceholder')}
              error={errors.ownershipStatement}
            />
            <Input
              label={t('form.skills')}
              value={current.skillsText}
              onChangeText={(v) => set('skillsText', v)}
              placeholder={t('form.skillsPlaceholder')}
              autoCapitalize="none"
            />
            {evidence?.attachmentStored ? null : (
              <>
                <Input
                  label={t('form.attachmentUrl')}
                  value={current.attachmentUrl}
                  onChangeText={(v) => set('attachmentUrl', v)}
                  maxLength={EVIDENCE_LIMITS.attachmentUrl}
                  placeholder="https://..."
                  keyboardType="url"
                  autoCapitalize="none"
                  autoCorrect={false}
                  error={errors.attachmentUrl}
                />
                <Input
                  label={t('form.attachmentName')}
                  value={current.attachmentName}
                  onChangeText={(v) => set('attachmentName', v)}
                  maxLength={EVIDENCE_LIMITS.attachmentName}
                  placeholder={t('form.attachmentNamePlaceholder')}
                  autoCapitalize="none"
                  error={errors.attachmentName}
                />
              </>
            )}

            <View className="flex-row items-center justify-between min-h-[44px]">
              <Text className="text-sm font-medium text-stone-700 flex-1 me-3">{t('form.portfolioShared')}</Text>
              <Switch
                value={current.isPortfolioShared}
                onValueChange={(v) => set('isPortfolioShared', v)}
                trackColor={{ true: colors.brand[600], false: colors.stone[300] }}
                accessibilityLabel={t('form.portfolioShared')}
                accessibilityState={{ checked: current.isPortfolioShared }}
              />
            </View>

            <View className="flex-row items-center justify-between min-h-[44px]">
              <Text className="text-sm font-medium text-stone-700 flex-1 me-3">{t('redaction.confidential')}</Text>
              <Switch
                value={current.confidential}
                onValueChange={(v) => setForm({ ...current, confidential: v, redactionConfirmed: v ? current.redactionConfirmed : false })}
                trackColor={{ true: colors.brand[600], false: colors.stone[300] }}
                accessibilityLabel={t('redaction.confidential')}
                accessibilityState={{ checked: current.confidential }}
              />
            </View>
            {current.confidential ? (
              <View className="mt-2">
                <Text className="text-stone-500 text-xs leading-4 mb-2">{t('redaction.help')}</Text>
                <Input
                  label={t('redaction.note')}
                  value={current.redactionNote}
                  onChangeText={(v) => set('redactionNote', v)}
                  maxLength={EVIDENCE_LIMITS.redactionNote}
                  multiline
                  textAlignVertical="top"
                  style={{ minHeight: 64 }}
                  error={errors.redactionNote}
                />
                <TouchableOpacity
                  onPress={() => set('redactionConfirmed', !current.redactionConfirmed)}
                  className="flex-row items-center min-h-[44px]"
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: current.redactionConfirmed }}
                  accessibilityLabel={t('redaction.confirm')}
                >
                  <Ionicons
                    name={current.redactionConfirmed ? 'checkbox' : 'square-outline'}
                    size={22}
                    color={current.redactionConfirmed ? colors.brand[600] : colors.stone[400]}
                  />
                  <Text className="text-sm text-stone-700 ms-3 flex-1">{t('redaction.confirm')}</Text>
                </TouchableOpacity>
                {errors.redactionConfirmed ? <Text className="text-red-600 text-xs mt-1">{errors.redactionConfirmed}</Text> : null}
              </View>
            ) : null}
          </View>

          <View className="bg-surface border border-stone-100 rounded-2xl p-4 mb-4">
            <Text className="font-bold text-stone-900 mb-1">{t('facts.title')}</Text>
            <Text className="text-stone-500 text-xs mb-2 leading-4">{t('facts.hint')}</Text>
            {facts.isLoading ? <Text className="text-stone-400 text-sm">{t('facts.loading')}</Text> : null}
            {facts.error ? <Text className="text-stone-500 text-sm">{t('facts.loadFailed')}</Text> : null}
            {(() => {
              // Confirmed facts, plus any already linked (so an unconfirmed link can still be removed).
              const options = (facts.data?.items ?? []).filter(
                (fact) => fact.confirmation === 'confirmed' || current.linkedFactIds.includes(fact.id),
              );
              if (!facts.isLoading && !facts.error && options.length === 0) {
                return <Text className="text-stone-500 text-sm">{t('facts.empty')}</Text>;
              }
              return options.map((fact) => {
                const checked = current.linkedFactIds.includes(fact.id);
                const label = factTitle(fact.factType, fact.value);
                return (
                  <TouchableOpacity
                    key={fact.id}
                    onPress={() => set('linkedFactIds', toggleFactId(current.linkedFactIds, fact.id))}
                    className="flex-row items-center min-h-[44px] py-1"
                    accessibilityRole="checkbox"
                    accessibilityState={{ checked }}
                    accessibilityLabel={label}
                  >
                    <Ionicons name={checked ? 'checkbox' : 'square-outline'} size={22} color={checked ? colors.brand[600] : colors.stone[400]} />
                    <Text className="text-stone-900 ms-3 flex-1">{label}</Text>
                  </TouchableOpacity>
                );
              });
            })()}
            {errors.linkedFactIds ? <Text className="text-red-600 text-xs mt-1">{errors.linkedFactIds}</Text> : null}
          </View>

          <Button onPress={onSave} loading={saving} disabled={!isNew && !dirty} fullWidth accessibilityRole="button">
            {isNew ? t('item.saveItem') : dirty ? t('item.saveChanges') : t('item.saved')}
          </Button>
          {isNew ? (
            <Text className="text-stone-400 text-xs mt-2 text-center">{t('item.attachAfterSave')}</Text>
          ) : null}

          {evidence ? (
            <View className="bg-surface border border-stone-100 rounded-2xl p-4 mt-6">
              <Text className="font-bold text-stone-900 mb-1">{t('file.title')}</Text>
              {evidence.attachmentStored ? (
                <>
                  <View className="flex-row items-center mb-3">
                    <Ionicons name="document-attach-outline" size={18} color={colors.stone[500]} />
                    <Text className="text-stone-700 text-sm ms-2 flex-1" numberOfLines={1}>
                      {evidence.attachmentName ?? t('file.storedFallback')}
                    </Text>
                    <Text className="text-stone-400 text-xs">{formatBytes(evidence.attachmentSizeBytes)}</Text>
                  </View>
                  <View className="flex-row flex-wrap gap-2">
                    <Button variant="outline" size="sm" className="min-h-[44px]" disabled={fileBusy} loading={actions.link.isPending} onPress={() => onOpenFile(evidence)}>
                      {t('file.open')}
                    </Button>
                    <Button variant="outline" size="sm" className="min-h-[44px]" disabled={fileBusy} loading={actions.upload.isPending} onPress={() => void onPickPhoto(evidence)}>
                      {t('file.replace')}
                    </Button>
                    <Button variant="outline" size="sm" className="min-h-[44px]" disabled={fileBusy} loading={actions.upload.isPending} onPress={() => void onPickFile(evidence)}>
                      {t('file.replaceFile')}
                    </Button>
                    <Button variant="ghost" size="sm" className="min-h-[44px]" disabled={fileBusy} loading={actions.removeFile.isPending} onPress={() => onRemoveFile(evidence)}>
                      {t('file.remove')}
                    </Button>
                  </View>
                  <Text className="text-stone-400 text-xs mt-2">{t('file.linkNote')}</Text>
                </>
              ) : (
                <>
                  <Text className="text-stone-500 text-sm leading-5 mb-3">
                    {t('file.hint')}
                  </Text>
                  <View className="flex-row flex-wrap gap-2">
                    <Button
                      variant="outline"
                      className="min-h-[44px]"
                      disabled={fileBusy}
                      loading={actions.upload.isPending}
                      onPress={() => void onPickPhoto(evidence)}
                      icon={<Ionicons name="image-outline" size={18} color={colors.stone[700]} />}
                    >
                      {t('file.attach')}
                    </Button>
                    <Button
                      variant="outline"
                      className="min-h-[44px]"
                      disabled={fileBusy}
                      loading={actions.upload.isPending}
                      onPress={() => void onPickFile(evidence)}
                      icon={<Ionicons name="document-attach-outline" size={18} color={colors.stone[700]} />}
                    >
                      {t('file.attachFile')}
                    </Button>
                  </View>
                </>
              )}
            </View>
          ) : null}

          {evidence && evidence.verifications?.length ? (
            <View className="bg-surface border border-stone-100 rounded-2xl p-4 mt-6">
              <Text className="font-bold text-stone-900 mb-1">{t('history.title', { count: evidence.verifications.length })}</Text>
              <Text className="text-stone-500 text-xs mb-2 leading-4">{t('history.readOnly')}</Text>
              {verificationRows(evidence.verifications).map((row) => (
                <View key={row.id} className="border-t border-stone-100 pt-2 mt-2">
                  <View className="flex-row items-center flex-wrap gap-2">
                    <Pill label={row.label} tone={row.status === 'active' ? 'success' : 'default'} />
                    {row.statusText ? <Pill label={row.statusText} tone="warning" /> : null}
                  </View>
                  {row.lines.map((line, i) => (
                    <Text key={i} className="text-stone-600 text-xs mt-1">
                      {line}
                    </Text>
                  ))}
                </View>
              ))}
            </View>
          ) : null}

          {evidence ? (
            <Button
              variant="ghost"
              className="mt-6 min-h-[44px]"
              disabled={actions.remove.isPending}
              loading={actions.remove.isPending}
              onPress={() => onDelete(evidence)}
              icon={<Ionicons name="trash-outline" size={18} color={colors.error.DEFAULT} />}
            >
              {t('item.deleteItem')}
            </Button>
          ) : null}
        </ScrollView>
      </KeyboardAvoidingView>
    );
  }

  return (
    <SafeAreaView className="flex-1 bg-stone-50" edges={['top', 'bottom']}>
      <CareerHeader title={title} subtitle={isNew ? t('newSubtitle') : undefined} />
      {content}
    </SafeAreaView>
  );
}
