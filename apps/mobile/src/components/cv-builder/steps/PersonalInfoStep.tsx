import { zodResolver } from '@hookform/resolvers/zod';
import React, { useEffect } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { ScrollView, Text, View } from 'react-native';
import { z } from 'zod';
import { Input } from '../../ui/Input';
import { useCVStore } from '../../../store/cv-store';

const schema = z.object({
  firstName: z.string().min(1, 'First name is required'),
  lastName: z.string().min(1, 'Last name is required'),
  email: z.string().email('Invalid email address'),
  phone: z.string().min(1, 'Phone number is required'),
  headline: z.string().optional(),
  summary: z.string().optional(),
  address: z.string().optional(),
  city: z.string().optional(),
  country: z.string().optional(),
  website: z.string().url('Invalid URL').optional().or(z.literal('')),
  linkedin: z.string().optional(),
  github: z.string().optional(),
});

type FormData = z.infer<typeof schema>;

function isFormField(key: string): key is keyof FormData {
  return key in schema.shape;
}

interface PersonalInfoStepProps {
  onValidChange: (isValid: boolean) => void;
}

export function PersonalInfoStep({ onValidChange }: PersonalInfoStepProps) {
  const { cv, updatePersonalInfo } = useCVStore();

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
      <Text className="text-lg font-bold text-stone-900 mb-1">Personal Information</Text>
      <Text className="text-stone-500 mb-5 text-sm">
        Add your basic contact details and professional headline.
      </Text>

      <View className="flex-row gap-3">
        <View className="flex-1">
          <Controller
            control={control}
            name="firstName"
            render={({ field }) => (
              <Input
                label="First Name *"
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
                label="Last Name *"
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
            label="Email Address *"
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
            label="Phone Number *"
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
            label="Professional Headline"
            placeholder="Senior Software Engineer at Google"
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
            label="City"
            placeholder="San Francisco"
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
            label="Country"
            placeholder="United States"
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
            label="Website"
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
