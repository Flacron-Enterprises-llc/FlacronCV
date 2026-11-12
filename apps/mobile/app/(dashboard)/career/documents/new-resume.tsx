import { useRouter, type Href } from 'expo-router';
import React, { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { CareerHeader } from '../../../../src/components/career/CareerHeader';
import { Button } from '../../../../src/components/ui/Button';
import { EmptyState } from '../../../../src/components/ui/EmptyState';
import { Input } from '../../../../src/components/ui/Input';
import { useCreateResume } from '../../../../src/hooks/career/documents';
import { useCareerAccess } from '../../../../src/hooks/useCareer';
import { createResumeFailure, DEFAULT_RESUME_TITLE, RESUME_TEMPLATE_OPTIONS, resumeTitleError } from '../../../../src/lib/career/documents';

/**
 * New career CV (website: resume studio "Create resume"). Composed from the
 * facts on the career profile; creating it uses no document credit. Language
 * decides headings and dates in the CV; the layout can be changed later.
 */
export default function NewCareerResumeScreen() {
  const router = useRouter();
  const access = useCareerAccess();
  const create = useCreateResume();
  const [title, setTitle] = useState(DEFAULT_RESUME_TITLE);
  const [language, setLanguage] = useState<'en' | 'fr'>('en');
  const [templateId, setTemplateId] = useState('classic');
  const [touched, setTouched] = useState(false);
  const titleError = touched ? resumeTitleError(title) : null;

  const onCreate = () => {
    setTouched(true);
    if (resumeTitleError(title) || create.isPending) return;
    create.mutate(
      { title: title.trim(), language, templateId },
      { onSuccess: (created) => router.replace(`/(dashboard)/career/documents/resume/${created.id}` as Href) },
    );
  };

  if (access.data && !access.data.enabled) {
    return (
      <SafeAreaView className="flex-1 bg-stone-50" edges={['top', 'bottom']}>
        <CareerHeader title="New career CV" />
        <EmptyState icon="lock-closed-outline" title="Career tools are not included in your plan" description="Your FlacronCV CVs and cover letters are in their own tabs." />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView className="flex-1 bg-stone-50" edges={['top', 'bottom']}>
      <CareerHeader title="New career CV" subtitle="Built from your career facts. Uses no document credit." />
      <KeyboardAvoidingView className="flex-1" behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 120 }} keyboardShouldPersistTaps="handled">
          <View className="bg-white border border-stone-100 rounded-2xl p-4 mb-4">
            <Input label="CV name" value={title} onChangeText={setTitle} onBlur={() => setTouched(true)} maxLength={200} error={titleError ?? undefined} />
            <Text className="text-sm font-semibold text-stone-700 mt-2 mb-2">Language of the CV</Text>
            <View className="flex-row gap-2" accessibilityRole="radiogroup">
              {(['en', 'fr'] as const).map((value) => (
                <Choice key={value} label={value === 'en' ? 'English' : 'French'} selected={language === value} onPress={() => setLanguage(value)} />
              ))}
            </View>
            <Text className="text-stone-500 text-xs mt-2 leading-4">Headings and dates in the CV follow this language.</Text>
          </View>
          <View className="bg-white border border-stone-100 rounded-2xl p-4">
            <Text className="text-sm font-semibold text-stone-700 mb-1">Layout</Text>
            <Text className="text-stone-500 text-xs mb-3 leading-4">You can switch layouts later; switching keeps every saved section.</Text>
            <View className="flex-row flex-wrap gap-2" accessibilityRole="radiogroup">
              {RESUME_TEMPLATE_OPTIONS.map((option) => (
                <Choice key={option.id} label={option.name} accent={option.accent} selected={templateId === option.id} onPress={() => setTemplateId(option.id)} />
              ))}
            </View>
          </View>
          {create.error ? (
            <View className="bg-error-bg rounded-xl p-3 mt-4" accessibilityLiveRegion="polite">
              <Text className="text-error text-sm">{createResumeFailure(create.error)}</Text>
            </View>
          ) : null}
        </ScrollView>
        <View className="absolute bottom-0 left-0 right-0 bg-white border-t border-stone-100 px-5 py-3">
          <Button fullWidth onPress={onCreate} loading={create.isPending}>
            Create CV
          </Button>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function Choice({ label, selected, accent, onPress }: { label: string; selected: boolean; accent?: string; onPress: () => void }) {
  return (
    <TouchableOpacity
      onPress={onPress}
      accessibilityRole="radio"
      accessibilityState={{ selected, checked: selected }}
      accessibilityLabel={label}
      className={`min-h-[44px] px-3 rounded-xl border flex-row items-center ${selected ? 'border-brand-500 bg-brand-50' : 'border-stone-200 bg-white'}`}
      activeOpacity={0.8}
    >
      {accent ? <View style={{ backgroundColor: accent }} className="w-3 h-3 rounded-full mr-2" /> : null}
      <Text className={`text-sm ${selected ? 'font-semibold text-brand-700' : 'text-stone-700'}`}>{label}</Text>
    </TouchableOpacity>
  );
}
