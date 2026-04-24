import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, KeyboardAvoidingView, Platform, ScrollView, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Button } from '../../../src/components/ui/Button';
import { useCoverLetter, useUpdateCoverLetter, useGenerateCoverLetter } from '../../../src/hooks/useCoverLetters';
import { useExportCoverLetter } from '../../../src/hooks/useExport';
import { useCoverLetterStore } from '../../../src/store/cover-letter-store';
import { useAuthStore } from '../../../src/store/auth-store';
import { canUseAI } from '../../../src/lib/utils';
import { SubscriptionPlan } from '../../../src/types/enums';

export default function CoverLetterEditorScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { user } = useAuthStore();
  const { coverLetter, setCoverLetter, setContent, updateField, isDirty, markClean } = useCoverLetterStore();
  const { data: cl, isLoading } = useCoverLetter(id);
  const updateCL = useUpdateCoverLetter(id!);
  const generateCL = useGenerateCoverLetter(id!);
  const exportCL = useExportCoverLetter();
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (cl) setCoverLetter(cl);
  }, [cl]);

  const handleSave = async () => {
    if (!coverLetter || !isDirty) return;
    setIsSaving(true);
    try {
      await updateCL.mutateAsync(coverLetter);
      markClean();
    } catch {
      Alert.alert('Error', 'Failed to save. Please try again.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleAIGenerate = async () => {
    if (!coverLetter) return;
    const plan = user?.subscription?.plan ?? SubscriptionPlan.FREE;
    if (!canUseAI(plan, user?.usage?.aiCreditsUsed ?? 0)) {
      Alert.alert('AI Credits Exhausted', 'Upgrade to get more AI credits.');
      return;
    }

    try {
      const updated = await generateCL.mutateAsync({
        jobTitle: coverLetter.jobTitle,
        companyName: coverLetter.companyName,
        recipientName: coverLetter.recipientName,
        jobDescription: coverLetter.jobDescription,
        tone: 'professional',
      });
      setContent(updated.content);
    } catch {
      Alert.alert('Error', 'AI generation failed. Try again.');
    }
  };

  if (isLoading) {
    return (
      <SafeAreaView className="flex-1 bg-white items-center justify-center">
        <ActivityIndicator size="large" color="#3b82f6" />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView className="flex-1 bg-white" edges={['top']}>
      <View className="flex-row items-center justify-between px-4 py-3 border-b border-stone-100">
        <TouchableOpacity onPress={() => { if (isDirty) handleSave().then(() => router.back()); else router.back(); }}>
          <Ionicons name="arrow-back" size={22} color="#374151" />
        </TouchableOpacity>
        <Text className="font-bold text-stone-900 flex-1 text-center mx-2" numberOfLines={1}>
          {coverLetter?.title ?? 'Cover Letter'}
        </Text>
        <View className="flex-row gap-2">
          {isDirty && (
            <TouchableOpacity onPress={handleSave} disabled={isSaving} className="bg-blue-500 px-3 py-1.5 rounded-xl">
              {isSaving ? <ActivityIndicator size="small" color="#fff" /> : <Text className="text-white font-semibold text-sm">Save</Text>}
            </TouchableOpacity>
          )}
          <TouchableOpacity onPress={() => exportCL.mutate(id!)} disabled={exportCL.isPending} className="bg-stone-800 px-3 py-1.5 rounded-xl">
            {exportCL.isPending ? <ActivityIndicator size="small" color="#fff" /> : <Ionicons name="download-outline" size={16} color="#fff" />}
          </TouchableOpacity>
        </View>
      </View>

      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} className="flex-1">
        <ScrollView className="flex-1 px-5 pt-4" keyboardShouldPersistTaps="handled">
          {/* Job Info */}
          <View className="bg-blue-50 rounded-xl p-3 mb-4">
            <Text className="font-bold text-blue-900">{coverLetter?.jobTitle}</Text>
            <Text className="text-blue-600 text-sm">{coverLetter?.companyName}</Text>
            {coverLetter?.recipientName && (
              <Text className="text-blue-400 text-xs mt-0.5">Attn: {coverLetter.recipientName}</Text>
            )}
          </View>

          {/* AI Generate Button */}
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

          {/* Content Editor */}
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
