import { zodResolver } from '@hookform/resolvers/zod';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, usePreventRemove } from '@react-navigation/native';
import { useRouter } from 'expo-router';
import React, { useEffect, useMemo, useState } from 'react';
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
import axios from 'axios';
import * as ImagePicker from 'expo-image-picker';
import { Avatar } from '../../../src/components/ui/Avatar';
import { Button } from '../../../src/components/ui/Button';
import { ErrorState } from '../../../src/components/ui/ErrorState';
import { Input } from '../../../src/components/ui/Input';
import {
  useCurrentUser,
  useRemoveProfilePhoto,
  useUpdateProfile,
  useUploadProfilePhoto,
} from '../../../src/hooks/useUser';
import { requestFailureMessage } from '../../../src/lib/api-errors';
import { PROFILE_LINK_FIELDS, validateProfileLink } from '../../../src/lib/profile-links';
import { UpdateUserPayload, User } from '../../../src/types/user.types';
import { colors } from '../../../src/theme/colors';
import { t as tNow, useT } from '../../../src/i18n';
import { RTL_FLIP } from '../../../src/i18n/native';

/** Same prompt as CV / cover letter / jobs — in-app back, hardware Back, gesture. */
function confirmUnsavedLeave(onLeave: () => void) {
  Alert.alert(tNow('common.unsaved.title'), tNow('common.unsaved.body'), [
    { text: tNow('common.unsaved.stay'), style: 'cancel' },
    { text: tNow('common.unsaved.leave'), style: 'destructive', onPress: onLeave },
  ]);
}

/** Built per language so the validation message is translated. */
const makeSchema = (nameTooShort: string) => z.object({
  displayName: z.string().min(2, nameTooShort),
  'profile.firstName': z.string().optional(),
  'profile.lastName': z.string().optional(),
  'profile.headline': z.string().optional(),
  'profile.bio': z.string().optional(),
  'profile.location': z.string().optional(),
  // LinkedIn / GitHub / Website are checked on save with the website's
  // validateProfileLink rule (src/lib/profile-links.ts), which also adds https://.
  'profile.website': z.string().optional().or(z.literal('')),
  'profile.linkedin': z.string().optional(),
  'profile.github': z.string().optional(),
});

type FormData = z.infer<ReturnType<typeof makeSchema>>;

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
): UpdateUserPayload {
  const payload: UpdateUserPayload = {};

  if (dirty.displayName) {
    payload.displayName = data.displayName;
  }

  const profile: NonNullable<UpdateUserPayload['profile']> = {};
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

function photoFailureMessage(err: unknown): string {
  if (axios.isAxiosError(err)) {
    return requestFailureMessage(err, tNow('settings.profile.photoError'));
  }
  if (err instanceof Error && err.message) {
    return err.message;
  }
  return requestFailureMessage(err, tNow('settings.profile.photoError'));
}

export default function ProfileScreen() {
  const t = useT('settings.profile');
  const tc = useT('common');
  const router = useRouter();
  const navigation = useNavigation();
  const { data: user, isError, refetch } = useCurrentUser();
  const updateProfile = useUpdateProfile();
  const uploadPhoto = useUploadProfilePhoto();
  const removePhoto = useRemoveProfilePhoto();
  const [hydratedUid, setHydratedUid] = useState<string | null>(null);
  const photoBusy = uploadPhoto.isPending || removePhoto.isPending;

  const schema = useMemo(() => makeSchema(t('displayNameTooShort')), [t]);
  const {
    control,
    handleSubmit,
    reset,
    setError,
    clearErrors,
    formState: { errors, dirtyFields, isDirty },
  } = useForm<FormData>({
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

  usePreventRemove(formReady && isDirty, ({ data }) => {
    confirmUnsavedLeave(() => navigation.dispatch(data.action));
  });

  const onSubmit = async (data: FormData) => {
    if (!user || hydratedUid !== user.uid) return;

    // Same rule and normalisation as the website (and the API): errors show
    // under the field; a valid value is saved normalised, e.g.
    // "github.com/name" -> "https://github.com/name". Only edited links are
    // checked — untouched stored values are not sent, so cannot be rejected.
    const normalised: FormData = { ...data };
    let linkError = false;
    for (const field of PROFILE_LINK_FIELDS) {
      const formKey = `profile.${field}` as const;
      if (!dirtyFields[formKey]) continue;
      const result = validateProfileLink(field, data[formKey] ?? '');
      if (result.error) {
        linkError = true;
        setError(formKey, { type: 'manual', message: result.error });
      } else {
        normalised[formKey] = result.value;
      }
    }
    if (linkError) {
      Alert.alert(t('checkLinksTitle'), t('fixLinks'));
      return;
    }

    const payload = payloadFromDirty(normalised, dirtyFields);
    if (!payload.displayName && !payload.profile) {
      router.back();
      return;
    }

    try {
      await updateProfile.mutateAsync(payload);
      // Clear dirty before leave so usePreventRemove does not re-prompt.
      reset(normalised);
      Alert.alert(t('savedTitle'), t('savedBody'));
      router.back();
    } catch (err) {
      Alert.alert(t('saveErrorTitle'), requestFailureMessage(err, t('saveError')));
    }
  };

  const onPickPhoto = async () => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert(t('photosUnavailableTitle'), t('photosUnavailableBody'));
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: false,
      quality: 0.85,
    });
    if (result.canceled) return;

    const asset = result.assets[0];
    if (!asset) return;

    try {
      await uploadPhoto.mutateAsync({
        uri: asset.uri,
        mimeType: asset.mimeType,
        fileName: asset.fileName,
        fileSize: asset.fileSize,
      });
    } catch (err) {
      Alert.alert(t('photoErrorTitle'), photoFailureMessage(err));
    }
  };

  const onRemovePhoto = () => {
    Alert.alert(t('removePhoto'), t('removePhotoBody'), [
      { text: tc('cancel'), style: 'cancel' },
      {
        text: tc('remove'),
        style: 'destructive',
        onPress: () => {
          void removePhoto.mutateAsync().catch((err) => {
            Alert.alert(t('photoErrorTitle'), photoFailureMessage(err));
          });
        },
      },
    ]);
  };

  if (!user && isError) {
    return (
      <SafeAreaView className="flex-1 bg-white">
        <View className="flex-row items-center px-5 pt-4 pb-3 border-b border-stone-100">
          <TouchableOpacity onPress={() => router.back()} className="me-3" accessibilityRole="button" accessibilityLabel={tc('back')}>
            <Ionicons name="arrow-back" size={22} color={colors.stone[700]} style={RTL_FLIP} />
          </TouchableOpacity>
          <Text className="text-xl font-black text-stone-900">{t('title')}</Text>
        </View>
        <ErrorState message={t('loadError')} onRetry={() => void refetch()} />
      </SafeAreaView>
    );
  }

  if (!formReady) {
    return (
      <SafeAreaView className="flex-1 bg-white items-center justify-center">
        <ActivityIndicator size="large" color={colors.brand[600]} />
        <Text className="text-stone-500 mt-3">{t('loading')}</Text>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView className="flex-1 bg-white">
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} className="flex-1">
        <View className="flex-row items-center px-5 pt-4 pb-3 border-b border-stone-100">
          <TouchableOpacity onPress={() => router.back()} className="me-3" accessibilityRole="button" accessibilityLabel={tc('back')}>
            <Ionicons name="arrow-back" size={22} color={colors.stone[700]} style={RTL_FLIP} />
          </TouchableOpacity>
          <Text className="text-xl font-black text-stone-900">{t('title')}</Text>
        </View>

        <ScrollView className="flex-1 px-5 pt-4" keyboardShouldPersistTaps="handled">
          <View className="items-center mb-6">
            <TouchableOpacity
              onPress={() => void onPickPhoto()}
              disabled={photoBusy}
              activeOpacity={0.7}
              accessibilityRole="button"
              accessibilityLabel={t('changePhoto')}
            >
              <View style={{ width: 80, height: 80 }}>
                <Avatar
                  photoURL={user.photoURL}
                  name={user.displayName ?? 'U'}
                  size={80}
                  textClassName="text-brand-700 text-2xl font-black"
                />
                <View className="absolute inset-0 items-center justify-center">
                  {photoBusy ? (
                    <View className="w-20 h-20 rounded-full bg-black/40 items-center justify-center">
                      <ActivityIndicator color="#fff" />
                    </View>
                  ) : null}
                </View>
                <View className="absolute bottom-0 w-7 h-7 rounded-full bg-brand-600 items-center justify-center border-2 border-white" style={{ end: 0 }}>
                  <Ionicons name="images-outline" size={14} color="#fff" />
                </View>
              </View>
            </TouchableOpacity>
            <Text className="text-stone-500 text-sm mt-2">{t('tapToChoose')}</Text>
            {user.photoURL ? (
              <TouchableOpacity
                onPress={onRemovePhoto}
                disabled={photoBusy}
                className="mt-2"
                accessibilityRole="button"
                accessibilityLabel={t('removePhotoA11y')}
              >
                <Text className="text-stone-600 text-sm font-medium">{t('removePhoto')}</Text>
              </TouchableOpacity>
            ) : null}
          </View>

          <Controller control={control} name="displayName" render={({ field }) => (
            <Input label={t('displayName')} value={field.value} onChangeText={field.onChange} error={errors.displayName?.message} />
          )} />
          <View className="flex-row gap-3">
            <View className="flex-1">
              <Controller control={control} name="profile.firstName" render={({ field }) => (
                <Input label={t('firstName')} value={field.value} onChangeText={field.onChange} />
              )} />
            </View>
            <View className="flex-1">
              <Controller control={control} name="profile.lastName" render={({ field }) => (
                <Input label={t('lastName')} value={field.value} onChangeText={field.onChange} />
              )} />
            </View>
          </View>
          <Controller control={control} name="profile.headline" render={({ field }) => (
            <Input label={t('headline')} placeholder={t('headlinePlaceholder')} value={field.value} onChangeText={field.onChange} />
          )} />
          <Controller control={control} name="profile.bio" render={({ field }) => (
            <Input label={t('bio')} placeholder={t('bioPlaceholder')} value={field.value} onChangeText={field.onChange} multiline numberOfLines={3} />
          )} />
          <Controller control={control} name="profile.location" render={({ field }) => (
            <Input label={t('location')} placeholder={t('locationPlaceholder')} value={field.value} onChangeText={field.onChange} />
          )} />
          <Controller control={control} name="profile.linkedin" render={({ field }) => (
            <Input
              label={t('linkedin')}
              placeholder="https://linkedin.com/in/username"
              keyboardType="url"
              autoCapitalize="none"
              autoCorrect={false}
              value={field.value}
              onChangeText={(v) => {
                field.onChange(v);
                clearErrors('profile.linkedin');
              }}
              error={errors['profile.linkedin']?.message}
            />
          )} />
          <Controller control={control} name="profile.github" render={({ field }) => (
            <Input
              label={t('github')}
              placeholder="https://github.com/username"
              keyboardType="url"
              autoCapitalize="none"
              autoCorrect={false}
              value={field.value}
              onChangeText={(v) => {
                field.onChange(v);
                clearErrors('profile.github');
              }}
              error={errors['profile.github']?.message}
            />
          )} />
          <Controller control={control} name="profile.website" render={({ field }) => (
            <Input
              label={t('website')}
              placeholder="https://yoursite.com"
              keyboardType="url"
              autoCapitalize="none"
              autoCorrect={false}
              value={field.value}
              onChangeText={(v) => {
                field.onChange(v);
                clearErrors('profile.website');
              }}
              error={errors['profile.website']?.message}
            />
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
            {t('save')}
          </Button>
          <View className="h-8" />
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
