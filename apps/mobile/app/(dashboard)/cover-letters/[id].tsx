import { Ionicons } from '@expo/vector-icons';
import { useNavigation, usePreventRemove } from '@react-navigation/native';
import { useLocalSearchParams, useRouter } from 'expo-router';
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

export default function CoverLetterEditorScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const navigation = useNavigation();
  const { user } = useAuthStore();
  const { coverLetter, setCoverLetter, setContent, isDirty, markClean } = useCoverLetterStore();
  const { data: cl, isLoading } = useCoverLetter(id);
  const updateCL = useUpdateCoverLetter(id!);
  const generateCL = useGenerateCoverLetter(id!);
  const exportCL = useExportCoverLetter();
  const [isSaving, setIsSaving] = useState(false);
  const [hydratedId, setHydratedId] = useState<string | null>(null);

  // Once per letter id. Re-applying React Query data called setCoverLetter,
  // which sets isDirty=false and would drop in-progress edits / skip the PUT.
  useEffect(() => {
    if (!id || !cl) return;
    if (hydratedId === id) return;
    setCoverLetter(cl);
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
      await updateCL.mutateAsync(coverLetter);
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
      Alert.alert('AI Credits Exhausted', aiCreditsExhaustedMessage('coverLetter'));
      return;
    }

    try {
      const updated = await generateCL.mutateAsync({
        jobTitle: coverLetter.jobTitle ?? '',
        jobDescription: coverLetter.jobDescription ?? '',
        companyName: coverLetter.companyName ?? '',
        tone: 'professional',
      });
      setContent(updated.content);
    } catch {
      Alert.alert('Error', 'AI generation failed. Try again.');
    }
  };

  if (isLoading || hydratedId !== id) {
    return (
      <SafeAreaView className="flex-1 bg-white items-center justify-center">
        <ActivityIndicator size="large" color="#3b82f6" />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView className="flex-1 bg-white" edges={['top', 'bottom']}>
      <View className="flex-row items-center justify-between px-4 py-3 border-b border-stone-100">
        <TouchableOpacity onPress={() => router.back()} className="flex-row items-center">
          <Ionicons name="arrow-back" size={22} color="#374151" />
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
            <TouchableOpacity onPress={() => void handleSave()} disabled={isSaving} className="bg-blue-500 px-3 py-1.5 rounded-xl">
              {isSaving ? <ActivityIndicator size="small" color="#fff" /> : <Text className="text-white font-semibold text-sm">Save</Text>}
            </TouchableOpacity>
          )}
          <TouchableOpacity onPress={handleExport} disabled={exportCL.isPending} className="bg-stone-800 px-3 py-1.5 rounded-xl">
            {exportCL.isPending ? <ActivityIndicator size="small" color="#fff" /> : <Ionicons name="download-outline" size={16} color="#fff" />}
          </TouchableOpacity>
        </View>
      </View>

      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} className="flex-1">
        <ScrollView className="flex-1 px-5 pt-4" keyboardShouldPersistTaps="handled">
          <View className="bg-blue-50 rounded-xl p-3 mb-4">
            <Text className="font-bold text-blue-900">{coverLetter?.jobTitle}</Text>
            <Text className="text-blue-600 text-sm">{coverLetter?.companyName}</Text>
            {coverLetter?.recipientName && (
              <Text className="text-blue-400 text-xs mt-0.5">Attn: {coverLetter.recipientName}</Text>
            )}
          </View>

          <TouchableOpacity
            onPress={handleAIGenerate}
            disabled={generateCL.isPending}
            className="flex-row items-center justify-center border border-purple-300 bg-purple-50 rounded-xl py-3 px-4 mb-4"
          >
            {generateCL.isPending ? (
              <ActivityIndicator size="small" color="#8b5cf6" />
            ) : (
              <Ionicons name="sparkles" size={18} color="#8b5cf6" />
            )}
            <Text className="text-purple-600 font-semibold ml-2">
              {generateCL.isPending ? 'Generating...' : coverLetter?.content ? 'Regenerate with AI' : 'Generate with AI'}
            </Text>
          </TouchableOpacity>

          <Text className="text-sm font-medium text-stone-700 mb-2">Letter Content</Text>
          <View className="border border-stone-200 rounded-xl overflow-hidden mb-6">
            <TextInput
              value={coverLetter?.content ?? ''}
              onChangeText={setContent}
              multiline
              placeholder="Write your cover letter here, or use AI to generate one..."
              placeholderTextColor="#a8a29e"
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
