import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams } from 'expo-router';
import React, { useEffect, useMemo, useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, ScrollView, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { CareerHeader, Pill } from '../../../../../src/components/career/CareerHeader';
import { Button } from '../../../../../src/components/ui/Button';
import { ErrorState } from '../../../../../src/components/ui/ErrorState';
import { Modal } from '../../../../../src/components/ui/Modal';
import { SkeletonCard } from '../../../../../src/components/ui/Skeleton';
import { usePaidResume, useReadability, useResumeVersionPatch, useResumeVersions } from '../../../../../src/hooks/career/documents';
import { useCareerOpportunities, useCareerResume, useCareerResumes, useSaveResumeLines } from '../../../../../src/hooks/useCareer';
import { careerApi } from '../../../../../src/lib/career-api';
import {
  changedLines,
  creditLine,
  isRevisionConflict,
  paidFailure,
  readabilityLines,
  RESUME_TEMPLATE_OPTIONS,
  resumeTemplateName,
  templatePatch,
  versionMeta,
} from '../../../../../src/lib/career/documents';
import { shareCareerFile } from '../../../../../src/lib/career-files';
import { careerErrorMessage, FACT_TYPE_LABEL } from '../../../../../src/lib/career-view';
import { careerDrafts } from '../../../../../src/store/career-drafts';
import { useLeaveGuard } from '../../../../../src/hooks/useLeaveGuard';
import { useAuthStore } from '../../../../../src/store/auth-store';
import { colors } from '../../../../../src/theme/colors';

/**
 * A career CV draft on mobile (website: resume studio). Edit the wording of
 * each line, save, switch layout, confirm the version, check readability,
 * export PDF/DOCX and share. Generating a new version or tailoring it to a
 * saved opportunity uses one document credit and needs the AI provider.
 * Every write sends the revision it was based on, so a newer save elsewhere
 * is never overwritten. Lines stay tied to their fact.
 */
export default function CareerResumeScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const uid = useAuthStore((s) => s.firebaseUser?.uid ?? '');
  const resume = useCareerResume(id);
  const resumes = useCareerResumes();
  const versions = useResumeVersions(id);
  const opportunities = useCareerOpportunities();
  const save = useSaveResumeLines(id);
  const patch = useResumeVersionPatch(id);
  const paid = usePaidResume(id);
  const readability = useReadability();
  const [edits, setEdits] = useState<Record<string, string>>(() => careerDrafts.get(uid, `resume:${id}`) ?? {});
  const [restored] = useState(() => Boolean(careerDrafts.get(uid, `resume:${id}`)));
  const [exporting, setExporting] = useState<'pdf' | 'docx' | null>(null);
  const [picker, setPicker] = useState<'template' | 'tailor' | null>(null);

  useEffect(() => {
    careerDrafts.set(uid, `resume:${id}`, edits);
  }, [uid, id, edits]);

  const version = resume.data?.version ?? null;
  const original = useMemo(() => {
    const map: Record<string, string> = {};
    for (const section of version?.body.sections ?? []) for (const line of section.lines) map[line.factId] = line.text;
    return map;
  }, [version]);
  const changed = Object.entries(edits).filter(([factId, text]) => original[factId] !== undefined && original[factId] !== text);
  const dirty = changed.length > 0;
  useLeaveGuard(dirty);
  const credit = resumes.data?.documentCredit;
  const busy = save.isPending || patch.isPending || paid.isPending;

  const clearEdits = () => {
    setEdits({});
    careerDrafts.clear(uid, `resume:${id}`);
  };

  /** A refused write keeps the typed lines; reloading lays them over the latest version. */
  const writeFailed = (title: string, error: unknown) => {
    Alert.alert(
      title,
      careerErrorMessage(error, 'Nothing was changed. Your typed lines are still here; try again.'),
      isRevisionConflict(error)
        ? [
            { text: 'Not now', style: 'cancel' },
            { text: 'Reload the latest version', onPress: () => void resume.refetch() },
          ]
        : undefined,
    );
  };

  const onSave = () => {
    if (!version || !dirty) return;
    save.mutate(
      { versionId: version.id, lines: changed.map(([factId, text]) => ({ factId, text })), expectedRevision: resume.data?.revision },
      { onSuccess: clearEdits, onError: (error) => writeFailed('Not saved', error) },
    );
  };

  const onDiscard = () => {
    Alert.alert('Discard your changes?', 'The saved version stays as it is.', [
      { text: 'Keep editing', style: 'cancel' },
      { text: 'Discard', style: 'destructive', onPress: () => setEdits({}) },
    ]);
  };

  const onTemplate = (templateId: string) => {
    setPicker(null);
    if (!version || templateId === version.body.templateId) return;
    // Typed lines are saved together with the new layout (same as the website).
    patch.mutate(
      { versionId: version.id, patch: templatePatch(version, templateId, edits, resume.data?.revision) },
      { onSuccess: clearEdits, onError: (error) => writeFailed('Layout not changed', error) },
    );
  };

  const onConfirmVersion = () => {
    if (!version) return;
    if (dirty) {
      Alert.alert('Save first', 'Save or discard your changes, then confirm this version.');
      return;
    }
    patch.mutate(
      { versionId: version.id, patch: { confirmation: 'confirmed', expectedRevision: resume.data?.revision } },
      { onError: (error) => writeFailed('Not confirmed', error) },
    );
  };

  const runPaid = (opportunityId: string | null) => {
    paid.mutate(
      { opportunityId },
      {
        onSuccess: (result) =>
          Alert.alert(
            'New version created',
            `Version ${result.version.versionNumber} is open.${result.replayed ? ' This repeated an earlier request; no extra credit was used.' : ''}`,
          ),
      },
    );
  };

  const confirmPaid = (opportunityId: string | null, what: string) => {
    if (dirty) {
      Alert.alert('Save first', 'A new version replaces the lines on screen. Save or discard your changes first.');
      return;
    }
    const credits = creditLine(credit);
    Alert.alert('This uses 1 document credit', `${credits ? `${credits} ` : ''}${what} It keeps your facts and does not add employers, dates or numbers.`, [
      { text: 'Leave', style: 'cancel' },
      { text: 'Use 1 credit', onPress: () => runPaid(opportunityId) },
    ]);
  };

  const onTailorPick = (opportunityId: string) => {
    setPicker(null);
    confirmPaid(opportunityId, 'The new version is ordered for this opportunity.');
  };

  const onExport = async (format: 'pdf' | 'docx') => {
    if (!version) return;
    if (dirty) {
      Alert.alert('Save first', 'The export uses the saved version. Save or discard your changes, then export.');
      return;
    }
    setExporting(format);
    try {
      const file = await careerApi.exportResume(version.id, format);
      const outcome = await shareCareerFile(file, resume.data?.title ?? 'Career CV', format);
      if (outcome === 'sharing_unavailable') Alert.alert('Sharing unavailable', 'This device cannot open the share sheet.');
    } catch (error) {
      Alert.alert('Export failed', careerErrorMessage(error, 'The file could not be created. Please try again.'));
    } finally {
      setExporting(null);
    }
  };

  const failure = paid.error ? paidFailure(paid.error, credit) : null;
  const report = readability.data && version && readability.data.versionId === version.id ? readability.data : null;
  const listings = opportunities.data?.items ?? [];

  let content: React.ReactNode;
  if (resume.isLoading) {
    content = (
      <View className="p-5">
        <SkeletonCard />
      </View>
    );
  } else if (resume.error || !resume.data) {
    content = <ErrorState message={careerErrorMessage(resume.error, 'Could not open this draft.')} onRetry={() => void resume.refetch()} />;
  } else if (!version) {
    content = <ErrorState message="This draft has no saved version yet." />;
  } else {
    const issues = report ? readabilityLines(report.issues) : [];
    content = (
      <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 140 }} keyboardShouldPersistTaps="handled">
        {restored && dirty ? (
          <View className="bg-warning-bg rounded-xl p-3 mb-4">
            <Text className="text-warning text-sm">Your unsaved changes from earlier are restored.</Text>
          </View>
        ) : null}
        <View className="flex-row items-center mb-4 gap-2">
          <Pill label={version.body.confirmation === 'confirmed' ? 'CONFIRMED' : 'DRAFT'} tone={version.body.confirmation === 'confirmed' ? 'success' : 'default'} />
          <Text className="text-stone-500 text-xs">{`Version ${version.versionNumber} · ${resume.data.language.toUpperCase()}`}</Text>
        </View>

        <View className="bg-white border border-stone-100 rounded-2xl p-4 mb-4">
          <TouchableOpacity
            onPress={() => setPicker('template')}
            disabled={busy}
            className="flex-row items-center min-h-[44px]"
            accessibilityRole="button"
            accessibilityLabel={`Layout: ${resumeTemplateName(version.body.templateId)}. Change layout`}
            accessibilityState={{ disabled: busy }}
          >
            <View className="flex-1">
              <Text className="text-xs text-stone-500">Layout</Text>
              <Text className="font-semibold text-stone-900">{resumeTemplateName(version.body.templateId)}</Text>
            </View>
            <Text className="text-brand-600 font-semibold mr-1">{patch.isPending ? 'Saving…' : 'Change'}</Text>
            <Ionicons name="chevron-forward" size={16} color={colors.stone[300]} />
          </TouchableOpacity>
          <Text className="text-stone-500 text-xs mt-1 leading-4">Switching layouts keeps every saved section. Typed lines are saved with the new layout.</Text>
          <View className="flex-row flex-wrap gap-2 mt-4">
            {version.body.confirmation === 'draft' ? (
              <Button size="sm" variant="outline" onPress={onConfirmVersion} disabled={busy}>
                Confirm this version
              </Button>
            ) : null}
            <Button size="sm" variant="outline" onPress={() => readability.mutate(version.id)} loading={readability.isPending}>
              Check readability
            </Button>
          </View>
          {readability.error ? (
            <Text className="text-error text-sm mt-3">{careerErrorMessage(readability.error, 'The check could not run. Please try again.')}</Text>
          ) : null}
          {report ? (
            <View className="mt-3 border-t border-stone-100 pt-3" accessibilityLiveRegion="polite">
              <Text className="font-semibold text-stone-900">FlacronCV readability check</Text>
              <Text className="text-stone-500 text-xs mt-0.5 leading-4">This is not an employer score and it is not a job fit. It checks the saved version.</Text>
              {issues.length === 0 ? <Text className="text-success text-sm mt-2">No parsing issues on this version.</Text> : null}
              {issues.map((line) => (
                <Text key={line} className="text-stone-700 text-sm mt-1.5">{`• ${line}`}</Text>
              ))}
            </View>
          ) : null}
        </View>

        <View className="bg-white border border-stone-100 rounded-2xl p-4 mb-5">
          <Text className="font-semibold text-stone-900">New version from your facts</Text>
          <Text className="text-stone-500 text-xs mt-0.5 mb-3 leading-4">{`Uses 1 document credit and needs the AI provider. ${creditLine(credit) ?? ''}`.trim()}</Text>
          <View className="flex-row gap-3">
            <View className="flex-1">
              <Button
                size="sm"
                variant="outline"
                fullWidth
                onPress={() => confirmPaid(null, 'A new version is generated from your confirmed facts.')}
                loading={paid.isPending && paid.variables?.opportunityId === null}
                disabled={busy}
              >
                Generate
              </Button>
            </View>
            <View className="flex-1">
              <Button
                size="sm"
                variant="outline"
                fullWidth
                onPress={() => setPicker('tailor')}
                loading={paid.isPending && Boolean(paid.variables?.opportunityId)}
                disabled={busy}
                accessibilityLabel="Tailor to a saved opportunity"
              >
                Tailor
              </Button>
            </View>
          </View>
          {failure ? (
            <View className="bg-warning-bg rounded-xl p-3 mt-3" accessibilityLiveRegion="polite">
              <Text className="text-warning text-sm font-semibold">{failure.title}</Text>
              <Text className="text-warning text-sm mt-1">{failure.body}</Text>
            </View>
          ) : null}
        </View>

        {version.document ? (
          <Text className="text-stone-500 text-sm mb-4 leading-5">This version was copied from the CV builder; its lines are read-only here.</Text>
        ) : null}
        {version.body.sections.map((section) => (
          <View key={section.factType} className="mb-5">
            <Text className="text-sm font-semibold text-stone-500 uppercase tracking-wide mb-2">{FACT_TYPE_LABEL[section.factType] ?? section.factType}</Text>
            {section.lines.map((line) => {
              const value = edits[line.factId] ?? line.text;
              return (
                <View key={line.factId} className="mb-2">
                  <TextInput
                    value={value}
                    onChangeText={(text) => setEdits((prev) => ({ ...prev, [line.factId]: text }))}
                    multiline
                    editable={!version.document}
                    accessibilityLabel={`${FACT_TYPE_LABEL[section.factType] ?? section.factType} line`}
                    className={`bg-white border rounded-xl px-3 py-2.5 text-base text-stone-900 ${value !== line.text ? 'border-brand-400' : 'border-stone-200'}`}
                    placeholderTextColor={colors.stone[400]}
                  />
                  {line.uncertain ? <Text className="text-warning text-xs mt-1">Marked uncertain: check this line before sending.</Text> : null}
                </View>
              );
            })}
          </View>
        ))}

        <View className="bg-white border border-stone-100 rounded-2xl p-4 mb-4">
          <Text className="font-semibold text-stone-900 mb-2">Versions</Text>
          {versions.isLoading ? <Text className="text-stone-500 text-sm">Loading…</Text> : null}
          {versions.error ? <Text className="text-stone-500 text-sm">{careerErrorMessage(versions.error, 'Versions could not be loaded.')}</Text> : null}
          {(versions.data?.items ?? []).map((item) => (
            <View key={item.id} className="flex-row items-center py-2 border-t border-stone-100 min-h-[44px]">
              <View className="flex-1">
                <Text className="text-stone-900 text-sm font-semibold">{`Version ${item.versionNumber}`}</Text>
                <Text className="text-stone-500 text-xs mt-0.5">{versionMeta(item)}</Text>
              </View>
              {item.id === version.id ? <Pill label="OPEN" tone="brand" /> : null}
            </View>
          ))}
          <Text className="text-stone-500 text-xs mt-2 leading-4">The newest version is the one you edit and export.</Text>
        </View>
        <Text className="text-stone-500 text-xs leading-4">Saving, layout changes, readability checks and exporting use no career credits.</Text>
      </ScrollView>
    );
  }

  return (
    <SafeAreaView className="flex-1 bg-stone-50" edges={['top', 'bottom']}>
      <CareerHeader title={resume.data?.title ?? 'Career CV'} subtitle={dirty ? 'Unsaved changes' : undefined} />
      <KeyboardAvoidingView className="flex-1" behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        {content}
        {version ? (
          <View className="absolute bottom-0 left-0 right-0 bg-white border-t border-stone-100 px-5 py-3">
            {dirty ? (
              <View className="flex-row gap-3">
                <View className="flex-1">
                  <Button variant="outline" fullWidth onPress={onDiscard} disabled={busy}>
                    Discard
                  </Button>
                </View>
                <View className="flex-1">
                  <Button fullWidth onPress={onSave} loading={save.isPending} disabled={busy}>
                    Save
                  </Button>
                </View>
              </View>
            ) : (
              <View className="flex-row gap-3">
                <View className="flex-1">
                  <Button variant="outline" fullWidth onPress={() => void onExport('pdf')} loading={exporting === 'pdf'} disabled={exporting !== null}>
                    Share PDF
                  </Button>
                </View>
                <View className="flex-1">
                  <Button variant="outline" fullWidth onPress={() => void onExport('docx')} loading={exporting === 'docx'} disabled={exporting !== null}>
                    Share DOCX
                  </Button>
                </View>
              </View>
            )}
          </View>
        ) : null}
      </KeyboardAvoidingView>

      <Modal visible={picker === 'template'} onClose={() => setPicker(null)} title="Layout" size="lg">
        {RESUME_TEMPLATE_OPTIONS.map((option) => {
          const selected = version?.body.templateId === option.id;
          return (
            <TouchableOpacity
              key={option.id}
              onPress={() => onTemplate(option.id)}
              className="flex-row items-center min-h-[48px] border-b border-stone-100"
              accessibilityRole="radio"
              accessibilityState={{ selected, checked: selected }}
              accessibilityLabel={option.name}
            >
              <View style={{ backgroundColor: option.accent }} className="w-4 h-4 rounded-full mr-3" />
              <Text className={`flex-1 text-base ${selected ? 'font-semibold text-brand-700' : 'text-stone-800'}`}>{option.name}</Text>
              {selected ? <Ionicons name="checkmark" size={20} color={colors.brand[600]} /> : null}
            </TouchableOpacity>
          );
        })}
        {version && changedLines(version, edits).length > 0 ? (
          <Text className="text-stone-500 text-xs mt-3 leading-4">Your typed lines are saved together with the new layout.</Text>
        ) : null}
        <View className="h-8" />
      </Modal>

      <Modal visible={picker === 'tailor'} onClose={() => setPicker(null)} title="Tailor to an opportunity" size="lg">
        <Text className="text-stone-500 text-sm mb-3 leading-5">Pick one of your saved opportunities. You confirm the credit next.</Text>
        {opportunities.isLoading ? <Text className="text-stone-500 text-sm">Loading…</Text> : null}
        {opportunities.error ? <Text className="text-error text-sm">{careerErrorMessage(opportunities.error, 'Your opportunities could not be loaded.')}</Text> : null}
        {!opportunities.isLoading && !opportunities.error && listings.length === 0 ? (
          <Text className="text-stone-500 text-sm">No saved opportunities yet. Save or paste one under Saved opportunities first.</Text>
        ) : null}
        {listings.map((item) => (
          <TouchableOpacity
            key={item.id}
            onPress={() => onTailorPick(item.id)}
            className="flex-row items-center min-h-[56px] py-2 border-b border-stone-100"
            accessibilityRole="button"
            accessibilityLabel={`Tailor to ${item.title}`}
          >
            <View className="flex-1 mr-2">
              <Text className="text-stone-900 font-semibold" numberOfLines={2}>
                {item.title}
              </Text>
              <Text className="text-stone-500 text-xs mt-0.5">{[item.organization, item.label === 'expired' ? 'Expired' : 'Open'].filter(Boolean).join(' · ')}</Text>
            </View>
            <Ionicons name="chevron-forward" size={16} color={colors.stone[300]} />
          </TouchableOpacity>
        ))}
        <View className="h-8" />
      </Modal>
    </SafeAreaView>
  );
}
