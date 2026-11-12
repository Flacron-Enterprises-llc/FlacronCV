import { Ionicons } from '@expo/vector-icons';
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
import { useCareerAccess } from '../../../../src/hooks/useCareer';
import { useLeaveGuard } from '../../../../src/hooks/useLeaveGuard';
import {
  EMPTY_EVIDENCE_FORM,
  EVIDENCE_LIMITS,
  EVIDENCE_TYPE_OPTIONS,
  evidenceFileErrorMessage,
  evidenceFormDirty,
  evidenceLabelView,
  evidenceSaveErrorMessage,
  evidenceTypeLabel,
  formatBytes,
  formFromEvidence,
  planImageUpload,
  toCreateEvidenceInput,
  toUpdateEvidenceInput,
  validateEvidenceForm,
  type EvidenceForm,
  type EvidenceFormErrors,
} from '../../../../src/lib/career/evidence';
import { careerErrorMessage } from '../../../../src/lib/career-view';
import { colors } from '../../../../src/theme/colors';
import type { CareerEvidence } from '../../../../../../packages/career-api-client/src/types';

/**
 * One evidence item: create (route id "new") or edit, delete, and its private
 * file (attach a photo, open through a five-minute link, replace, remove).
 * Same fields and limits as the website; PDFs and Word files are uploaded on
 * the website because the app only has a photo picker.
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
    if (isNew) {
      actions.create.mutate(toCreateEvidenceInput(current), {
        onSuccess: (created) => {
          setForm(null);
          setLeaveTo({ kind: 'replace', href: `/(dashboard)/career/evidence/${encodeURIComponent(created.id)}` as Href });
        },
        onError: (error) => Alert.alert('Not saved', evidenceSaveErrorMessage(error)),
      });
      return;
    }
    if (!item.data || !dirty) return;
    actions.update.mutate(
      { id: item.data.id, body: toUpdateEvidenceInput(current, item.data.attachmentStored) },
      {
        onSuccess: () => setForm(null),
        onError: (error) => Alert.alert('Not saved', `${evidenceSaveErrorMessage(error)} Your changes are still here.`),
      },
    );
  };

  const onDelete = (evidence: CareerEvidence) => {
    Alert.alert('Delete this evidence item?', 'It is removed from your vault and from any portfolio page that shows it. A stored file is deleted too.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () =>
          actions.remove.mutate(evidence.id, {
            onSuccess: () => {
              setForm(null);
              setLeaveTo({ kind: 'back' });
            },
            onError: (error) => Alert.alert('Not deleted', careerErrorMessage(error, 'The evidence item was not deleted. Try again.')),
          }),
      },
    ]);
  };

  const needsSaveFirst = () => {
    if (!dirty) return false;
    Alert.alert('Save first', 'Save or undo your changes to this item, then manage its file.');
    return true;
  };

  const onPickPhoto = async (evidence: CareerEvidence) => {
    if (needsSaveFirst()) return;
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert('Photos unavailable', 'Allow photo library access in Settings to attach a photo of your certificate or work.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsEditing: false, quality: 0.9 });
    if (result.canceled) return;
    const asset = result.assets[0];
    if (!asset) return;
    const plan = planImageUpload({ uri: asset.uri, mimeType: asset.mimeType, fileName: asset.fileName, fileSize: asset.fileSize });
    if (!plan.ok) {
      Alert.alert('File not attached', plan.message);
      return;
    }
    actions.upload.mutate(
      { id: evidence.id, uri: asset.uri, contentType: plan.contentType, fileName: plan.fileName },
      {
        onError: (error) =>
          Alert.alert('File not attached', error instanceof UploadRefused ? error.message : evidenceFileErrorMessage(error)),
      },
    );
  };

  const onOpenFile = (evidence: CareerEvidence) => {
    actions.link.mutate(evidence.id, {
      onSuccess: (link) => {
        void WebBrowser.openBrowserAsync(link.url).catch(() =>
          Alert.alert('Could not open the file', 'The link could not be opened on this device. Try again.'),
        );
      },
      onError: (error) => Alert.alert('Could not open the file', evidenceFileErrorMessage(error)),
    });
  };

  const onRemoveFile = (evidence: CareerEvidence) => {
    if (needsSaveFirst()) return;
    Alert.alert('Remove this file?', 'The stored file is deleted. The evidence item stays.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove',
        style: 'destructive',
        onPress: () =>
          actions.removeFile.mutate(evidence.id, {
            onError: (error) => Alert.alert('File not removed', evidenceFileErrorMessage(error)),
          }),
      },
    ]);
  };

  const title = isNew ? 'New evidence item' : (item.data?.title ?? 'Evidence item');

  let content: React.ReactNode;
  if (gate === 'locked') {
    content = <EmptyState icon="lock-closed-outline" title="Career tools are not included in your plan" />;
  } else if (gate === 'off') {
    content = <EmptyState icon="lock-closed-outline" title="The Evidence vault is switched off" description="Your career profile and drafts are unchanged." />;
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
        message={careerErrorMessage(item.error ?? access.error, 'Could not load this evidence item.')}
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
              <Text className="text-stone-500 text-xs ml-2 flex-1">
                {evidence.verifierName ? `Checked by ${evidence.verifierName}` : 'Labels change only when something is established, never by editing.'}
              </Text>
            </View>
          ) : null}

          <View className="bg-white border border-stone-100 rounded-2xl p-4 mb-4">
            <Input
              label="Title *"
              value={current.title}
              onChangeText={(v) => set('title', v)}
              maxLength={EVIDENCE_LIMITS.title}
              placeholder="e.g. AWS Solutions Architect or Open Source Compiler"
              error={errors.title}
              accessibilityLabel="Title, required"
            />

            <Text className="text-sm font-medium text-stone-700 mb-1.5">Evidence type{isNew ? ' *' : ''}</Text>
            {isNew ? (
              <View className="flex-row flex-wrap gap-2 mb-4" accessibilityRole="radiogroup" accessibilityLabel="Evidence type">
                {EVIDENCE_TYPE_OPTIONS.map((option) => {
                  const selected = current.evidenceType === option.value;
                  return (
                    <TouchableOpacity
                      key={option.value}
                      onPress={() => set('evidenceType', option.value)}
                      className={`min-h-[44px] px-4 justify-center rounded-xl border ${selected ? 'bg-brand-600 border-brand-600' : 'bg-white border-stone-200'}`}
                      accessibilityRole="radio"
                      accessibilityState={{ selected, checked: selected }}
                    >
                      <Text className={selected ? 'text-white font-semibold' : 'text-stone-700 font-semibold'}>{option.label}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            ) : (
              <Text className="text-stone-900 mb-4">
                {evidenceTypeLabel(current.evidenceType)} <Text className="text-stone-400 text-xs">(fixed after creation)</Text>
              </Text>
            )}

            <Input
              label="Description"
              value={current.description}
              onChangeText={(v) => set('description', v)}
              maxLength={EVIDENCE_LIMITS.description}
              placeholder="Brief summary of the work, credential, or reference"
              multiline
              textAlignVertical="top"
              style={{ minHeight: 88 }}
              error={errors.description}
            />
            <Input
              label="Ownership / personal contribution"
              value={current.ownershipStatement}
              onChangeText={(v) => set('ownershipStatement', v)}
              maxLength={EVIDENCE_LIMITS.ownershipStatement}
              placeholder="e.g. Sole author, Lead designer, or 30% contributor"
              error={errors.ownershipStatement}
            />
            <Input
              label="Linked skills (comma separated)"
              value={current.skillsText}
              onChangeText={(v) => set('skillsText', v)}
              placeholder="e.g. TypeScript, PostgreSQL, System Design"
              autoCapitalize="none"
            />
            {evidence?.attachmentStored ? null : (
              <>
                <Input
                  label="Attachment link"
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
                  label="Attachment name"
                  value={current.attachmentName}
                  onChangeText={(v) => set('attachmentName', v)}
                  maxLength={EVIDENCE_LIMITS.attachmentName}
                  placeholder="credential.pdf"
                  autoCapitalize="none"
                  error={errors.attachmentName}
                />
              </>
            )}

            <View className="flex-row items-center justify-between min-h-[44px]">
              <Text className="text-sm font-medium text-stone-700 flex-1 mr-3">Include in public portfolio</Text>
              <Switch
                value={current.isPortfolioShared}
                onValueChange={(v) => set('isPortfolioShared', v)}
                trackColor={{ true: colors.brand[600], false: colors.stone[300] }}
                accessibilityLabel="Include in public portfolio"
                accessibilityState={{ checked: current.isPortfolioShared }}
              />
            </View>
          </View>

          <Button onPress={onSave} loading={saving} disabled={!isNew && !dirty} fullWidth accessibilityRole="button">
            {isNew ? 'Save item' : dirty ? 'Save changes' : 'Saved'}
          </Button>
          {isNew ? (
            <Text className="text-stone-400 text-xs mt-2 text-center">You can attach a photo once the item is saved.</Text>
          ) : null}

          {evidence ? (
            <View className="bg-white border border-stone-100 rounded-2xl p-4 mt-6">
              <Text className="font-bold text-stone-900 mb-1">Private file</Text>
              {evidence.attachmentStored ? (
                <>
                  <View className="flex-row items-center mb-3">
                    <Ionicons name="document-attach-outline" size={18} color={colors.stone[500]} />
                    <Text className="text-stone-700 text-sm ml-2 flex-1" numberOfLines={1}>
                      {evidence.attachmentName ?? 'Stored file'}
                    </Text>
                    <Text className="text-stone-400 text-xs">{formatBytes(evidence.attachmentSizeBytes)}</Text>
                  </View>
                  <View className="flex-row flex-wrap gap-2">
                    <Button variant="outline" size="sm" className="min-h-[44px]" disabled={fileBusy} loading={actions.link.isPending} onPress={() => onOpenFile(evidence)}>
                      Open file
                    </Button>
                    <Button variant="outline" size="sm" className="min-h-[44px]" disabled={fileBusy} loading={actions.upload.isPending} onPress={() => void onPickPhoto(evidence)}>
                      Replace with photo
                    </Button>
                    <Button variant="ghost" size="sm" className="min-h-[44px]" disabled={fileBusy} loading={actions.removeFile.isPending} onPress={() => onRemoveFile(evidence)}>
                      Remove file
                    </Button>
                  </View>
                  <Text className="text-stone-400 text-xs mt-2">Opening uses a private link that works for five minutes.</Text>
                </>
              ) : (
                <>
                  <Text className="text-stone-500 text-sm leading-5 mb-3">
                    Attach a PNG or JPEG photo, such as a certificate scan. Files are private: only you can open them, and storing one does not use a document credit. To attach a PDF or Word file, upload it on the FlacronCV website.
                  </Text>
                  <Button
                    variant="outline"
                    className="min-h-[44px]"
                    disabled={fileBusy}
                    loading={actions.upload.isPending}
                    onPress={() => void onPickPhoto(evidence)}
                    icon={<Ionicons name="image-outline" size={18} color={colors.stone[700]} />}
                  >
                    Attach a photo
                  </Button>
                </>
              )}
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
              Delete item
            </Button>
          ) : null}
        </ScrollView>
      </KeyboardAvoidingView>
    );
  }

  return (
    <SafeAreaView className="flex-1 bg-stone-50" edges={['top', 'bottom']}>
      <CareerHeader title={title} subtitle={isNew ? 'Add proof that backs a career claim' : undefined} />
      {content}
    </SafeAreaView>
  );
}
