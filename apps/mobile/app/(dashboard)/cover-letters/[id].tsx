import { Ionicons } from '@expo/vector-icons';
import { useNavigation, usePreventRemove } from '@react-navigation/native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';
import axios from 'axios';
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, KeyboardAvoidingView, Platform, ScrollView, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useCoverLetter, useUpdateCoverLetter, useGenerateCoverLetter } from '../../../src/hooks/useCoverLetters';
import { useExportCoverLetter } from '../../../src/hooks/useExport';
import { useCoverLetterStore } from '../../../src/store/cover-letter-store';
import { useAuthStore } from '../../../src/store/auth-store';
import { canExport, canUseAI } from '../../../src/lib/entitlements';
import {
  aiCreditsExhaustedMessage,
  exportLimitReachedMessage,
  upgradeAlertButtons,
} from '../../../src/config/paid-upgrades';
import { colors } from '../../../src/theme/colors';
import { contentForEditor, toLetterHtml } from '../../../src/lib/letter-html';
import { nestErrorCode, nestErrorMessage, requestFailureMessage } from '../../../src/lib/api-errors';
import { alertIfUnverifiedEmail } from '../../../src/lib/email-verification';

const TONE_OPTIONS = [
  { value: 'professional', label: 'Professional', icon: 'business-outline' },
  { value: 'friendly', label: 'Friendly', icon: 'happy-outline' },
  { value: 'enthusiastic', label: 'Enthusiastic', icon: 'rocket-outline' },
  { value: 'formal', label: 'Formal', icon: 'ribbon-outline' },
] as const;

type CoverLetterTone = (typeof TONE_OPTIONS)[number]['value'];

/** Same copy as cvs/[id] — one Unsaved Changes dialog in the app. */
function confirmUnsavedLeave(onLeave: () => void) {
  Alert.alert('Unsaved Changes', 'You have unsaved changes. Leave anyway?', [
    { text: 'Stay', style: 'cancel' },
    { text: 'Leave', style: 'destructive', onPress: onLeave },
  ]);
}

/** Same split as CVWizard saveFailureMessage — do not extract (E1–E7 frozen). */
function saveFailureMessage(err: unknown): string {
  if (axios.isAxiosError(err) && !err.response) {
    return 'No connection. Check your network and try again.';
  }
  return 'Could not save. Please try again.';
}

function generateFailureMessage(err: unknown): string {
  const code = nestErrorCode(err);
  const message = nestErrorMessage(err);

  if (code === 'AI_CREDIT_NOT_REFUNDED') {
    return 'Could not generate. A credit may have been used. Check your balance and try again.';
  }
  if (/credit/i.test(message) || code.startsWith('ABUSE_')) {
    return message || aiCreditsExhaustedMessage('coverLetter');
  }
  return requestFailureMessage(err, 'Generation failed. Try again.');
}

export default function CoverLetterEditorScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const navigation = useNavigation();
  const { user, syncUser } = useAuthStore();
  const { coverLetter, setCoverLetter, setContent, isDirty, markClean } = useCoverLetterStore();
  const { data: cl, isLoading } = useCoverLetter(id);
  const updateCL = useUpdateCoverLetter(id!);
  const generateCL = useGenerateCoverLetter(id!);
  const exportCL = useExportCoverLetter();
  const queryClient = useQueryClient();
  const [isSaving, setIsSaving] = useState(false);
  const [hydratedId, setHydratedId] = useState<string | null>(null);
  const [tone, setTone] = useState<CoverLetterTone>('professional');

  // Once per letter id. Re-applying React Query data called setCoverLetter,
  // which sets isDirty=false and would drop in-progress edits / skip the PUT.
  // AI/web store HTML; TextInput needs plain text.
  useEffect(() => {
    if (!id || !cl) return;
    if (hydratedId === id) return;
    setCoverLetter({ ...cl, content: contentForEditor(cl.content) });
    setHydratedId(id);
  }, [id, cl, hydratedId, setCoverLetter]);

  const guardExit = hydratedId === id && isDirty;
  usePreventRemove(guardExit, ({ data }) => {
    confirmUnsavedLeave(() => navigation.dispatch(data.action));
  });

  const handleSave = async (): Promise<boolean> => {
    if (!coverLetter) return false;
    if (!isDirty) return true;
    setIsSaving(true);
    try {
      // UpdateCoverLetterDto + forbidNonWhitelisted — never send the full document.
      await updateCL.mutateAsync({
        title: coverLetter.title,
        templateId: coverLetter.templateId,
        recipientName: coverLetter.recipientName,
        recipientTitle: coverLetter.recipientTitle,
        companyName: coverLetter.companyName,
        companyAddress: coverLetter.companyAddress,
        jobTitle: coverLetter.jobTitle,
        jobDescription: coverLetter.jobDescription,
        content: toLetterHtml(coverLetter.content),
        styling: coverLetter.styling,
        status: coverLetter.status,
      });
      markClean();
      return true;
    } catch (err) {
      Alert.alert('Could not save', saveFailureMessage(err));
      return false;
    } finally {
      setIsSaving(false);
    }
  };

  const handleExport = () => {
    const exports = user?.usage?.exportsThisMonth ?? 0;

    if (!canExport(user?.subscription, exports)) {
      Alert.alert(
        'Export Limit Reached',
        exportLimitReachedMessage(),
        upgradeAlertButtons(() => router.push('/(dashboard)/settings/billing')),
      );
      return;
    }

    exportCL.mutate(id!);
  };

  const handleAIGenerate = async () => {
    if (!coverLetter) return;
    if (!canUseAI(
      user?.subscription,
      user?.usage?.aiCreditsUsed ?? 0,
      user?.usage?.aiCreditsLimit,
    )) {
      Alert.alert('Credits Exhausted', aiCreditsExhaustedMessage('coverLetter'));
      return;
    }

    try {
      const updated = await generateCL.mutateAsync({
        jobTitle: coverLetter.jobTitle ?? '',
        jobDescription: coverLetter.jobDescription ?? '',
        companyName: coverLetter.companyName ?? '',
        tone,
      });
      setContent(contentForEditor(updated.content));
      await syncUser();
      await queryClient.invalidateQueries({ queryKey: ['user'] });
    } catch (err) {
      if (alertIfUnverifiedEmail(err)) return;
      Alert.alert('Could not generate', generateFailureMessage(err));
    }
  };

  if (isLoading || hydratedId !== id) {
    return (
      <SafeAreaView className="flex-1 bg-white items-center justify-center">
        <ActivityIndicator size="large" color={colors.brand[600]} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView className="flex-1 bg-white" edges={['top', 'bottom']}>
      <View className="flex-row items-center justify-between px-4 py-3 border-b border-stone-100">
        <TouchableOpacity onPress={() => router.back()} className="flex-row items-center">
          <Ionicons name="arrow-back" size={22} color={colors.stone[700]} />
        </TouchableOpacity>
        <View className="flex-1 px-2">
          <Text className="font-bold text-stone-900 text-center" numberOfLines={1}>
            {coverLetter?.title ?? 'Cover Letter'}
          </Text>
          {isDirty && (
            <Text className="text-xs text-brand-400 text-center">Unsaved changes</Text>
          )}
        </View>
        <View className="flex-row gap-2">
          {isDirty && (
            <TouchableOpacity onPress={() => void handleSave()} disabled={isSaving} className="bg-brand-600 px-3 py-1.5 rounded-xl">
              {isSaving ? <ActivityIndicator size="small" color={colors.white} /> : <Text className="text-white font-semibold text-sm">Save</Text>}
            </TouchableOpacity>
          )}
          <TouchableOpacity onPress={handleExport} disabled={exportCL.isPending} className="bg-brand-600 px-3 py-1.5 rounded-xl">
            {exportCL.isPending ? <ActivityIndicator size="small" color={colors.white} /> : <Ionicons name="download-outline" size={16} color={colors.white} />}
          </TouchableOpacity>
        </View>
      </View>

      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} className="flex-1">
        <ScrollView className="flex-1 px-5 pt-4" keyboardShouldPersistTaps="handled">
          <View className="bg-brand-50 rounded-xl p-3 mb-4">
            <Text className="font-bold text-brand-900">{coverLetter?.jobTitle}</Text>
            <Text className="text-brand-700 text-sm">{coverLetter?.companyName}</Text>
            {coverLetter?.recipientName && (
              <Text className="text-brand-400 text-xs mt-0.5">Attn: {coverLetter.recipientName}</Text>
            )}
          </View>

          <Text className="text-sm font-medium text-stone-700 mb-2">Writing Tone</Text>
          <View className="flex-row flex-wrap gap-2 mb-4">
            {TONE_OPTIONS.map((option) => (
              <TouchableOpacity
                key={option.value}
                onPress={() => setTone(option.value)}
                className={['flex-row items-center px-4 py-2.5 rounded-xl border', tone === option.value ? 'border-brand-600 bg-brand-50' : 'border-stone-200'].join(' ')}
              >
                <Ionicons name={option.icon as any} size={16} color={tone === option.value ? colors.brand[600] : colors.stone[500]} />
                <Text className={['ml-2 font-medium', tone === option.value ? 'text-brand-700' : 'text-stone-600'].join(' ')}>{option.label}</Text>
              </TouchableOpacity>
            ))}
          </View>

          <TouchableOpacity
            onPress={handleAIGenerate}
            disabled={generateCL.isPending}
            className="flex-row items-center justify-center border border-brand-300 bg-brand-50 rounded-xl py-3 px-4 mb-4"
          >
            {generateCL.isPending ? (
              <ActivityIndicator size="small" color={colors.brand[600]} />
            ) : (
              <Ionicons name="sparkles" size={18} color={colors.brand[600]} />
            )}
            <Text className="text-brand-600 font-semibold ml-2">
              {generateCL.isPending ? 'Generating...' : coverLetter?.content ? 'Regenerate' : 'Generate'}
            </Text>
          </TouchableOpacity>

          <Text className="text-sm font-medium text-stone-700 mb-2">Letter Content</Text>
          <View className="border border-stone-200 rounded-xl overflow-hidden mb-6">
            <TextInput
              value={coverLetter?.content ?? ''}
              onChangeText={setContent}
              multiline
              placeholder="Write your cover letter here, or generate one with the Flacron Engine..."
              placeholderTextColor={colors.stone[400]}
              className="p-4 text-base text-stone-900 min-h-96"
              textAlignVertical="top"
            />
          </View>

          <View className="h-8" />
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
