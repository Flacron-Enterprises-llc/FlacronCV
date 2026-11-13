import { Ionicons } from '@expo/vector-icons';
import { useNavigation, usePreventRemove } from '@react-navigation/native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';
import axios from 'axios';
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, KeyboardAvoidingView, Platform, ScrollView, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ErrorState } from '../../../src/components/ui/ErrorState';
import { Input } from '../../../src/components/ui/Input';
import { Modal } from '../../../src/components/ui/Modal';
import { Button } from '../../../src/components/ui/Button';
import {
  useCoverLetter,
  useGenerateCoverLetter,
  useSetCoverLetterStatus,
  useUpdateCoverLetter,
} from '../../../src/hooks/useCoverLetters';
import { useRegenerateParagraph } from '../../../src/hooks/useCoverLetterAI';
import { useExportCoverLetter } from '../../../src/hooks/useExport';
import { useCoverLetterStore } from '../../../src/store/cover-letter-store';
import { useAuthStore } from '../../../src/store/auth-store';
import { canAccessTemplate, canExport, canUseAI, effectivePlanForCopy } from '../../../src/lib/entitlements';
import {
  aiCreditsExhaustedMessage,
  exportLimitReachedMessage,
  lockedTemplateMessage,
  lockedTemplateTitle,
  upgradeAlertButtons,
} from '../../../src/config/paid-upgrades';
import { colors } from '../../../src/theme/colors';
import { contentForEditor } from '../../../src/lib/letter-html';
import {
  applyParagraphRewrite,
  contentToSave,
  hasRichFormatting,
  splitParagraphs,
} from '../../../src/lib/cover-letter-content';
import { aiChargeNote } from '../../../src/lib/cover-letter-ai';
import { COVER_LETTER_MAX, addressedTo, buildEditorUpdate } from '../../../src/lib/cover-letter-payload';
import {
  ACCENT_COLORS,
  COVER_LETTER_TEMPLATES,
  TONE_OPTIONS,
  activeTemplateId,
  isSameColor,
  pickTemplate,
  templateById,
  type CoverLetterTemplateOption,
} from '../../../src/lib/cover-letter-options';
import { nestErrorCode, nestErrorMessage, requestFailureMessage } from '../../../src/lib/api-errors';
import { alertIfUnverifiedEmail } from '../../../src/lib/email-verification';
import { CoverLetterStatus } from '../../../src/types/enums';
import type { CoverLetter, CoverLetterTone } from '../../../src/types/cover-letter.types';
import { t, useT, type TFunction } from '../../../src/i18n';
import { RTL_FLIP } from '../../../src/i18n/native';

/** Same copy as cvs/[id] — one Unsaved Changes dialog in the app. */
function confirmUnsavedLeave(onLeave: () => void) {
  Alert.alert(t('common.unsaved.title'), t('common.unsaved.body'), [
    { text: t('common.unsaved.stay'), style: 'cancel' },
    { text: t('common.unsaved.leave'), style: 'destructive', onPress: onLeave },
  ]);
}

/** Same split as CVWizard saveFailureMessage — do not extract (E1–E7 frozen). */
function saveFailureMessage(err: unknown): string {
  if (axios.isAxiosError(err) && !err.response) {
    return t('common.noConnection');
  }
  return t('coverLetters.editor.saveError');
}

function generateFailureMessage(err: unknown): string {
  const code = nestErrorCode(err);
  const message = nestErrorMessage(err);

  if (code === 'AI_CREDIT_NOT_REFUNDED') {
    return t('coverLetters.editor.generateChargeUnconfirmed');
  }
  if (/credit/i.test(message) || code.startsWith('ABUSE_')) {
    return message || aiCreditsExhaustedMessage('coverLetter');
  }
  return requestFailureMessage(err, t('coverLetters.ai.generationFailed'));
}

const HEX_COLOR = /^#[0-9a-f]{6}$/i;

type DetailField = 'recipientName' | 'recipientTitle' | 'companyName' | 'jobTitle' | 'companyAddress';

/** Field labels are read at render (TFunction bound to 'coverLetters'). */
const DETAIL_FIELDS: readonly { field: DetailField; label: (tr: TFunction) => string }[] = [
  { field: 'recipientName', label: (tr) => tr('editor.recipientName') },
  { field: 'recipientTitle', label: (tr) => tr('editor.recipientTitle') },
  { field: 'companyName', label: (tr) => tr('editor.companyName') },
  { field: 'jobTitle', label: (tr) => tr('editor.jobTitle') },
  { field: 'companyAddress', label: (tr) => tr('editor.companyAddress') },
];

export default function CoverLetterEditorScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const tl = useT('coverLetters');
  const tc = useT('common');
  const router = useRouter();
  const navigation = useNavigation();
  const { user, syncUser } = useAuthStore();
  const {
    coverLetter,
    setCoverLetter,
    setContent,
    updateField,
    updateStyling,
    setTemplate,
    patchClean,
    isDirty,
    markClean,
  } = useCoverLetterStore();
  const { data: cl, isLoading, error, refetch } = useCoverLetter(id);
  const updateCL = useUpdateCoverLetter(id!);
  const generateCL = useGenerateCoverLetter(id!);
  const setStatus = useSetCoverLetterStatus(id!);
  const rewrite = useRegenerateParagraph();
  const exportCL = useExportCoverLetter();
  const queryClient = useQueryClient();
  const [isSaving, setIsSaving] = useState(false);
  const [hydratedId, setHydratedId] = useState<string | null>(null);
  const [tone, setTone] = useState<CoverLetterTone>('professional');
  /** HTML the server holds now. */
  const [savedHtml, setSavedHtml] = useState('');
  /** HTML the editor text was derived from (differs after an in-place paragraph rewrite). */
  const [baseHtml, setBaseHtml] = useState('');
  /** The user chose to edit a formatted letter as plain text (formatting will be dropped on save). */
  const [plainUnlocked, setPlainUnlocked] = useState(false);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [templateOpen, setTemplateOpen] = useState(false);
  const [customColor, setCustomColor] = useState('');
  const [rewriteOpen, setRewriteOpen] = useState(false);
  const [paragraphDraft, setParagraphDraft] = useState<{ original: string; suggestion: string } | null>(null);

  // Once per letter id. Re-applying React Query data called setCoverLetter,
  // which sets isDirty=false and would drop in-progress edits / skip the PUT.
  // AI/web store HTML; TextInput needs plain text.
  useEffect(() => {
    if (!id || !cl) return;
    if (hydratedId === id) return;
    const html = cl.content ?? '';
    setCoverLetter({ ...cl, content: contentForEditor(html) });
    setSavedHtml(html);
    setBaseHtml(html);
    setPlainUnlocked(false);
    // Like the website: open "Letter details" when the letter is not addressed to anyone.
    setDetailsOpen(!cl.recipientName?.trim() && !cl.companyName?.trim());
    setHydratedId(id);
  }, [id, cl, hydratedId, setCoverLetter]);

  const guardExit = hydratedId === id && isDirty;
  usePreventRemove(guardExit, ({ data }) => {
    confirmUnsavedLeave(() => navigation.dispatch(data.action));
  });

  const goToBilling = () => router.push('/(dashboard)/settings/billing');
  const richLocked = hasRichFormatting(baseHtml) && !plainUnlocked;

  const ensureAICredits = (): boolean => {
    if (!canUseAI(user?.subscription, user?.usage?.aiCreditsUsed ?? 0, user?.usage?.aiCreditsLimit)) {
      Alert.alert(tl('ai.creditsExhausted'), aiCreditsExhaustedMessage('coverLetter'), upgradeAlertButtons(goToBilling));
      return false;
    }
    return true;
  };

  const handleSave = async (): Promise<boolean> => {
    const snapshot = useCoverLetterStore.getState().coverLetter;
    if (!snapshot) return false;
    if (!useCoverLetterStore.getState().isDirty) return true;
    setIsSaving(true);
    try {
      // Content only when the text really changed; otherwise the stored HTML
      // (and any formatting from the website) is left exactly as it is.
      const content = contentToSave({ savedHtml, baseHtml, editorText: snapshot.content });
      // UpdateCoverLetterDto + forbidNonWhitelisted — never send the full document.
      await updateCL.mutateAsync(buildEditorUpdate(snapshot, content));
      if (content !== undefined) {
        setSavedHtml(content);
        setBaseHtml(content);
      }
      // Edits typed while the request was in flight stay unsaved.
      if (useCoverLetterStore.getState().coverLetter === snapshot) {
        if (content !== undefined) patchClean({ content: contentForEditor(content) });
        markClean();
      }
      return true;
    } catch (err) {
      const message =
        axios.isAxiosError(err) && err.response?.status === 403 && nestErrorMessage(err)
          ? nestErrorMessage(err)
          : saveFailureMessage(err);
      Alert.alert(tl('editor.saveErrorTitle'), message);
      return false;
    } finally {
      setIsSaving(false);
    }
  };

  const runExport = async (format: 'pdf' | 'docx') => {
    const exports = user?.usage?.exportsThisMonth ?? 0;

    if (!canExport(user?.subscription, exports)) {
      Alert.alert(tl('editor.exportLimitTitle'), exportLimitReachedMessage(), upgradeAlertButtons(goToBilling));
      return;
    }
    // The server renders the saved letter, so pending edits go first.
    if (!(await handleSave())) return;
    exportCL.mutate({ clId: id!, format });
  };

  const handleExport = () => {
    Alert.alert(tl('editor.exportTitle'), tl('editor.exportChooseFormat'), [
      { text: 'PDF', onPress: () => void runExport('pdf') },
      { text: 'DOCX', onPress: () => void runExport('docx') },
      { text: tc('cancel'), style: 'cancel' },
    ]);
  };

  const handleToggleStatus = () => {
    if (!coverLetter || setStatus.isPending) return;
    const next = coverLetter.status === CoverLetterStatus.FINAL ? CoverLetterStatus.DRAFT : CoverLetterStatus.FINAL;
    setStatus.mutate(next, {
      onSuccess: () => patchClean({ status: next }),
      onError: (err) =>
        Alert.alert(tl('editor.statusErrorTitle'), requestFailureMessage(err, tl('editor.statusError'))),
    });
  };

  const runGenerate = async () => {
    if (!coverLetter) return;
    try {
      const updated = await generateCL.mutateAsync({
        jobTitle: coverLetter.jobTitle ?? '',
        jobDescription: coverLetter.jobDescription ?? '',
        companyName: coverLetter.companyName ?? '',
        tone,
        linkedCVId: coverLetter.linkedCVId || undefined,
      });
      // The API already saved the new letter: it is both the saved and the base HTML.
      const html = updated.content ?? '';
      setSavedHtml(html);
      setBaseHtml(html);
      setPlainUnlocked(false);
      patchClean({ content: contentForEditor(html), aiGenerated: true });
      await syncUser();
      await queryClient.invalidateQueries({ queryKey: ['user'] });
    } catch (err) {
      if (alertIfUnverifiedEmail(err)) return;
      Alert.alert(tl('ai.couldNotGenerate'), generateFailureMessage(err));
    }
  };

  const handleAIGenerate = () => {
    if (!coverLetter || generateCL.isPending) return;
    if (!ensureAICredits()) return;
    // It replaces the whole letter, so confirm when there is something to lose (web).
    if (coverLetter.content.trim()) {
      Alert.alert(
        tl('editor.replaceLetterTitle'),
        tl('editor.replaceLetterBody'),
        [
          { text: tc('cancel'), style: 'cancel' },
          { text: tl('editor.replace'), style: 'destructive', onPress: () => void runGenerate() },
        ],
      );
      return;
    }
    void runGenerate();
  };

  const openRewrite = () => {
    if (!coverLetter) return;
    if (splitParagraphs(coverLetter.content).length === 0) {
      Alert.alert(tl('editor.nothingToRewriteTitle'), tl('editor.nothingToRewriteBody'));
      return;
    }
    setParagraphDraft(null);
    setRewriteOpen(true);
  };

  const requestRewrite = (paragraph: string) => {
    if (!coverLetter || rewrite.isPending) return;
    if (!ensureAICredits()) return;
    rewrite.mutate(
      { letterText: coverLetter.content, paragraph },
      {
        onSuccess: (suggestion) => setParagraphDraft({ original: paragraph, suggestion }),
        onError: (err) => {
          if (alertIfUnverifiedEmail(err)) return;
          Alert.alert(
            tl('editor.rewriteErrorTitle'),
            [requestFailureMessage(err, tl('ai.generationFailed')), aiChargeNote(err)].join('\n\n'),
          );
        },
      },
    );
  };

  /** Swap the approved text in, leaving every other paragraph untouched. */
  const applyRewrite = () => {
    const current = useCoverLetterStore.getState().coverLetter;
    if (!current || !paragraphDraft?.suggestion.trim()) return;
    const result = applyParagraphRewrite({
      baseHtml,
      editorText: current.content,
      original: paragraphDraft.original,
      replacement: paragraphDraft.suggestion,
      allowPlainEdit: !richLocked,
    });
    if (result.kind === 'html') {
      setBaseHtml(result.html);
      setContent(result.text);
    } else if (result.kind === 'text') {
      setContent(result.text);
    } else if (result.kind === 'locked') {
      Alert.alert(tl('editor.replaceErrorTitle'), tl('editor.replaceLocked'));
      return;
    } else {
      Alert.alert(tl('editor.replaceErrorTitle'), tl('editor.replaceNotFound'));
    }
    setParagraphDraft(null);
    setRewriteOpen(false);
  };

  const closeRewrite = () => {
    if (rewrite.isPending) return;
    setParagraphDraft(null);
    setRewriteOpen(false);
  };

  const confirmPlainEdit = () => {
    Alert.alert(
      tl('editor.plainEditTitle'),
      tl('editor.plainEditBody'),
      [
        { text: tc('cancel'), style: 'cancel' },
        { text: tl('editor.plainEditAction'), style: 'destructive', onPress: () => setPlainUnlocked(true) },
      ],
    );
  };

  const handlePickTemplate = (template: CoverLetterTemplateOption) => {
    if (!coverLetter) return;
    if (!canAccessTemplate(user?.subscription, template.tier)) {
      Alert.alert(
        lockedTemplateTitle(template.tier),
        lockedTemplateMessage(template.name, template.tier, effectivePlanForCopy(user?.subscription)),
        upgradeAlertButtons(() => {
          setTemplateOpen(false);
          goToBilling();
        }),
      );
      return;
    }
    const pick = pickTemplate(template, coverLetter.styling);
    setTemplate(pick.templateId, pick.primaryColor);
  };

  const applyCustomColor = () => {
    const value = customColor.trim();
    if (!HEX_COLOR.test(value)) {
      Alert.alert(tl('editor.customColor'), tl('editor.customColorInvalid'));
      return;
    }
    updateStyling('primaryColor', value.toLowerCase());
    setCustomColor('');
  };

  if (error) {
    return (
      <SafeAreaView className="flex-1 bg-white" edges={['top', 'bottom']}>
        <View className="flex-row items-center px-4 py-3 border-b border-stone-100">
          <TouchableOpacity onPress={() => router.back()} className="me-3" accessibilityRole="button" accessibilityLabel={tc('back')}>
            <Ionicons name="arrow-back" size={22} color={colors.stone[700]} style={RTL_FLIP} />
          </TouchableOpacity>
          <Text className="font-bold text-stone-900">{tl('editor.fallbackTitle')}</Text>
        </View>
        <ErrorState
          message={requestFailureMessage(error, tl('editor.loadError'))}
          onRetry={() => void refetch()}
        />
      </SafeAreaView>
    );
  }

  if (isLoading || hydratedId !== id || !coverLetter) {
    return (
      <SafeAreaView className="flex-1 bg-white items-center justify-center">
        <ActivityIndicator size="large" color={colors.brand[600]} />
      </SafeAreaView>
    );
  }

  const isFinal = coverLetter.status === CoverLetterStatus.FINAL;
  const currentTemplate = templateById(coverLetter.templateId);
  const accent = coverLetter.styling?.primaryColor || currentTemplate?.defaultColor || '#2563eb';
  const summary = addressedTo(coverLetter);
  const paragraphs = rewriteOpen && !paragraphDraft ? splitParagraphs(coverLetter.content) : [];

  return (
    <SafeAreaView className="flex-1 bg-white" edges={['top', 'bottom']}>
      <View className="flex-row items-center justify-between px-4 py-3 border-b border-stone-100">
        <TouchableOpacity
          onPress={() => router.back()}
          accessibilityRole="button"
          accessibilityLabel={tc('back')}
          className="w-11 h-11 items-center justify-center -ms-2"
        >
          <Ionicons name="arrow-back" size={22} color={colors.stone[700]} style={RTL_FLIP} />
        </TouchableOpacity>
        <View className="flex-1 px-2">
          <Text className="font-bold text-stone-900 text-center" numberOfLines={1}>
            {coverLetter.title || tl('editor.fallbackTitle')}
          </Text>
          {isDirty && (
            <Text className="text-xs text-brand-400 text-center">{tl('editor.unsaved')}</Text>
          )}
        </View>
        <View className="flex-row gap-2">
          {isDirty && (
            <TouchableOpacity
              onPress={() => void handleSave()}
              disabled={isSaving}
              accessibilityRole="button"
              accessibilityLabel={tc('save')}
              className="bg-brand-600 px-3 min-h-11 justify-center rounded-xl"
            >
              {isSaving ? <ActivityIndicator size="small" color={colors.white} /> : <Text className="text-white font-semibold text-sm">{tc('save')}</Text>}
            </TouchableOpacity>
          )}
          <TouchableOpacity
            onPress={handleExport}
            disabled={exportCL.isPending || isSaving}
            accessibilityRole="button"
            accessibilityLabel={tl('editor.exportA11y')}
            accessibilityState={{ disabled: exportCL.isPending || isSaving, busy: exportCL.isPending }}
            className="bg-brand-600 w-11 h-11 items-center justify-center rounded-xl"
          >
            {exportCL.isPending ? <ActivityIndicator size="small" color={colors.white} /> : <Ionicons name="download-outline" size={18} color={colors.white} />}
          </TouchableOpacity>
        </View>
      </View>

      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} className="flex-1">
        <ScrollView className="flex-1 px-5 pt-4" keyboardShouldPersistTaps="handled">
          {/* Status + template row */}
          <View className="flex-row items-center flex-wrap gap-2 mb-4">
            <View className={['px-3 py-1 rounded-full', isFinal ? 'bg-success-bg' : 'bg-stone-100'].join(' ')}>
              <Text className={['text-xs font-semibold', isFinal ? 'text-success' : 'text-stone-500'].join(' ')}>
                {isFinal ? tl('status.final') : tl('status.draft')}
              </Text>
            </View>
            <TouchableOpacity
              onPress={handleToggleStatus}
              disabled={setStatus.isPending}
              accessibilityRole="button"
              accessibilityState={{ disabled: setStatus.isPending, busy: setStatus.isPending }}
              className="flex-row items-center px-3 min-h-11 rounded-xl border border-stone-200"
            >
              {setStatus.isPending ? (
                <ActivityIndicator size="small" color={colors.stone[700]} />
              ) : (
                <Ionicons name={isFinal ? 'arrow-undo-outline' : 'checkmark-done-outline'} size={16} color={colors.stone[700]} />
              )}
              <Text className="ms-1.5 text-sm font-medium text-stone-700">{isFinal ? tl('editor.markDraft') : tl('editor.markFinal')}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => setTemplateOpen(true)}
              accessibilityRole="button"
              accessibilityLabel={tl('editor.templateA11y', { name: currentTemplate?.name ?? tl('templates.modern.name') })}
              className="flex-row items-center px-3 min-h-11 rounded-xl border border-stone-200"
            >
              <View className="w-4 h-4 rounded-full" style={{ backgroundColor: accent }} />
              <Text className="ms-1.5 text-sm font-medium text-stone-700">{currentTemplate?.name ?? tl('editor.template')}</Text>
              <Ionicons name="chevron-down" size={14} color={colors.stone[500]} style={{ marginStart: 4 }} />
            </TouchableOpacity>
          </View>

          {/* Letter details (web: title in the toolbar, sender row, collapsible details) */}
          <View className="border border-stone-200 rounded-xl mb-4 overflow-hidden">
            <TouchableOpacity
              onPress={() => setDetailsOpen((v) => !v)}
              accessibilityRole="button"
              accessibilityState={{ expanded: detailsOpen }}
              accessibilityLabel={tl('editor.letterDetailsA11y', { summary: summary || tl('editor.notAddressed') })}
              className="flex-row items-center px-3 min-h-11 bg-stone-50"
            >
              <Ionicons
                name={detailsOpen ? 'chevron-down' : 'chevron-forward'}
                size={16}
                color={colors.stone[500]}
                style={detailsOpen ? undefined : RTL_FLIP}
              />
              <Text className="ms-2 font-medium text-stone-700">{tl('editor.letterDetails')}</Text>
              <Text className="ms-2 flex-1 text-xs text-stone-400" numberOfLines={1}>
                {summary || tl('editor.notAddressed')}
              </Text>
            </TouchableOpacity>
            {detailsOpen && (
              <View className="px-3 pt-3">
                <Text className="text-xs text-stone-500 mb-3">
                  {tl('editor.letterDetailsHint')}
                </Text>
                <Input
                  label={tl('editor.titleLabel')}
                  value={coverLetter.title ?? ''}
                  onChangeText={(v) => updateField('title', v)}
                  placeholder={tl('editor.titlePlaceholder')}
                  maxLength={COVER_LETTER_MAX.title}
                />
                {DETAIL_FIELDS.map(({ field, label }) => (
                  <Input
                    key={field}
                    label={label(tl)}
                    value={(coverLetter[field] as string | undefined) ?? ''}
                    onChangeText={(v) => updateField(field as keyof CoverLetter, v)}
                    maxLength={COVER_LETTER_MAX[field]}
                  />
                ))}
                <Text className="text-sm font-semibold text-stone-700 mb-2">{tl('editor.yourDetails')}</Text>
                <Input
                  label={tl('editor.yourName')}
                  value={coverLetter.styling?.senderName ?? ''}
                  onChangeText={(v) => updateStyling('senderName', v)}
                  maxLength={COVER_LETTER_MAX.senderName}
                  autoComplete="name"
                />
                <Input
                  label={tl('editor.yourEmail')}
                  value={coverLetter.styling?.senderEmail ?? ''}
                  onChangeText={(v) => updateStyling('senderEmail', v)}
                  maxLength={COVER_LETTER_MAX.senderEmail}
                  keyboardType="email-address"
                  autoCapitalize="none"
                  autoComplete="email"
                />
              </View>
            )}
          </View>

          <Text className="text-sm font-medium text-stone-700 mb-2">{tl('editor.writingTone')}</Text>
          <View className="flex-row flex-wrap gap-2 mb-4" accessibilityRole="radiogroup">
            {TONE_OPTIONS.map((option) => (
              <TouchableOpacity
                key={option.value}
                onPress={() => setTone(option.value)}
                accessibilityRole="radio"
                accessibilityState={{ checked: tone === option.value }}
                className={['flex-row items-center px-4 min-h-11 rounded-xl border', tone === option.value ? 'border-brand-600 bg-brand-50' : 'border-stone-200'].join(' ')}
              >
                <Ionicons name={option.icon as any} size={16} color={tone === option.value ? colors.brand[600] : colors.stone[500]} />
                <Text className={['ms-2 font-medium', tone === option.value ? 'text-brand-700' : 'text-stone-600'].join(' ')}>{option.label}</Text>
              </TouchableOpacity>
            ))}
          </View>

          <TouchableOpacity
            onPress={handleAIGenerate}
            disabled={generateCL.isPending}
            accessibilityRole="button"
            accessibilityState={{ disabled: generateCL.isPending, busy: generateCL.isPending }}
            className="flex-row items-center justify-center border border-brand-300 bg-brand-50 rounded-xl py-3 px-4 mb-4"
          >
            {generateCL.isPending ? (
              <ActivityIndicator size="small" color={colors.brand[600]} />
            ) : (
              <Ionicons name="sparkles" size={18} color={colors.brand[600]} />
            )}
            <Text className="text-brand-600 font-semibold ms-2">
              {generateCL.isPending ? tl('ai.generating') : coverLetter.content ? tl('ai.regenerate') : tl('ai.generate')}
            </Text>
          </TouchableOpacity>

          <View className="flex-row items-center justify-between mb-2">
            <Text className="text-sm font-medium text-stone-700">{tl('editor.letterContent')}</Text>
            <TouchableOpacity
              onPress={openRewrite}
              accessibilityRole="button"
              accessibilityLabel={tl('editor.rewriteA11y')}
              className="flex-row items-center px-2 min-h-11"
            >
              <Ionicons name="color-wand-outline" size={16} color={colors.brand[600]} />
              <Text className="text-brand-600 text-sm font-semibold ms-1.5">{tl('editor.rewriteParagraph')}</Text>
            </TouchableOpacity>
          </View>

          {richLocked && (
            <View className="bg-warning-bg rounded-xl p-3 mb-3">
              <Text className="text-sm text-stone-700">
                {tl('editor.richLocked')}
              </Text>
              <TouchableOpacity onPress={confirmPlainEdit} accessibilityRole="button" className="min-h-11 justify-center">
                <Text className="text-brand-600 font-semibold text-sm">{tl('editor.plainEditAction')}</Text>
              </TouchableOpacity>
            </View>
          )}

          <View className={['border rounded-xl overflow-hidden mb-6', richLocked ? 'border-stone-100 bg-stone-50' : 'border-stone-200'].join(' ')}>
            <TextInput
              value={coverLetter.content ?? ''}
              onChangeText={setContent}
              editable={!richLocked}
              multiline
              accessibilityLabel={tl('editor.letterContentA11y')}
              placeholder={tl('editor.contentPlaceholder')}
              placeholderTextColor={colors.stone[400]}
              className="p-4 text-base text-stone-900 min-h-96"
              textAlignVertical="top"
            />
          </View>

          <View className="h-8" />
        </ScrollView>
      </KeyboardAvoidingView>

      {/* Template + accent colour (web toolbar "Template" menu). */}
      <Modal visible={templateOpen} onClose={() => setTemplateOpen(false)} title={tl('editor.chooseTemplate')} size="lg">
        {COVER_LETTER_TEMPLATES.map((template) => {
          const active = activeTemplateId(coverLetter.templateId) === template.id;
          const locked = !canAccessTemplate(user?.subscription, template.tier);
          const swatch = active ? accent : template.defaultColor;
          return (
            <TouchableOpacity
              key={template.id}
              onPress={() => handlePickTemplate(template)}
              accessibilityRole="radio"
              accessibilityState={{ checked: active }}
              accessibilityLabel={[template.name, template.description, locked ? tl('editor.locked') : '']
                .filter(Boolean)
                .join('. ')}
              className={[
                'flex-row items-center p-3 rounded-xl border-2 mb-2 min-h-11',
                active ? 'border-brand-500 bg-brand-50' : 'border-stone-200',
                locked ? 'opacity-60' : '',
              ].join(' ')}
            >
              <View className="w-8 h-8 rounded-lg items-center justify-center" style={{ backgroundColor: swatch }}>
                {active ? <Ionicons name="checkmark" size={16} color={colors.white} /> : null}
              </View>
              <View className="ms-3 flex-1">
                <Text className="font-semibold text-stone-900">{template.name}</Text>
                <Text className="text-xs text-stone-500">{template.description}</Text>
              </View>
              {locked ? <Ionicons name="lock-closed" size={16} color={colors.stone[500]} /> : null}
            </TouchableOpacity>
          );
        })}

        <Text className="text-sm font-medium text-stone-700 mt-3 mb-2">{tl('editor.accentColor')}</Text>
        <View className="flex-row flex-wrap">
          {ACCENT_COLORS.map((color) => {
            const selected = isSameColor(coverLetter.styling?.primaryColor, color);
            return (
              <TouchableOpacity
                key={color}
                onPress={() => updateStyling('primaryColor', color)}
                accessibilityRole="radio"
                accessibilityState={{ checked: selected }}
                accessibilityLabel={tl('editor.accentColorA11y', { color })}
                className="w-11 h-11 items-center justify-center"
              >
                <View
                  className={['w-8 h-8 rounded-full items-center justify-center', selected ? 'border-2 border-stone-900' : ''].join(' ')}
                  style={{ backgroundColor: color }}
                >
                  {selected ? <Ionicons name="checkmark" size={14} color={colors.white} /> : null}
                </View>
              </TouchableOpacity>
            );
          })}
        </View>
        <View className="flex-row items-end mt-2">
          <View className="flex-1 me-2">
            <Input
              label={tl('editor.customColor')}
              placeholder="#2563eb"
              value={customColor}
              onChangeText={setCustomColor}
              autoCapitalize="none"
              autoCorrect={false}
              maxLength={7}
              onSubmitEditing={applyCustomColor}
            />
          </View>
          <View className="mb-4">
            <Button variant="outline" onPress={applyCustomColor} disabled={!customColor.trim()}>
              {tl('editor.apply')}
            </Button>
          </View>
        </View>
        <Text className="text-xs text-stone-500 mb-4">
          {tl('editor.templateNote')}
        </Text>
        <Button variant="primary" fullWidth onPress={() => setTemplateOpen(false)}>
          {tl('editor.done')}
        </Button>
        <View className="h-6" />
      </Modal>

      {/* Rewrite one paragraph: choose → review → replace (web "Rewrite paragraph"). */}
      <Modal
        visible={rewriteOpen}
        onClose={closeRewrite}
        closeDisabled={rewrite.isPending}
        title={tl('editor.rewriteTitle')}
        size="lg"
      >
        {paragraphDraft ? (
          <View>
            <Text className="text-xs font-semibold uppercase text-stone-400 mb-1.5">{tl('editor.currentParagraph')}</Text>
            <Text className="text-sm text-stone-600 bg-stone-50 rounded-lg p-3 mb-4">{paragraphDraft.original}</Text>
            <Text className="text-xs font-semibold uppercase text-stone-400 mb-1.5">{tl('editor.suggestedReplacement')}</Text>
            <TextInput
              value={paragraphDraft.suggestion}
              onChangeText={(v) => setParagraphDraft((d) => (d ? { ...d, suggestion: v } : d))}
              multiline
              accessibilityLabel={tl('editor.suggestedReplacement')}
              textAlignVertical="top"
              className="border border-stone-200 rounded-xl p-3 text-base text-stone-900 min-h-40 mb-4"
            />
            <View className="gap-3">
              <Button
                variant="primary"
                fullWidth
                disabled={!paragraphDraft.suggestion.trim()}
                onPress={applyRewrite}
                icon={<Ionicons name="checkmark" size={18} color={colors.white} />}
              >
                {tl('editor.replaceParagraph')}
              </Button>
              <Button variant="ghost" fullWidth onPress={closeRewrite}>
                {tc('cancel')}
              </Button>
            </View>
          </View>
        ) : rewrite.isPending ? (
          <View className="items-center py-10" accessibilityLiveRegion="polite">
            <ActivityIndicator size="large" color={colors.brand[600]} />
            <Text className="text-stone-500 mt-3">{tl('editor.rewriting')}</Text>
          </View>
        ) : (
          <View>
            <Text className="text-sm text-stone-500 mb-3">
              {tl('editor.rewriteHint')}
            </Text>
            {paragraphs.map((paragraph, index) => (
              <TouchableOpacity
                key={`${index}-${paragraph.slice(0, 16)}`}
                onPress={() => requestRewrite(paragraph)}
                accessibilityRole="button"
                accessibilityLabel={tl('editor.rewriteParagraphA11y', { number: index + 1 })}
                className="border border-stone-200 rounded-xl p-3 mb-2 min-h-11"
              >
                <Text className="text-sm text-stone-700" numberOfLines={4}>{paragraph}</Text>
              </TouchableOpacity>
            ))}
          </View>
        )}
      </Modal>
    </SafeAreaView>
  );
}
