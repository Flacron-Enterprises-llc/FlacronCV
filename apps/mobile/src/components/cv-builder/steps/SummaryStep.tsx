import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
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
import { useQueryClient } from '@tanstack/react-query';
import axios from 'axios';
import { useCVStore } from '../../../store/cv-store';
import { useGenerateSummary } from '../../../hooks/useAI';
import { useAuthStore } from '../../../store/auth-store';
import { AiConsentDeclinedError } from '../../../lib/ai-consent-rules';
import { canUseAI, planForDisplay } from '../../../lib/entitlements';
import { alertIfUnverifiedEmail } from '../../../lib/email-verification';
import {
  aiCreditsExhaustedMessage,
  upgradeAlertButtons,
} from '../../../config/paid-upgrades';
import { colors } from '../../../theme/colors';
import { CV, CVSection, CVSectionItem, ExperienceItem, SkillItem } from '../../../types/cv.types';
import { CVSectionType } from '../../../types/enums';
import { t as tNow, useT } from '../../../i18n';

interface SummaryStepProps {
  onValidChange: (isValid: boolean) => void;
}

const EXPERIENCE_MAX = 20000;
const SKILLS_MAX = 8000;
const TARGET_ROLE_MAX = 200;

function clampDto(text: string, max: number): string {
  return text.length <= max ? text : text.slice(0, max);
}

function isExperienceItem(item: CVSectionItem): item is ExperienceItem {
  return 'company' in item && 'position' in item;
}

function isSkillItem(item: CVSectionItem): item is SkillItem {
  return 'name' in item && 'level' in item;
}

function formatExperienceItem(item: ExperienceItem): string {
  const role = [item.position, item.company].filter(Boolean).join(' at ');
  const dates = item.isCurrent
    ? [item.startDate, 'Present'].filter(Boolean).join(' – ')
    : [item.startDate, item.endDate].filter(Boolean).join(' – ');
  const highlights = (item.highlights ?? [])
    .map((h) => h.trim())
    .filter(Boolean)
    .join('; ');
  return [role, item.location, dates, item.description?.trim(), highlights]
    .filter((part): part is string => Boolean(part && part.trim()))
    .join('. ');
}

function formatSkillItem(item: SkillItem): string {
  const name = item.name?.trim() ?? '';
  if (!name) return '';
  const extras = [item.level, item.category].filter(Boolean);
  return extras.length > 0 ? `${name} (${extras.join(', ')})` : name;
}

function experienceFromStore(sections: CVSection[]): string {
  const section = sections.find((s) => s.type === CVSectionType.EXPERIENCE);
  return clampDto(
    (section?.items ?? [])
      .filter(isExperienceItem)
      .map(formatExperienceItem)
      .filter(Boolean)
      .join('\n')
      .trim(),
    EXPERIENCE_MAX,
  );
}

function skillsFromStore(sections: CVSection[]): string {
  const section = sections.find((s) => s.type === CVSectionType.SKILLS);
  return clampDto(
    (section?.items ?? [])
      .filter(isSkillItem)
      .map(formatSkillItem)
      .filter(Boolean)
      .join(', ')
      .trim(),
    SKILLS_MAX,
  );
}

function targetRoleFromStore(cv: CV | null): string {
  return clampDto((cv?.personalInfo.headline ?? '').trim(), TARGET_ROLE_MAX);
}

function emptyGenerateReason(
  experience: string,
  skills: string,
  targetRole: string,
): string | null {
  const h = !targetRole;
  const e = !experience;
  const s = !skills;
  if (h && e && s) return tNow('cvEditor.summary.missing.all');
  if (h && e) return tNow('cvEditor.summary.missing.headlineExperience');
  if (h && s) return tNow('cvEditor.summary.missing.headlineSkills');
  if (e && s) return tNow('cvEditor.summary.missing.experienceSkills');
  if (h) return tNow('cvEditor.summary.missing.headline');
  if (e) return tNow('cvEditor.summary.missing.experience');
  if (s) return tNow('cvEditor.summary.missing.skills');
  return null;
}

function generateFailureMessage(err: unknown): string {
  if (err instanceof AiConsentDeclinedError) return tNow('common.aiConsent.declined');
  if (axios.isAxiosError(err) && !err.response) {
    return tNow('common.noConnection');
  }
  const data = axios.isAxiosError(err) ? err.response?.data : undefined;
  const rec = data && typeof data === 'object' ? (data as Record<string, unknown>) : {};
  const message = typeof rec.message === 'string' ? rec.message : '';
  const code = typeof rec.code === 'string' ? rec.code : '';

  if (code === 'AI_CREDIT_NOT_REFUNDED') {
    return tNow('cvEditor.summary.creditMaybeUsed');
  }
  if (/credit/i.test(message)) {
    return aiCreditsExhaustedMessage('summaryHttp');
  }
  return tNow('cvEditor.summary.generateFailed');
}

export function SummaryStep({ onValidChange }: SummaryStepProps) {
  const router = useRouter();
  const { cv, sections, updatePersonalInfo } = useCVStore();
  const { user, syncUser } = useAuthStore();
  const queryClient = useQueryClient();
  const [summary, setSummary] = useState(cv?.personalInfo.summary ?? '');
  const generateSummary = useGenerateSummary();
  const t = useT('cvEditor');

  const experience = experienceFromStore(sections);
  const skills = skillsFromStore(sections);
  const targetRole = targetRoleFromStore(cv);
  const emptyReason = emptyGenerateReason(experience, skills, targetRole);
  const canBuildBody = emptyReason === null;

  const handleChange = (text: string) => {
    setSummary(text);
    updatePersonalInfo('summary', text);
    onValidChange(true); // summary is optional
  };

  const handleGenerate = async () => {
    if (!user) {
      Alert.alert(t('summary.accountNotLoadedTitle'), t('summary.accountNotLoadedBody'));
      return;
    }
    if (!canUseAI(
      user.subscription,
      user.usage?.aiCreditsUsed ?? 0,
      user.usage?.aiCreditsLimit,
    )) {
      Alert.alert(
        t('summary.creditsExhaustedTitle'),
        aiCreditsExhaustedMessage('summary', planForDisplay(user.subscription)),
        upgradeAlertButtons(() => router.push('/(dashboard)/settings/plans')),
      );
      return;
    }
    if (!canBuildBody) {
      return;
    }

    try {
      const result = await generateSummary.mutateAsync({
        experience,
        skills,
        targetRole,
      });
      setSummary(result.content);
      updatePersonalInfo('summary', result.content);
      await syncUser();
      await queryClient.invalidateQueries({ queryKey: ['user'] });
    } catch (err: unknown) {
      if (alertIfUnverifiedEmail(err)) return;
      Alert.alert(t('summary.generateFailedTitle'), generateFailureMessage(err));
    }
  };

  const generateDisabled = generateSummary.isPending || !canBuildBody;

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      className="flex-1"
    >
      <ScrollView className="flex-1 px-5" keyboardShouldPersistTaps="handled">
        <Text className="text-lg font-semibold text-stone-900 mb-1">{t('summary.title')}</Text>
        <Text className="text-stone-500 mb-5 text-sm">{t('summary.subtitle')}</Text>

        <View className="border border-stone-200 rounded-xl overflow-hidden mb-3">
          <TextInput
            value={summary}
            onChangeText={handleChange}
            multiline
            numberOfLines={8}
            placeholder={t('summary.placeholder')}
            placeholderTextColor={colors.stone[400]}
            className="p-4 text-base text-stone-900 min-h-48"
            textAlignVertical="top"
          />
          <View className="border-t border-stone-100 px-4 py-2 flex-row justify-between items-center bg-stone-50">
            <Text className="text-xs text-stone-400">{t('summary.characters', { count: summary.length })}</Text>
            <Text className="text-xs text-stone-400">{t('summary.recommended')}</Text>
          </View>
        </View>

        {/* AI Generate Button */}
        <TouchableOpacity
          onPress={handleGenerate}
          disabled={generateDisabled}
          className={`flex-row items-center justify-center border border-brand-300 bg-brand-50 rounded-xl py-3 px-4 ${
            generateDisabled ? 'opacity-50' : ''
          }`}
        >
          {generateSummary.isPending ? (
            <ActivityIndicator size="small" color={colors.brand[600]} />
          ) : (
            <Ionicons name="sparkles" size={18} color={colors.brand[600]} />
          )}
          <Text className="text-brand-600 font-semibold ms-2">
            {generateSummary.isPending ? t('summary.generating') : t('summary.generate')}
          </Text>
        </TouchableOpacity>

        {emptyReason ? (
          <Text className="text-xs text-stone-400 text-center mt-2">{emptyReason}</Text>
        ) : user ? (
          <Text className="text-xs text-stone-400 text-center mt-2">
            {t('summary.creditsRemaining', {
              count: (user.usage?.aiCreditsLimit ?? 0) - (user.usage?.aiCreditsUsed ?? 0),
            })}
          </Text>
        ) : null}

        <View className="h-8" />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
