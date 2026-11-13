import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, ScrollView, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { CareerHeader, Pill } from '../../../../../src/components/career/CareerHeader';
import { Button } from '../../../../../src/components/ui/Button';
import { ErrorState } from '../../../../../src/components/ui/ErrorState';
import { Modal } from '../../../../../src/components/ui/Modal';
import { SkeletonCard } from '../../../../../src/components/ui/Skeleton';
import { useLetterTemplate } from '../../../../../src/hooks/career/documents';
import { useCopyToV1 } from '../../../../../src/hooks/career/to-v1';
import { useCareerWriting, useSaveWriting } from '../../../../../src/hooks/useCareer';
import { isRevisionConflict, LETTER_TEMPLATE_OPTIONS, letterTemplateName } from '../../../../../src/lib/career/documents';
import { careerApi } from '../../../../../src/lib/career-api';
import { shareCareerFile } from '../../../../../src/lib/career-files';
import { careerErrorMessage } from '../../../../../src/lib/career-view';
import { careerDrafts } from '../../../../../src/store/career-drafts';
import { useLeaveGuard } from '../../../../../src/hooks/useLeaveGuard';
import { useAuthStore } from '../../../../../src/store/auth-store';
import { useT } from '../../../../../src/i18n';
import { RTL_FLIP } from '../../../../../src/i18n/native';
import { colors } from '../../../../../src/theme/colors';

/**
 * A career letter or text on mobile: edit, save (revision-checked), reopen,
 * export and share. A cover letter can also switch layout; typed text is saved
 * together with the new layout (same as the website), never replaced.
 */
export default function CareerLetterScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const t = useT('careerDocuments');
  const tk = useT('career');
  const tc = useT('common');
  const uid = useAuthStore((s) => s.firebaseUser?.uid ?? '');
  const doc = useCareerWriting(id);
  const save = useSaveWriting(id);
  const layout = useLetterTemplate(id);
  const th = useT('careerHub.copy');
  const copier = useCopyToV1();
  const [picking, setPicking] = useState(false);
  const stored = careerDrafts.get(uid, `writing:${id}`)?.body;
  const [body, setBody] = useState<string | null>(stored ?? null);
  const [restored] = useState(() => stored !== undefined);
  const [exporting, setExporting] = useState<'pdf' | 'docx' | null>(null);

  const saved = doc.data?.body ?? '';
  const text = body ?? saved;
  const dirty = body !== null && body !== saved;
  useLeaveGuard(dirty);

  useEffect(() => {
    careerDrafts.set(uid, `writing:${id}`, dirty && body !== null ? { body } : {});
  }, [uid, id, body, dirty]);

  const onSave = () => {
    if (!dirty || body === null) return;
    save.mutate(
      { body, expectedRevision: doc.data?.revision },
      {
        onSuccess: () => {
          setBody(null);
          careerDrafts.clear(uid, `writing:${id}`);
        },
        onError: (error) => Alert.alert(tk('shared.notSaved'), careerErrorMessage(error, tk('shared.changesNotSaved'))),
      },
    );
  };

  const onLayout = (templateId: string) => {
    setPicking(false);
    if (!doc.data || templateId === doc.data.templateId) return;
    layout.mutate(
      { templateId, ...(dirty && body !== null ? { body } : {}), expectedRevision: doc.data.revision },
      {
        onSuccess: () => {
          setBody(null);
          careerDrafts.clear(uid, `writing:${id}`);
        },
        onError: (error) =>
          Alert.alert(
            tk('shared.layoutNotChanged'),
            careerErrorMessage(error, t('letter.textFailed')),
            isRevisionConflict(error)
              ? [
                  { text: tk('shared.notNow'), style: 'cancel' },
                  { text: t('letter.reloadDiscard'), style: 'destructive', onPress: () => { setBody(null); void doc.refetch(); } },
                ]
              : undefined,
          ),
      },
    );
  };

  /** One-way copy of the saved letter into a new V1 cover letter; then the V1 editor opens. */
  const onCopyToV1 = () => {
    if (dirty) {
      Alert.alert(tk('shared.saveFirst'), th('saveFirst'));
      return;
    }
    void copier.copyLetter(id as string);
  };

  const onExport = async (format: 'pdf' | 'docx') => {
    if (dirty) {
      Alert.alert(tk('shared.saveFirst'), tk('shared.exportUsesSaved'));
      return;
    }
    setExporting(format);
    try {
      const file = await careerApi.exportWriting(id as string, format);
      const outcome = await shareCareerFile(file, doc.data?.title ?? tk('shared.careerLetter'), format);
      if (outcome === 'sharing_unavailable') Alert.alert(tk('shared.sharingUnavailable'), tk('shared.shareSheetUnavailable'));
    } catch (error) {
      Alert.alert(tk('shared.exportFailed'), careerErrorMessage(error, tk('shared.fileNotCreated')));
    } finally {
      setExporting(null);
    }
  };

  let content: React.ReactNode;
  if (doc.isLoading) {
    content = (
      <View className="p-5">
        <SkeletonCard />
      </View>
    );
  } else if (doc.error || !doc.data) {
    content = <ErrorState message={careerErrorMessage(doc.error, t('letter.openFailed'))} onRetry={() => void doc.refetch()} />;
  } else {
    content = (
      <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 140 }} keyboardShouldPersistTaps="handled">
        {restored && dirty ? (
          <View className="bg-warning-bg rounded-xl p-3 mb-4">
            <Text className="text-warning text-sm">{tk('shared.unsavedRestored')}</Text>
          </View>
        ) : null}
        <View className="mb-3">
          <Pill label={doc.data.confirmation === 'confirmed' ? tk('shared.confirmedPill') : tk('shared.draftPill')} tone={doc.data.confirmation === 'confirmed' ? 'success' : 'default'} />
        </View>
        {doc.data.type === 'cover_letter' ? (
          <View className="bg-white border border-stone-100 rounded-2xl p-4 mb-3">
            <TouchableOpacity
              onPress={() => setPicking(true)}
              disabled={layout.isPending || save.isPending}
              className="flex-row items-center min-h-[44px]"
              accessibilityRole="button"
              accessibilityLabel={t('resume.layoutA11y', { name: letterTemplateName(doc.data.templateId) })}
              accessibilityState={{ disabled: layout.isPending || save.isPending }}
            >
              <View className="flex-1">
                <Text className="text-xs text-stone-500">{tk('shared.layout')}</Text>
                <Text className="font-semibold text-stone-900">{letterTemplateName(doc.data.templateId)}</Text>
              </View>
              <Text className="text-brand-600 font-semibold me-1">{layout.isPending ? tk('shared.saving') : tk('shared.change')}</Text>
              <Ionicons name="chevron-forward" size={16} color={colors.stone[300]} style={RTL_FLIP} />
            </TouchableOpacity>
            <Text className="text-stone-500 text-xs mt-1 leading-4">{t('letter.layoutNote')}</Text>
          </View>
        ) : null}
        <TextInput
          value={text}
          onChangeText={setBody}
          multiline
          textAlignVertical="top"
          accessibilityLabel={t('letter.textA11y')}
          className="bg-white border border-stone-200 rounded-xl px-3 py-3 text-base text-stone-900 min-h-[320px]"
          placeholderTextColor={colors.stone[400]}
        />
        <Text className="text-stone-500 text-xs mt-3 leading-4">{t('letter.noCreditsNote')}</Text>
        {doc.data.type === 'cover_letter' ? (
          // Website: only cover letters can be copied into V1's cover-letter editor.
          <View className="bg-white border border-stone-100 rounded-2xl p-4 mt-4">
            <Text className="font-semibold text-stone-900">{th('title')}</Text>
            <Text className="text-stone-500 text-xs mt-0.5 mb-3 leading-4">{th('body')}</Text>
            <View className="self-start">
              <Button
                size="sm"
                variant="outline"
                onPress={onCopyToV1}
                loading={copier.busy === id}
                disabled={copier.busy !== null || save.isPending || layout.isPending}
                icon={<Ionicons name="copy-outline" size={16} color={colors.stone[700]} />}
              >
                {th('letterButton')}
              </Button>
            </View>
          </View>
        ) : null}
      </ScrollView>
    );
  }

  return (
    <SafeAreaView className="flex-1 bg-stone-50" edges={['top', 'bottom']}>
      <CareerHeader title={doc.data?.title ?? tk('shared.careerLetter')} subtitle={dirty ? tk('shared.unsavedChanges') : undefined} />
      <KeyboardAvoidingView className="flex-1" behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        {content}
        {doc.data ? (
          <View className="absolute bottom-0 start-0 end-0 bg-white border-t border-stone-100 px-5 py-3">
            {dirty ? (
              <View className="flex-row gap-3">
                <View className="flex-1">
                  <Button variant="outline" fullWidth onPress={() => setBody(null)} disabled={save.isPending || layout.isPending}>
                    {tk('shared.discard')}
                  </Button>
                </View>
                <View className="flex-1">
                  <Button fullWidth onPress={onSave} loading={save.isPending}>
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

      <Modal visible={picking} onClose={() => setPicking(false)} title={t('newWriting.letterLayout')} size="lg">
        {LETTER_TEMPLATE_OPTIONS.map((option) => {
          const selected = doc.data?.templateId === option.id;
          return (
            <TouchableOpacity
              key={option.id}
              onPress={() => onLayout(option.id)}
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
        {dirty ? <Text className="text-stone-500 text-xs mt-3 leading-4">{t('letter.typedSaved')}</Text> : null}
        <View className="h-8" />
      </Modal>
    </SafeAreaView>
  );
}
