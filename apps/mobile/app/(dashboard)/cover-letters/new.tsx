import { zodResolver } from '@hookform/resolvers/zod';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React, { useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { Alert, KeyboardAvoidingView, Platform, ScrollView, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { z } from 'zod';
import { Button } from '../../../src/components/ui/Button';
import { Input } from '../../../src/components/ui/Input';
import { useCreateCoverLetter } from '../../../src/hooks/useCoverLetters';
import { useAuthStore } from '../../../src/store/auth-store';
import { useCoverLetterStore } from '../../../src/store/cover-letter-store';
import { canCreateCoverLetter } from '../../../src/lib/utils';
import { CoverLetterStatus, SubscriptionPlan } from '../../../src/types/enums';

const schema = z.object({
  title: z.string().min(1, 'Title is required'),
  jobTitle: z.string().min(1, 'Job title is required'),
  companyName: z.string().min(1, 'Company name is required'),
  recipientName: z.string().optional(),
  recipientTitle: z.string().optional(),
  jobDescription: z.string().optional(),
  tone: z.enum(['professional', 'friendly', 'enthusiastic', 'formal']).default('professional'),
});

type FormData = z.infer<typeof schema>;

const TONE_OPTIONS = [
  { value: 'professional', label: 'Professional', icon: 'business-outline' },
  { value: 'friendly', label: 'Friendly', icon: 'happy-outline' },
  { value: 'enthusiastic', label: 'Enthusiastic', icon: 'rocket-outline' },
  { value: 'formal', label: 'Formal', icon: 'ribbon-outline' },
] as const;

export default function NewCoverLetterScreen() {
  const router = useRouter();
  const { user } = useAuthStore();
  const { setCoverLetter } = useCoverLetterStore();
  const createCL = useCreateCoverLetter();

  const { control, handleSubmit, formState: { errors } } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: { tone: 'professional' },
  });

  const onSubmit = async (data: FormData) => {
    const plan = user?.subscription?.plan ?? SubscriptionPlan.FREE;
    const clCount = user?.usage?.coverLettersCreated ?? 0;

    if (!canCreateCoverLetter(plan, clCount)) {
      Alert.alert(
        'Cover Letter Limit Reached',
        'Upgrade your plan to create more cover letters.',
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Upgrade', onPress: () => router.push('/(dashboard)/settings/billing') },
        ],
      );
      return;
    }

    try {
      const cl = await createCL.mutateAsync({
        title: data.title,
        jobTitle: data.jobTitle,
        companyName: data.companyName,
        recipientName: data.recipientName ?? '',
        recipientTitle: data.recipientTitle ?? '',
        jobDescription: data.jobDescription ?? '',
        content: '',
        templateId: 'modern',
        status: CoverLetterStatus.DRAFT,
        aiGenerated: false,
        styling: { fontFamily: 'Inter', fontSize: '14px', primaryColor: '#2563eb' },
      });
      setCoverLetter(cl);
      router.replace(`/(dashboard)/cover-letters/${cl.id}`);
    } catch {
      Alert.alert('Error', 'Failed to create cover letter.');
    }
  };

  return (
    <SafeAreaView className="flex-1 bg-white">
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} className="flex-1">
        <View className="flex-row items-center px-5 pt-4 pb-3 border-b border-stone-100">
          <TouchableOpacity onPress={() => router.back()} className="mr-3">
            <Ionicons name="arrow-back" size={22} color="#374151" />
          </TouchableOpacity>
          <Text className="text-xl font-black text-stone-900">New Cover Letter</Text>
        </View>

        <ScrollView className="flex-1 px-5 pt-4" keyboardShouldPersistTaps="handled">
          <Controller control={control} name="title" render={({ field }) => (
            <Input label="Title" placeholder="Cover Letter for Software Engineer at Google" value={field.value} onChangeText={field.onChange} error={errors.title?.message} />
          )} />
          <Controller control={control} name="jobTitle" render={({ field }) => (
            <Input label="Job Title *" placeholder="Senior Software Engineer" value={field.value} onChangeText={field.onChange} error={errors.jobTitle?.message} />
          )} />
          <Controller control={control} name="companyName" render={({ field }) => (
            <Input label="Company Name *" placeholder="Google" value={field.value} onChangeText={field.onChange} error={errors.companyName?.message} />
          )} />
          <Controller control={control} name="recipientName" render={({ field }) => (
            <Input label="Hiring Manager Name" placeholder="Jane Smith (optional)" value={field.value} onChangeText={field.onChange} />
          )} />
          <Controller control={control} name="jobDescription" render={({ field }) => (
            <Input label="Job Description (optional)" placeholder="Paste the job posting for better AI generation..." value={field.value} onChangeText={field.onChange} multiline numberOfLines={4} className="min-h-24" />
          )} />

          <Text className="text-sm font-medium text-stone-700 mb-2">Writing Tone</Text>
          <Controller control={control} name="tone" render={({ field }) => (
            <View className="flex-row flex-wrap gap-2 mb-6">
              {TONE_OPTIONS.map((tone) => (
                <TouchableOpacity
                  key={tone.value}
                  onPress={() => field.onChange(tone.value)}
                  className={['flex-row items-center px-4 py-2.5 rounded-xl border', field.value === tone.value ? 'border-blue-500 bg-blue-50' : 'border-stone-200'].join(' ')}
                >
                  <Ionicons name={tone.icon as any} size={16} color={field.value === tone.value ? '#3b82f6' : '#78716c'} />
                  <Text className={['ml-2 font-medium', field.value === tone.value ? 'text-blue-600' : 'text-stone-600'].join(' ')}>{tone.label}</Text>
                </TouchableOpacity>
              ))}
            </View>
          )} />

          <Button variant="primary" fullWidth size="lg" loading={createCL.isPending} onPress={handleSubmit(onSubmit)}>
            Create Cover Letter
          </Button>
          <View className="h-8" />
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
