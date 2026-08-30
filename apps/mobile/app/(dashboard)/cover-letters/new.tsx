import { zodResolver } from '@hookform/resolvers/zod';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React from 'react';
import { Controller, useForm } from 'react-hook-form';
import { Alert, KeyboardAvoidingView, Platform, ScrollView, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { z } from 'zod';
import { Button } from '../../../src/components/ui/Button';
import { Input } from '../../../src/components/ui/Input';
import { useCreateCoverLetter } from '../../../src/hooks/useCoverLetters';
import { useAuthStore } from '../../../src/store/auth-store';
import { useCoverLetterStore } from '../../../src/store/cover-letter-store';
import { canCreateCoverLetter, effectivePlanForCopy } from '../../../src/lib/entitlements';
import { isLimitRejection, requestFailureMessage } from '../../../src/lib/api-errors';
import { alertIfUnverifiedEmail } from '../../../src/lib/email-verification';
import {
  coverLetterLimitReachedMessage,
  upgradeAlertButtons,
} from '../../../src/config/paid-upgrades';
import { CoverLetterStatus } from '../../../src/types/enums';
import { colors } from '../../../src/theme/colors';

const schema = z.object({
  title: z.string().min(1, 'Title is required'),
  jobTitle: z.string().min(1, 'Job title is required'),
  companyName: z.string().min(1, 'Company name is required'),
  recipientName: z.string().optional(),
  recipientTitle: z.string().optional(),
  jobDescription: z.string().optional(),
});

type FormData = z.infer<typeof schema>;

export default function NewCoverLetterScreen() {
  const router = useRouter();
  const { user } = useAuthStore();
  const { setCoverLetter } = useCoverLetterStore();
  const createCL = useCreateCoverLetter();

  const { control, handleSubmit, formState: { errors } } = useForm<FormData>({
    resolver: zodResolver(schema),
  });

  const onSubmit = async (data: FormData) => {
    if (!user?.usage) {
      Alert.alert(
        'Could not create cover letter',
        'Could not load your usage. Please try again.',
      );
      return;
    }
    const clCount = user.usage.coverLettersCreated;

    if (!canCreateCoverLetter(user.subscription, clCount)) {
      Alert.alert(
        'Cover Letter Limit Reached',
        coverLetterLimitReachedMessage(effectivePlanForCopy(user.subscription)),
        upgradeAlertButtons(() => router.push('/(dashboard)/settings/billing')),
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
        styling: { fontFamily: 'Inter', fontSize: '14px', primaryColor: colors.brand[600] },
      });
      setCoverLetter(cl);
      router.replace(`/(dashboard)/cover-letters/${cl.id}`);
    } catch (err) {
      if (alertIfUnverifiedEmail(err)) return;
      if (isLimitRejection(err)) {
        Alert.alert(
          'Cover Letter Limit Reached',
          coverLetterLimitReachedMessage(effectivePlanForCopy(user.subscription)),
          upgradeAlertButtons(() => router.push('/(dashboard)/settings/billing')),
        );
        return;
      }
      Alert.alert(
        'Could not create cover letter',
        requestFailureMessage(err, 'Failed to create cover letter.'),
      );
    }
  };

  return (
    <SafeAreaView className="flex-1 bg-white">
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} className="flex-1">
        <View className="flex-row items-center px-5 pt-4 pb-3 border-b border-stone-100">
          <TouchableOpacity onPress={() => router.back()} className="mr-3">
            <Ionicons name="arrow-back" size={22} color={colors.stone[700]} />
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

          <Button variant="primary" fullWidth size="lg" loading={createCL.isPending} onPress={handleSubmit(onSubmit)}>
            Create Cover Letter
          </Button>
          <View className="h-8" />
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
