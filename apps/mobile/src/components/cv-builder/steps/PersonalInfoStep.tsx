import { zodResolver } from '@hookform/resolvers/zod';
import React, { useEffect, useMemo } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { ScrollView, Text, View } from 'react-native';
import { z } from 'zod';
import { Input } from '../../ui/Input';
import { useCVStore } from '../../../store/cv-store';
import { CVPhotoPicker } from '../CVPhotoPicker';
import { useT } from '../../../i18n';

/** Built per language so validation messages follow the app language. */
const makeSchema = (t: (key: string) => string) => z.object({
  firstName: z.string().min(1, t('personal.errors.firstNameRequired')),
  lastName: z.string().min(1, t('personal.errors.lastNameRequired')),
  email: z.string().email(t('personal.errors.invalidEmail')),
  phone: z.string().min(1, t('personal.errors.phoneRequired')),
  headline: z.string().optional(),
  summary: z.string().optional(),
  address: z.string().optional(),
  city: z.string().optional(),
  country: z.string().optional(),
  postalCode: z.string().optional(),
  // PersonalInfoDto is a plain string — do not require https:// (blocks Continue).
  website: z.string().optional().or(z.literal('')),
  linkedin: z.string().optional(),
  github: z.string().optional(),
});

type FormData = z.infer<ReturnType<typeof makeSchema>>;

const FORM_FIELDS = Object.keys(makeSchema((key) => key).shape);

function isFormField(key: string): key is keyof FormData {
  return FORM_FIELDS.includes(key);
}

interface PersonalInfoStepProps {
  onValidChange: (isValid: boolean) => void;
}

export function PersonalInfoStep({ onValidChange }: PersonalInfoStepProps) {
  const { cv, updatePersonalInfo } = useCVStore();
  const t = useT('cvEditor');
  const schema = useMemo(() => makeSchema(t), [t]);

  const {
    control,
    formState: { errors, isValid },
    watch,
  } = useForm<FormData>({
    resolver: zodResolver(schema),
    mode: 'onChange',
    defaultValues: {
      firstName: cv?.personalInfo.firstName ?? '',
      lastName: cv?.personalInfo.lastName ?? '',
      email: cv?.personalInfo.email ?? '',
      phone: cv?.personalInfo.phone ?? '',
      headline: cv?.personalInfo.headline ?? '',
      summary: cv?.personalInfo.summary ?? '',
      address: cv?.personalInfo.address ?? '',
      city: cv?.personalInfo.city ?? '',
      country: cv?.personalInfo.country ?? '',
      postalCode: cv?.personalInfo.postalCode ?? '',
      website: cv?.personalInfo.website ?? '',
      linkedin: cv?.personalInfo.linkedin ?? '',
      github: cv?.personalInfo.github ?? '',
    },
  });

  // Sync valid state to parent
  useEffect(() => {
    onValidChange(isValid);
  }, [isValid, onValidChange]);

  // Autosave on field change
  const values = watch();
  useEffect(() => {
    for (const key of Object.keys(values)) {
      if (!isFormField(key)) continue;
      const value = values[key];
      if (value !== undefined && value !== cv?.personalInfo[key]) {
        updatePersonalInfo(key, value);
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(values)]);

  return (
    <ScrollView className="flex-1 px-5" showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
      <Text className="text-lg font-semibold text-stone-900 mb-1">{t('personal.title')}</Text>
      <Text className="text-stone-500 mb-5 text-sm">{t('personal.subtitle')}</Text>

      <CVPhotoPicker />

      <View className="flex-row gap-3">
        <View className="flex-1">
          <Controller
            control={control}
            name="firstName"
            render={({ field }) => (
              <Input
                label={t('personal.firstName')}
                maxLength={100}
                placeholder="John"
                value={field.value}
                onChangeText={field.onChange}
                error={errors.firstName?.message}
              />
            )}
          />
        </View>
        <View className="flex-1">
          <Controller
            control={control}
            name="lastName"
            render={({ field }) => (
              <Input
                label={t('personal.lastName')}
                maxLength={100}
                placeholder="Doe"
                value={field.value}
                onChangeText={field.onChange}
                error={errors.lastName?.message}
              />
            )}
          />
        </View>
      </View>

      <Controller
        control={control}
        name="email"
        render={({ field }) => (
          <Input
            label={t('personal.email')}
            maxLength={320}
            placeholder="john@example.com"
            keyboardType="email-address"
            autoCapitalize="none"
            value={field.value}
            onChangeText={field.onChange}
            error={errors.email?.message}
          />
        )}
      />

      <Controller
        control={control}
        name="phone"
        render={({ field }) => (
          <Input
            label={t('personal.phone')}
            maxLength={40}
            placeholder="+1 (555) 000-0000"
            keyboardType="phone-pad"
            value={field.value}
            onChangeText={field.onChange}
            error={errors.phone?.message}
          />
        )}
      />

      <Controller
        control={control}
        name="headline"
        render={({ field }) => (
          <Input
            label={t('personal.headline')}
            maxLength={200}
            placeholder={t('personal.headlinePlaceholder')}
            value={field.value}
            onChangeText={field.onChange}
          />
        )}
      />

      <Controller
        control={control}
        name="city"
        render={({ field }) => (
          <Input
            label={t('personal.city')}
            maxLength={100}
            placeholder={t('personal.cityPlaceholder')}
            value={field.value}
            onChangeText={field.onChange}
          />
        )}
      />

      <Controller
        control={control}
        name="country"
        render={({ field }) => (
          <Input
            label={t('personal.country')}
            placeholder={t('personal.countryPlaceholder')}
            maxLength={100}
            value={field.value}
            onChangeText={field.onChange}
          />
        )}
      />

      <Controller
        control={control}
        name="address"
        render={({ field }) => (
          <Input
            label={t('personal.address')}
            placeholder={t('personal.addressPlaceholder')}
            autoComplete="street-address"
            maxLength={200}
            value={field.value}
            onChangeText={field.onChange}
          />
        )}
      />

      <Controller
        control={control}
        name="postalCode"
        render={({ field }) => (
          <Input
            label={t('personal.postalCode')}
            placeholder={t('personal.postalCodePlaceholder')}
            autoComplete="postal-code"
            autoCapitalize="characters"
            maxLength={20}
            value={field.value}
            onChangeText={field.onChange}
          />
        )}
      />

      <Controller
        control={control}
        name="website"
        render={({ field }) => (
          <Input
            label={t('fields.website')}
            maxLength={500}
            placeholder="https://johndoe.com"
            keyboardType="url"
            autoCapitalize="none"
            value={field.value}
            onChangeText={field.onChange}
            error={errors.website?.message}
          />
        )}
      />

      <Controller
        control={control}
        name="linkedin"
        render={({ field }) => (
          <Input
            label="LinkedIn"
            maxLength={500}
            placeholder="linkedin.com/in/johndoe"
            autoCapitalize="none"
            value={field.value}
            onChangeText={field.onChange}
          />
        )}
      />

      <Controller
        control={control}
        name="github"
        render={({ field }) => (
          <Input
            label="GitHub"
            maxLength={500}
            placeholder="github.com/johndoe"
            autoCapitalize="none"
            value={field.value}
            onChangeText={field.onChange}
          />
        )}
      />

      <View className="h-8" />
    </ScrollView>
  );
}
