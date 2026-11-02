import { useLocalSearchParams } from 'expo-router';
import React, { useEffect, useMemo, useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, ScrollView, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { CareerHeader, Pill } from '../../../../../src/components/career/CareerHeader';
import { Button } from '../../../../../src/components/ui/Button';
import { ErrorState } from '../../../../../src/components/ui/ErrorState';
import { SkeletonCard } from '../../../../../src/components/ui/Skeleton';
import { useCareerResume, useSaveResumeLines } from '../../../../../src/hooks/useCareer';
import { careerApi } from '../../../../../src/lib/career-api';
import { shareCareerFile } from '../../../../../src/lib/career-files';
import { careerErrorMessage, FACT_TYPE_LABEL } from '../../../../../src/lib/career-view';
import { careerDrafts } from '../../../../../src/store/career-drafts';
import { useAuthStore } from '../../../../../src/store/auth-store';
import { colors } from '../../../../../src/theme/colors';

/**
 * A career CV draft on mobile: edit the wording of each line, save, reopen,
 * export PDF/DOCX and share. Lines stay tied to their fact; adding facts,
 * generation and template changes are on the website. Saving sends the
 * revision it was based on, so a newer save elsewhere is never overwritten.
 */
export default function CareerResumeScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const uid = useAuthStore((s) => s.firebaseUser?.uid ?? '');
  const resume = useCareerResume(id);
  const save = useSaveResumeLines(id);
  const [edits, setEdits] = useState<Record<string, string>>(() => careerDrafts.get(uid, `resume:${id}`) ?? {});
  const [restored] = useState(() => Boolean(careerDrafts.get(uid, `resume:${id}`)));
  const [exporting, setExporting] = useState<'pdf' | 'docx' | null>(null);

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

  const onSave = () => {
    if (!version || !dirty) return;
    save.mutate(
      { versionId: version.id, lines: changed.map(([factId, text]) => ({ factId, text })), expectedRevision: resume.data?.revision },
      {
        onSuccess: () => {
          setEdits({});
          careerDrafts.clear(uid, `resume:${id}`);
        },
        onError: (error) => Alert.alert('Not saved', careerErrorMessage(error, 'Your changes were not saved. They are still here; try again.')),
      },
    );
  };

  const onDiscard = () => {
    Alert.alert('Discard your changes?', 'The saved version stays as it is.', [
      { text: 'Keep editing', style: 'cancel' },
      { text: 'Discard', style: 'destructive', onPress: () => setEdits({}) },
    ]);
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
        <Text className="text-stone-500 text-xs leading-4">Saving and exporting use no career credits.</Text>
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
                  <Button variant="outline" fullWidth onPress={onDiscard} disabled={save.isPending}>
                    Discard
                  </Button>
                </View>
                <View className="flex-1">
                  <Button fullWidth onPress={onSave} loading={save.isPending}>
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
    </SafeAreaView>
  );
}
