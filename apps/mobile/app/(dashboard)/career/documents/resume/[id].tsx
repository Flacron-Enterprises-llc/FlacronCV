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
import { useCopyToV1 } from '../../../../../src/hooks/career/to-v1';
import { useCareerOpportunities, useCareerResume, useCareerResumes, useSaveResumeLines } from '../../../../../src/hooks/useCareer';
import { careerApi } from '../../../../../src/lib/career-api';
import {
  changedLines,
  creditLine,
  isRevisionConflict,
  opportunityParam,
  paidFailure,
  readabilityLines,
  RESUME_TEMPLATE_OPTIONS,
  resumeTemplateName,
  templatePatch,
  versionMeta,
} from '../../../../../src/lib/career/documents';
import { shareCareerFile } from '../../../../../src/lib/career-files';
import { formatChecksNote, formatChecksTitle, formatIssueLines } from '../../../../../src/lib/career/readability';
import { careerErrorMessage, FACT_TYPE_LABEL } from '../../../../../src/lib/career-view';
import { careerDrafts } from '../../../../../src/store/career-drafts';
import { useLeaveGuard } from '../../../../../src/hooks/useLeaveGuard';
import { useAuthStore } from '../../../../../src/store/auth-store';
import { useT } from '../../../../../src/i18n';
import { RTL_FLIP } from '../../../../../src/i18n/native';
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
  const { id, opportunityId: rawListing } = useLocalSearchParams<{ id: string; opportunityId?: string }>();
  // Opened for a listing (?opportunityId=): tailoring to it is offered, still behind the credit confirmation.
  const forListing = opportunityParam(rawListing);
  const t = useT('careerDocuments');
  const tk = useT('career');
  const tc = useT('common');
  const uid = useAuthStore((s) => s.firebaseUser?.uid ?? '');
  const resume = useCareerResume(id);
  const resumes = useCareerResumes();
  const versions = useResumeVersions(id);
  const opportunities = useCareerOpportunities();
  const save = useSaveResumeLines(id);
  const patch = useResumeVersionPatch(id);
  const paid = usePaidResume(id);
  const readability = useReadability();
  const th = useT('careerHub.copy');
  const copier = useCopyToV1();
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
      careerErrorMessage(error, t('resume.writeFailedBody')),
      isRevisionConflict(error)
        ? [
            { text: tk('shared.notNow'), style: 'cancel' },
            { text: t('resume.reloadLatest'), onPress: () => void resume.refetch() },
          ]
        : undefined,
    );
  };

  const onSave = () => {
    if (!version || !dirty) return;
    save.mutate(
      { versionId: version.id, lines: changed.map(([factId, text]) => ({ factId, text })), expectedRevision: resume.data?.revision },
      { onSuccess: clearEdits, onError: (error) => writeFailed(tk('shared.notSaved'), error) },
    );
  };

  const onDiscard = () => {
    Alert.alert(t('resume.discardTitle'), t('resume.discardBody'), [
      { text: tk('shared.keepEditing'), style: 'cancel' },
      { text: tk('shared.discard'), style: 'destructive', onPress: () => setEdits({}) },
    ]);
  };

  const onTemplate = (templateId: string) => {
    setPicker(null);
    if (!version || templateId === version.body.templateId) return;
    // Typed lines are saved together with the new layout (same as the website).
    patch.mutate(
      { versionId: version.id, patch: templatePatch(version, templateId, edits, resume.data?.revision) },
      { onSuccess: clearEdits, onError: (error) => writeFailed(tk('shared.layoutNotChanged'), error) },
    );
  };

  const onConfirmVersion = () => {
    if (!version) return;
    if (dirty) {
      Alert.alert(tk('shared.saveFirst'), t('resume.confirmSaveFirst'));
      return;
    }
    patch.mutate(
      { versionId: version.id, patch: { confirmation: 'confirmed', expectedRevision: resume.data?.revision } },
      { onError: (error) => writeFailed(tk('shared.notConfirmed'), error) },
    );
  };

  const runPaid = (opportunityId: string | null) => {
    paid.mutate(
      { opportunityId },
      {
        onSuccess: (result) =>
          Alert.alert(
            t('resume.newVersionTitle'),
            [t('resume.newVersionBody', { number: result.version.versionNumber }), result.replayed ? t('resume.replayed') : ''].filter(Boolean).join(' '),
          ),
      },
    );
  };

  const confirmPaid = (opportunityId: string | null, what: string) => {
    if (dirty) {
      Alert.alert(tk('shared.saveFirst'), t('resume.paidSaveFirst'));
      return;
    }
    const credits = creditLine(credit);
    Alert.alert(tk('shared.usesOneCredit'), [credits, what, t('resume.keepsFacts')].filter(Boolean).join(' '), [
      { text: tk('shared.leave'), style: 'cancel' },
      { text: t('resume.useOneCredit'), onPress: () => runPaid(opportunityId) },
    ]);
  };

  /** One-way copy into a new V1 CV, made from the saved version; then the V1 editor opens. */
  const onCopyToV1 = () => {
    if (dirty) {
      Alert.alert(tk('shared.saveFirst'), th('saveFirst'));
      return;
    }
    void copier.copyResume(id as string);
  };

  const onTailorPick = (opportunityId: string) => {
    setPicker(null);
    confirmPaid(opportunityId, t('resume.tailorWhat'));
  };

  const onExport = async (format: 'pdf' | 'docx') => {
    if (!version) return;
    if (dirty) {
      Alert.alert(tk('shared.saveFirst'), tk('shared.exportUsesSaved'));
      return;
    }
    setExporting(format);
    try {
      const file = await careerApi.exportResume(version.id, format);
      const outcome = await shareCareerFile(file, resume.data?.title ?? tk('shared.careerCv'), format);
      if (outcome === 'sharing_unavailable') Alert.alert(tk('shared.sharingUnavailable'), tk('shared.shareSheetUnavailable'));
    } catch (error) {
      Alert.alert(tk('shared.exportFailed'), careerErrorMessage(error, tk('shared.fileNotCreated')));
    } finally {
      setExporting(null);
    }
  };

  const failure = paid.error ? paidFailure(paid.error, credit) : null;
  const report = readability.data && version && readability.data.versionId === version.id ? readability.data : null;
  const listings = opportunities.data?.items ?? [];
  const listingTitle = forListing ? (listings.find((item) => item.id === forListing)?.title ?? t('forListing.openedListing')) : null;

  let content: React.ReactNode;
  if (resume.isLoading) {
    content = (
      <View className="p-5">
        <SkeletonCard />
      </View>
    );
  } else if (resume.error || !resume.data) {
    content = <ErrorState message={careerErrorMessage(resume.error, t('resume.openFailed'))} onRetry={() => void resume.refetch()} />;
  } else if (!version) {
    content = <ErrorState message={t('resume.noVersion')} />;
  } else {
    const issues = report ? readabilityLines(report.issues) : [];
    const formatLines = report ? formatIssueLines(report.formatIssues) : [];
    content = (
      <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 140 }} keyboardShouldPersistTaps="handled">
        {restored && dirty ? (
          <View className="bg-warning-bg rounded-xl p-3 mb-4">
            <Text className="text-warning text-sm">{tk('shared.unsavedRestored')}</Text>
          </View>
        ) : null}
        <View className="flex-row items-center mb-4 gap-2">
          <Pill label={version.body.confirmation === 'confirmed' ? tk('shared.confirmedPill') : tk('shared.draftPill')} tone={version.body.confirmation === 'confirmed' ? 'success' : 'default'} />
          <Text className="text-stone-500 text-xs">{t('resume.versionLanguage', { number: version.versionNumber, language: resume.data.language.toUpperCase() })}</Text>
        </View>

        <View className="bg-surface border border-stone-100 rounded-2xl p-4 mb-4">
          <TouchableOpacity
            onPress={() => setPicker('template')}
            disabled={busy}
            className="flex-row items-center min-h-[44px]"
            accessibilityRole="button"
            accessibilityLabel={t('resume.layoutA11y', { name: resumeTemplateName(version.body.templateId) })}
            accessibilityState={{ disabled: busy }}
          >
            <View className="flex-1">
              <Text className="text-xs text-stone-500">{tk('shared.layout')}</Text>
              <Text className="font-semibold text-stone-900">{resumeTemplateName(version.body.templateId)}</Text>
            </View>
            <Text className="text-brand-600 font-semibold me-1">{patch.isPending ? tk('shared.saving') : tk('shared.change')}</Text>
            <Ionicons name="chevron-forward" size={16} color={colors.stone[300]} style={RTL_FLIP} />
          </TouchableOpacity>
          <Text className="text-stone-500 text-xs mt-1 leading-4">{t('resume.layoutNote')}</Text>
          <View className="flex-row flex-wrap gap-2 mt-4">
            {version.body.confirmation === 'draft' ? (
              <Button size="sm" variant="outline" onPress={onConfirmVersion} disabled={busy}>
                {t('resume.confirmVersion')}
              </Button>
            ) : null}
            <Button size="sm" variant="outline" onPress={() => readability.mutate(version.id)} loading={readability.isPending}>
              {t('resume.checkReadability')}
            </Button>
          </View>
          {readability.error ? (
            <Text className="text-error text-sm mt-3">{careerErrorMessage(readability.error, t('resume.checkFailed'))}</Text>
          ) : null}
          {report ? (
            <View className="mt-3 border-t border-stone-100 pt-3" accessibilityLiveRegion="polite">
              <Text className="font-semibold text-stone-900">{t('resume.readabilityLabel')}</Text>
              <Text className="text-stone-500 text-xs mt-0.5 leading-4">{t('resume.readabilityNote')}</Text>
              {issues.length === 0 ? <Text className="text-success text-sm mt-2">{t('resume.readabilityClear')}</Text> : null}
              {issues.map((line) => (
                <Text key={line} className="text-stone-700 text-sm mt-1.5">{`• ${line}`}</Text>
              ))}
              {formatLines.length > 0 ? (
                <View className="mt-3">
                  <Text className="font-semibold text-stone-900" accessibilityRole="header">
                    {formatChecksTitle()}
                  </Text>
                  <Text className="text-stone-500 text-xs mt-0.5 leading-4">{formatChecksNote()}</Text>
                  {formatLines.map((line) => (
                    <Text key={line.key} className="text-stone-700 text-sm mt-1.5">{`• ${line.text}`}</Text>
                  ))}
                </View>
              ) : null}
            </View>
          ) : null}
        </View>

        {forListing && listingTitle ? (
          <View className="bg-brand-50 border border-brand-100 rounded-2xl p-4 mb-4">
            <Text className="font-semibold text-stone-900" accessibilityRole="header">
              {t('resume.tailorListingTitle', { title: listingTitle })}
            </Text>
            <Text className="text-stone-600 text-xs mt-0.5 mb-3 leading-4">
              {[t('resume.tailorListingNote'), creditLine(credit)].filter(Boolean).join(' ')}
            </Text>
            <Button
              size="sm"
              onPress={() => confirmPaid(forListing, t('resume.tailorWhat'))}
              loading={paid.isPending && paid.variables?.opportunityId === forListing}
              disabled={busy}
              accessibilityLabel={t('resume.tailorToA11y', { title: listingTitle })}
            >
              {t('resume.tailorListingButton')}
            </Button>
          </View>
        ) : null}

        <View className="bg-surface border border-stone-100 rounded-2xl p-4 mb-5">
          <Text className="font-semibold text-stone-900">{t('resume.newVersionHeading')}</Text>
          <Text className="text-stone-500 text-xs mt-0.5 mb-3 leading-4">{[t('resume.newVersionNote'), creditLine(credit)].filter(Boolean).join(' ')}</Text>
          <View className="flex-row gap-3">
            <View className="flex-1">
              <Button
                size="sm"
                variant="outline"
                fullWidth
                onPress={() => confirmPaid(null, t('resume.generateWhat'))}
                loading={paid.isPending && paid.variables?.opportunityId === null}
                disabled={busy}
              >
                {t('resume.generate')}
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
                accessibilityLabel={t('resume.tailorA11y')}
              >
                {t('resume.tailor')}
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

        <View className="bg-surface border border-stone-100 rounded-2xl p-4 mb-5">
          <Text className="font-semibold text-stone-900">{th('title')}</Text>
          <Text className="text-stone-500 text-xs mt-0.5 mb-3 leading-4">{th('body')}</Text>
          <View className="self-start">
            <Button
              size="sm"
              variant="outline"
              onPress={onCopyToV1}
              loading={copier.busy === id}
              disabled={copier.busy !== null || busy}
              icon={<Ionicons name="copy-outline" size={16} color={colors.stone[700]} />}
            >
              {th('cvButton')}
            </Button>
          </View>
        </View>

        {version.document ? (
          <Text className="text-stone-500 text-sm mb-4 leading-5">{t('resume.copiedReadOnly')}</Text>
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
                    accessibilityLabel={t('resume.lineA11y', { section: FACT_TYPE_LABEL[section.factType] ?? section.factType })}
                    className={`bg-surface border rounded-xl px-3 py-2.5 text-base text-stone-900 ${value !== line.text ? 'border-brand-400' : 'border-stone-200'}`}
                    placeholderTextColor={colors.stone[400]}
                  />
                  {line.uncertain ? <Text className="text-warning text-xs mt-1">{t('resume.markedUncertain')}</Text> : null}
                </View>
              );
            })}
          </View>
        ))}

        <View className="bg-surface border border-stone-100 rounded-2xl p-4 mb-4">
          <Text className="font-semibold text-stone-900 mb-2">{t('resume.versions')}</Text>
          {versions.isLoading ? <Text className="text-stone-500 text-sm">{tc('loading')}</Text> : null}
          {versions.error ? <Text className="text-stone-500 text-sm">{careerErrorMessage(versions.error, t('resume.versionsFailed'))}</Text> : null}
          {(versions.data?.items ?? []).map((item) => (
            <View key={item.id} className="flex-row items-center py-2 border-t border-stone-100 min-h-[44px]">
              <View className="flex-1">
                <Text className="text-stone-900 text-sm font-semibold">{t('resume.version', { number: item.versionNumber })}</Text>
                <Text className="text-stone-500 text-xs mt-0.5">{versionMeta(item)}</Text>
              </View>
              {item.id === version.id ? <Pill label={tk('shared.openPill')} tone="brand" /> : null}
            </View>
          ))}
          <Text className="text-stone-500 text-xs mt-2 leading-4">{t('resume.newestNote')}</Text>
        </View>
        <Text className="text-stone-500 text-xs leading-4">{t('resume.noCreditsNote')}</Text>
      </ScrollView>
    );
  }

  return (
    <SafeAreaView className="flex-1 bg-stone-50" edges={['top', 'bottom']}>
      <CareerHeader title={resume.data?.title ?? tk('shared.careerCv')} subtitle={dirty ? tk('shared.unsavedChanges') : undefined} />
      <KeyboardAvoidingView className="flex-1" behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        {content}
        {version ? (
          <View className="absolute bottom-0 start-0 end-0 bg-surface border-t border-stone-100 px-5 py-3">
            {dirty ? (
              <View className="flex-row gap-3">
                <View className="flex-1">
                  <Button variant="outline" fullWidth onPress={onDiscard} disabled={busy}>
                    {tk('shared.discard')}
                  </Button>
                </View>
                <View className="flex-1">
                  <Button fullWidth onPress={onSave} loading={save.isPending} disabled={busy}>
                    {tc('save')}
                  </Button>
                </View>
              </View>
            ) : (
              <View className="flex-row gap-3">
                <View className="flex-1">
                  <Button variant="outline" fullWidth onPress={() => void onExport('pdf')} loading={exporting === 'pdf'} disabled={exporting !== null}>
                    {t('resume.sharePdf')}
                  </Button>
                </View>
                <View className="flex-1">
                  <Button variant="outline" fullWidth onPress={() => void onExport('docx')} loading={exporting === 'docx'} disabled={exporting !== null}>
                    {t('resume.shareDocx')}
                  </Button>
                </View>
              </View>
            )}
          </View>
        ) : null}
      </KeyboardAvoidingView>

      <Modal visible={picker === 'template'} onClose={() => setPicker(null)} title={tk('shared.layout')} size="lg">
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
              <View style={{ backgroundColor: option.accent }} className="w-4 h-4 rounded-full me-3" />
              <Text className={`flex-1 text-base ${selected ? 'font-semibold text-brand-700' : 'text-stone-800'}`}>{option.name}</Text>
              {selected ? <Ionicons name="checkmark" size={20} color={colors.brand[600]} /> : null}
            </TouchableOpacity>
          );
        })}
        {version && changedLines(version, edits).length > 0 ? (
          <Text className="text-stone-500 text-xs mt-3 leading-4">{t('resume.typedSavedWithLayout')}</Text>
        ) : null}
        <View className="h-8" />
      </Modal>

      <Modal visible={picker === 'tailor'} onClose={() => setPicker(null)} title={t('resume.tailorTitle')} size="lg">
        <Text className="text-stone-500 text-sm mb-3 leading-5">{t('resume.tailorBody')}</Text>
        {opportunities.isLoading ? <Text className="text-stone-500 text-sm">{tc('loading')}</Text> : null}
        {opportunities.error ? <Text className="text-error text-sm">{careerErrorMessage(opportunities.error, t('resume.oppsFailed'))}</Text> : null}
        {!opportunities.isLoading && !opportunities.error && listings.length === 0 ? (
          <Text className="text-stone-500 text-sm">{t('resume.noSavedOpps')}</Text>
        ) : null}
        {listings.map((item) => (
          <TouchableOpacity
            key={item.id}
            onPress={() => onTailorPick(item.id)}
            className="flex-row items-center min-h-[56px] py-2 border-b border-stone-100"
            accessibilityRole="button"
            accessibilityLabel={t('resume.tailorToA11y', { title: item.title })}
          >
            <View className="flex-1 me-2">
              <Text className="text-stone-900 font-semibold" numberOfLines={2}>
                {item.title}
              </Text>
              <Text className="text-stone-500 text-xs mt-0.5">{[item.organization, item.label === 'expired' ? t('resume.expired') : t('resume.open')].filter(Boolean).join(' · ')}</Text>
            </View>
            <Ionicons name="chevron-forward" size={16} color={colors.stone[300]} style={RTL_FLIP} />
          </TouchableOpacity>
        ))}
        <View className="h-8" />
      </Modal>
    </SafeAreaView>
  );
}
