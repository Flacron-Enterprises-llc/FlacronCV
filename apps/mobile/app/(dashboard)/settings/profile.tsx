import { zodResolver } from '@hookform/resolvers/zod';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { z } from 'zod';
import { Button } from '../../../src/components/ui/Button';
import { ErrorState } from '../../../src/components/ui/ErrorState';
import { Input } from '../../../src/components/ui/Input';
import { useCurrentUser, useUpdateProfile } from '../../../src/hooks/useUser';
import { getInitials } from '../../../src/lib/utils';
import { User } from '../../../src/types/user.types';

const schema = z.object({
  displayName: z.string().min(2, 'Name must be at least 2 characters'),
  'profile.firstName': z.string().optional(),
  'profile.lastName': z.string().optional(),
  'profile.headline': z.string().optional(),
  'profile.bio': z.string().optional(),
  'profile.location': z.string().optional(),
  'profile.website': z.string().url('Invalid URL').optional().or(z.literal('')),
  'profile.linkedin': z.string().optional(),
  'profile.github': z.string().optional(),
});

type FormData = z.infer<typeof schema>;

const EMPTY_VALUES: FormData = {
  displayName: '',
  'profile.firstName': '',
  'profile.lastName': '',
  'profile.headline': '',
  'profile.bio': '',
  'profile.location': '',
  'profile.website': '',
  'profile.linkedin': '',
  'profile.github': '',
};

function valuesFromUser(user: User): FormData {
  return {
    displayName: user.displayName ?? '',
    'profile.firstName': user.profile?.firstName ?? '',
    'profile.lastName': user.profile?.lastName ?? '',
    'profile.headline': user.profile?.headline ?? '',
    'profile.bio': user.profile?.bio ?? '',
    'profile.location': user.profile?.location ?? '',
    'profile.website': user.profile?.website ?? '',
    'profile.linkedin': user.profile?.linkedin ?? '',
    'profile.github': user.profile?.github ?? '',
  };
}

const PROFILE_DIRTY_KEYS = [
  ['profile.firstName', 'firstName'],
  ['profile.lastName', 'lastName'],
  ['profile.headline', 'headline'],
  ['profile.bio', 'bio'],
  ['profile.location', 'location'],
  ['profile.website', 'website'],
  ['profile.linkedin', 'linkedin'],
  ['profile.github', 'github'],
] as const;

/** UpdateUserDto is fully optional. Only dirty keys are sent so empty defaults cannot wipe stored fields. */
function payloadFromDirty(
  data: FormData,
  dirty: Partial<Record<keyof FormData, boolean>>,
): {
  displayName?: string;
  profile?: Partial<User['profile']>;
} {
  const payload: {
    displayName?: string;
    profile?: Partial<User['profile']>;
  } = {};

  if (dirty.displayName) {
    payload.displayName = data.displayName;
  }

  const profile: Partial<User['profile']> = {};
  for (const [formKey, profileKey] of PROFILE_DIRTY_KEYS) {
    if (dirty[formKey]) {
      profile[profileKey] = data[formKey] ?? '';
    }
  }
  if (Object.keys(profile).length > 0) {
    payload.profile = profile;
  }
  return payload;
}

export default function ProfileScreen() {
  const router = useRouter();
  const { data: user, isError, refetch } = useCurrentUser();
  const updateProfile = useUpdateProfile();
  const [hydratedUid, setHydratedUid] = useState<string | null>(null);

  const { control, handleSubmit, reset, formState: { errors, dirtyFields } } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: EMPTY_VALUES,
  });

  useEffect(() => {
    if (!user) {
      setHydratedUid(null);
      return;
    }
    if (hydratedUid === user.uid) return;
    reset(valuesFromUser(user));
    setHydratedUid(user.uid);
  }, [user, hydratedUid, reset]);

  const formReady = !!user && hydratedUid === user.uid;

  const onSubmit = async (data: FormData) => {
    if (!user || hydratedUid !== user.uid) return;

    const payload = payloadFromDirty(data, dirtyFields);
    if (!payload.displayName && !payload.profile) {
      router.back();
      return;
    }

    try {
      await updateProfile.mutateAsync(payload as Partial<User>);
      Alert.alert('Success', 'Profile updated successfully!');
      router.back();
    } catch {
      Alert.alert('Error', 'Failed to update profile.');
    }
  };

  if (!user && isError) {
    return (
      <SafeAreaView className="flex-1 bg-white">
        <View className="flex-row items-center px-5 pt-4 pb-3 border-b border-stone-100">
          <TouchableOpacity onPress={() => router.back()} className="mr-3">
            <Ionicons name="arrow-back" size={22} color="#374151" />
          </TouchableOpacity>
          <Text className="text-xl font-black text-stone-900">Edit Profile</Text>
        </View>
        <ErrorState message="Failed to load profile" onRetry={() => void refetch()} />
      </SafeAreaView>
    );
  }

  if (!formReady) {
    return (
      <SafeAreaView className="flex-1 bg-white items-center justify-center">
        <ActivityIndicator size="large" color="#f97316" />
        <Text className="text-stone-500 mt-3">Loading profile...</Text>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView className="flex-1 bg-white">
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} className="flex-1">
        <View className="flex-row items-center px-5 pt-4 pb-3 border-b border-stone-100">
          <TouchableOpacity onPress={() => router.back()} className="mr-3">
            <Ionicons name="arrow-back" size={22} color="#374151" />
          </TouchableOpacity>
          <Text className="text-xl font-black text-stone-900">Edit Profile</Text>
        </View>

        <ScrollView className="flex-1 px-5 pt-4" keyboardShouldPersistTaps="handled">
          <View className="items-center mb-6">
            <View className="w-20 h-20 rounded-full bg-brand-100 items-center justify-center">
              <Text className="text-brand-700 text-2xl font-black">
                {getInitials(user.displayName ?? 'U')}
              </Text>
            </View>
          </View>

          <Controller control={control} name="displayName" render={({ field }) => (
            <Input label="Display Name *" value={field.value} onChangeText={field.onChange} error={errors.displayName?.message} />
          )} />
          <View className="flex-row gap-3">
            <View className="flex-1">
              <Controller control={control} name="profile.firstName" render={({ field }) => (
                <Input label="First Name" value={field.value} onChangeText={field.onChange} />
              )} />
            </View>
            <View className="flex-1">
              <Controller control={control} name="profile.lastName" render={({ field }) => (
                <Input label="Last Name" value={field.value} onChangeText={field.onChange} />
              )} />
            </View>
          </View>
          <Controller control={control} name="profile.headline" render={({ field }) => (
            <Input label="Professional Headline" placeholder="Senior Developer at Google" value={field.value} onChangeText={field.onChange} />
          )} />
          <Controller control={control} name="profile.bio" render={({ field }) => (
            <Input label="Bio" placeholder="A brief bio about yourself..." value={field.value} onChangeText={field.onChange} multiline numberOfLines={3} />
          )} />
          <Controller control={control} name="profile.location" render={({ field }) => (
            <Input label="Location" placeholder="San Francisco, CA" value={field.value} onChangeText={field.onChange} />
          )} />
          <Controller control={control} name="profile.website" render={({ field }) => (
            <Input label="Website" placeholder="https://yoursite.com" keyboardType="url" autoCapitalize="none" value={field.value} onChangeText={field.onChange} error={errors['profile.website']?.message} />
          )} />
          <Controller control={control} name="profile.linkedin" render={({ field }) => (
            <Input label="LinkedIn" placeholder="linkedin.com/in/yourprofile" autoCapitalize="none" value={field.value} onChangeText={field.onChange} />
          )} />
          <Controller control={control} name="profile.github" render={({ field }) => (
            <Input label="GitHub" placeholder="github.com/yourusername" autoCapitalize="none" value={field.value} onChangeText={field.onChange} />
          )} />

          <Button
            variant="primary"
            fullWidth
            size="lg"
            disabled={!formReady}
            loading={updateProfile.isPending}
            onPress={handleSubmit(onSubmit)}
            className="mt-2"
          >
            Save Profile
          </Button>
          <View className="h-8" />
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
