import React, { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useCVStore } from '../../../store/cv-store';
import { useGenerateSummary } from '../../../hooks/useAI';
import { useAuthStore } from '../../../store/auth-store';
import { canUseAI } from '../../../lib/utils';

interface SummaryStepProps {
  onValidChange: (isValid: boolean) => void;
}

export function SummaryStep({ onValidChange }: SummaryStepProps) {
  const { cv, updatePersonalInfo } = useCVStore();
  const { user } = useAuthStore();
  const [summary, setSummary] = useState(cv?.personalInfo.summary ?? '');
  const generateSummary = useGenerateSummary();

  const handleChange = (text: string) => {
    setSummary(text);
    updatePersonalInfo('summary', text);
    onValidChange(true); // summary is optional
  };

  const handleGenerate = async () => {
    if (!user) return;
    if (!canUseAI(user.subscription?.plan, user.usage?.aiCreditsUsed)) {
      Alert.alert('AI Credits Exhausted', 'Upgrade your plan to get more AI credits.');
      return;
    }

    if (!cv?.personalInfo.firstName) {
      Alert.alert('Missing Info', 'Please fill in your personal info first.');
      return;
    }

    try {
      const result = await generateSummary.mutateAsync({
        type: 'cv-summary',
        context: {
          name: `${cv.personalInfo.firstName} ${cv.personalInfo.lastName}`,
          headline: cv.personalInfo.headline,
        },
      });
      setSummary(result.content);
      updatePersonalInfo('summary', result.content);
    } catch {
      Alert.alert('Error', 'Failed to generate summary. Please try again.');
    }
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      className="flex-1"
    >
      <ScrollView className="flex-1 px-5" keyboardShouldPersistTaps="handled">
        <Text className="text-lg font-bold text-stone-900 mb-1">Professional Summary</Text>
        <Text className="text-stone-500 mb-5 text-sm">
          Write a compelling summary that highlights your expertise and career goals.
        </Text>

        <View className="border border-stone-200 rounded-xl overflow-hidden mb-3">
          <TextInput
            value={summary}
            onChangeText={handleChange}
            multiline
            numberOfLines={8}
            placeholder="Results-driven software engineer with 5+ years of experience building scalable web applications..."
            placeholderTextColor="#a8a29e"
            className="p-4 text-base text-stone-900 min-h-48"
            textAlignVertical="top"
          />
          <View className="border-t border-stone-100 px-4 py-2 flex-row justify-between items-center bg-stone-50">
            <Text className="text-xs text-stone-400">{summary.length} characters</Text>
            <Text className="text-xs text-stone-400">
              Recommended: 150-300 characters
            </Text>
          </View>
        </View>

        {/* AI Generate Button */}
        <TouchableOpacity
          onPress={handleGenerate}
          disabled={generateSummary.isPending}
          className="flex-row items-center justify-center border border-brand-300 bg-brand-50 rounded-xl py-3 px-4"
        >
          {generateSummary.isPending ? (
            <ActivityIndicator size="small" color="#f97316" />
          ) : (
            <Ionicons name="sparkles" size={18} color="#f97316" />
          )}
          <Text className="text-brand-600 font-semibold ml-2">
            {generateSummary.isPending ? 'Generating...' : 'Generate with AI'}
          </Text>
        </TouchableOpacity>

        {user && (
          <Text className="text-xs text-stone-400 text-center mt-2">
            {(user.usage?.aiCreditsLimit ?? 0) - (user.usage?.aiCreditsUsed ?? 0)} AI credits remaining
          </Text>
        )}

        <View className="h-8" />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
