import { Ionicons } from '@expo/vector-icons';
import { useNavigation, usePreventRemove } from '@react-navigation/native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { CVWizard } from '../../../../src/components/cv-builder/CVWizard';
import { ErrorState } from '../../../../src/components/ui/ErrorState';
import { useCV, useCVSections, useUpdateCV } from '../../../../src/hooks/useCVs';
import { Button } from '../../../../src/components/ui/Button';
import { Input } from '../../../../src/components/ui/Input';
import { Modal } from '../../../../src/components/ui/Modal';
import { CV_TITLE_MAX, validateCvTitle } from '../../../../src/lib/cv-editor';
import { requestFailureMessage } from '../../../../src/lib/api-errors';
import { useExportCV } from '../../../../src/hooks/useExport';
import { useCVStore } from '../../../../src/store/cv-store';
import { CVStrengthBar } from '../../../../src/components/cv-builder/CVStrengthBar';
import { useAuthStore } from '../../../../src/store/auth-store';
import { canExport, planForDisplay, sharedPlanLimits } from '../../../../src/lib/entitlements';
import { exportLimitReachedMessage, limitPrompt, showUpgradePrompt, upgradeAlertButtons } from '../../../../src/config/paid-upgrades';
import { colors } from '../../../../src/theme/colors';
import { CVPreviewSheet } from '../../../../src/components/cv-builder/CVPreviewSheet';
import { t as tNow, useT } from '../../../../src/i18n';
import { RTL_FLIP } from '../../../../src/i18n/native';

/** E5 — one prompt for in-app back, hardware Back, and Android gesture Back. */
function confirmUnsavedLeave(onLeave: () => void) {
  Alert.alert(tNow('common.unsaved.title'), tNow('common.unsaved.body'), [
    { text: tNow('common.unsaved.stay'), style: 'cancel' },
    { text: tNow('common.unsaved.leave'), style: 'destructive', onPress: onLeave },
  ]);
}

export default function CVEditorScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const navigation = useNavigation();
  const t = useT('cvEditor');
  const tc = useT('common');
  const { user } = useAuthStore();
  const { setCV, setSections, cv: storeCV, isDirty, applySavedTitle } = useCVStore();
  const exportCV = useExportCV();
  const updateCV = useUpdateCV(id ?? '');
  const [renameOpen, setRenameOpen] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [renameValue, setRenameValue] = useState('');
  const [renameError, setRenameError] = useState<string | undefined>();

  const openRename = () => {
    setRenameValue(storeCV?.title ?? cv?.title ?? '');
    setRenameError(undefined);
    setRenameOpen(true);
  };

  /** Rename saves at once with PUT /cvs/:id { title } (web toolbar title field, same 200-char cap). */
  const submitRename = async () => {
    const check = validateCvTitle(renameValue);
    if (!check.ok) {
      setRenameError(check.error);
      return;
    }
    if (check.title === (storeCV?.title ?? cv?.title)) {
      setRenameOpen(false);
      return;
    }
    try {
      const saved = await updateCV.mutateAsync({ title: check.title });
      applySavedTitle(saved?.title ?? check.title);
      setRenameOpen(false);
    } catch (err) {
      setRenameError(requestFailureMessage(err, t('editor.renameFailed')));
    }
  };

  const { data: cv, isLoading: cvLoading, error: cvError } = useCV(id);
  const {
    data: sections,
    isLoading: sectionsLoading,
    error: sectionsError,
  } = useCVSections(id);
  const loadError = cvError || sectionsError;
  const [hydratedId, setHydratedId] = useState<string | null>(null);

  // Hydrate once per CV id. Re-applying React Query data after a save (or a
  // background refetch) called setCV, which sets isDirty=false — Continue
  // would then skip the PUT and look like a successful save.
  useEffect(() => {
    if (!id || !cv || !sections) return;
    if (hydratedId === id) return;
    setCV(cv);
    setSections(sections);
    setHydratedId(id);
  }, [id, cv, sections, hydratedId, setCV, setSections]);

  // beforeRemove (via usePreventRemove): native stack turns Android predictive
  // back / system gesture / hardware Back into a POP of this route. BackHandler
  // only sees the key event and is the wrong layer for the gesture.
  const guardExit = hydratedId === id && isDirty;
  usePreventRemove(guardExit, ({ data }) => {
    confirmUnsavedLeave(() => navigation.dispatch(data.action));
  });

  const handleExport = async (format: 'pdf' | 'docx') => {
    const exports = user?.usage?.exportsThisMonth ?? 0;

    if (!canExport(user?.subscription, exports)) {
      Alert.alert(
        t('editor.exportLimitTitle'),
        exportLimitReachedMessage(planForDisplay(user?.subscription)),
        upgradeAlertButtons(() => router.push('/(dashboard)/settings/plans')),
      );
      return;
    }
    // DOCX starts on Starter. Only a loaded account is pre-checked; the server decides otherwise.
    if (format === 'docx' && user && !sharedPlanLimits(user.subscription).docxExport) {
      showUpgradePrompt(limitPrompt('docx', planForDisplay(user.subscription)), () => router.push('/(dashboard)/settings/plans'));
      return;
    }

    exportCV.mutate({ cvId: id!, format });
  };

  // Error before loading: hydratedId stays unset on failure, so checking load
  // first spun forever and never reached ErrorState.
  if (loadError) {
    return (
      <SafeAreaView className="flex-1 bg-surface" edges={['top', 'bottom']}>
        <ErrorState message={t('editor.loadError')} onRetry={() => router.back()} />
      </SafeAreaView>
    );
  }

  if (cvLoading || sectionsLoading || hydratedId !== id) {
    return (
      <SafeAreaView className="flex-1 bg-surface items-center justify-center">
        <ActivityIndicator size="large" color={colors.brand[600]} />
        <Text className="text-stone-500 mt-3">{t('editor.loading')}</Text>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView className="flex-1 bg-stone-50" edges={['top', 'bottom']}>
      {/* Top Bar */}
      <View className="flex-row items-center justify-between px-4 py-3 bg-surface border-b border-stone-100">
        <TouchableOpacity
          onPress={() => router.back()}
          className="h-11 w-11 -ms-2 items-center justify-center"
          accessibilityRole="button"
          accessibilityLabel={tc('back')}
        >
          <Ionicons name="arrow-back" size={22} color={colors.stone[700]} style={RTL_FLIP} />
        </TouchableOpacity>

        <TouchableOpacity
          onPress={openRename}
          accessibilityRole="button"
          accessibilityLabel={t('editor.titleA11y', { title: storeCV?.title ?? cv?.title ?? '' })}
          accessibilityHint={t('editor.titleHint')}
          className="flex-1 min-w-0 px-3 justify-center"
          style={{ minHeight: 44 }}
        >
          <View className="flex-row items-center justify-center">
            <Text className="font-bold text-stone-900 text-center flex-shrink" numberOfLines={1}>
              {storeCV?.title ?? cv?.title ?? t('editor.editingFallback')}
            </Text>
            <Ionicons name="pencil" size={13} color={colors.stone[400]} style={{ marginStart: 4 }} />
          </View>
          {isDirty && (
            <Text className="text-xs text-brand-400 text-center">{t('editor.unsavedChanges')}</Text>
          )}
        </TouchableOpacity>

        <TouchableOpacity
          onPress={() => setPreviewOpen(true)}
          accessibilityRole="button"
          accessibilityLabel={t('editor.preview')}
          className="me-1 p-2"
        >
          <Ionicons name="eye-outline" size={22} color={colors.stone[700]} />
        </TouchableOpacity>
        <TouchableOpacity
          onPress={() => router.push('./ats-check')}
          accessibilityRole="button"
          accessibilityLabel={t('editor.atsCheck')}
          className="me-1 p-2"
        >
          <Ionicons name="analytics-outline" size={22} color={colors.stone[700]} />
        </TouchableOpacity>
        <TouchableOpacity
          onPress={() => router.push('./interview-prep')}
          accessibilityRole="button"
          accessibilityLabel={t('editor.interviewPrep')}
          className="me-1 p-2"
        >
          <Ionicons name="chatbubbles-outline" size={22} color={colors.stone[700]} />
        </TouchableOpacity>
        {/* One button for the less frequent tools keeps the title readable on narrow phones. */}
        <TouchableOpacity
          onPress={() =>
            Alert.alert(t('editor.moreTools'), undefined, [
              { text: t('editor.designTool'), onPress: () => router.push('./design') },
              { text: t('editor.linkedinTool'), onPress: () => router.push('./linkedin') },
              { text: tc('cancel'), style: 'cancel' },
            ])
          }
          accessibilityRole="button"
          accessibilityLabel={t('editor.moreToolsA11y')}
          className="me-2 p-2"
        >
          <Ionicons name="ellipsis-horizontal" size={22} color={colors.stone[700]} />
        </TouchableOpacity>
        <TouchableOpacity
          onPress={() => Alert.alert(t('editor.export'), t('editor.chooseFormat'), [
            { text: 'PDF', onPress: () => handleExport('pdf') },
            { text: 'DOCX', onPress: () => handleExport('docx') },
            { text: tc('cancel'), style: 'cancel' },
          ])}
          className="flex-row items-center bg-brand-600 px-3 py-2 rounded-xl"
          disabled={exportCV.isPending}
          accessibilityRole="button"
          accessibilityState={{ busy: exportCV.isPending }}
        >
          {exportCV.isPending ? (
            <ActivityIndicator size="small" color={colors.white} />
          ) : (
            <>
              <Ionicons name="download-outline" size={16} color={colors.white} />
              <Text className="text-white font-semibold ms-1 text-sm">{t('editor.export')}</Text>
            </>
          )}
        </TouchableOpacity>
      </View>

      <Modal visible={renameOpen} onClose={() => setRenameOpen(false)} title={t('editor.renameTitle')} closeDisabled={updateCV.isPending}>
        <Input
          label={t('editor.titleLabel')}
          placeholder={t('editor.titlePlaceholder')}
          value={renameValue}
          onChangeText={(text) => {
            setRenameValue(text);
            if (renameError) setRenameError(undefined);
          }}
          maxLength={CV_TITLE_MAX}
          error={renameError}
          hint={`${renameValue.length}/${CV_TITLE_MAX}`}
          autoFocus
          returnKeyType="done"
          onSubmitEditing={() => void submitRename()}
        />
        <Button variant="primary" fullWidth loading={updateCV.isPending} onPress={() => void submitRename()}>
          {tc('save')}
        </Button>
      </Modal>

      {/* CV Wizard */}
      {id ? <CVPreviewSheet cvId={id} visible={previewOpen} onClose={() => setPreviewOpen(false)} /> : null}
      <CVStrengthBar />
      <CVWizard
        cvId={id!}
        onFinish={() => router.push('/(dashboard)/cvs')}
      />
    </SafeAreaView>
  );
}
