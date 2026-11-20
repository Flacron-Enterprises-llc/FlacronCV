import { zodResolver } from '@hookform/resolvers/zod';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React, { useMemo, useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { KeyboardAvoidingView, Platform, ScrollView, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { z } from 'zod';
import { Button } from '../../src/components/ui/Button';
import { Input } from '../../src/components/ui/Input';
import { useT } from '../../src/i18n';
import { RTL_FLIP } from '../../src/i18n/native';
import { useAuthStore } from '../../src/store/auth-store';
import { colors } from '../../src/theme/colors';

const makeSchema = (invalidEmail: string) =>
  z.object({
    email: z.string().email(invalidEmail),
  });

type FormData = z.infer<ReturnType<typeof makeSchema>>;

export default function ForgotPasswordScreen() {
  const router = useRouter();
  const t = useT('auth');
  const { resetPassword, isLoading, error, clearError } = useAuthStore();
  const [sent, setSent] = useState(false);
  const schema = useMemo(() => makeSchema(t('validation.email')), [t]);

  const { control, handleSubmit, formState: { errors } } = useForm<FormData>({
    resolver: zodResolver(schema),
  });

  const onSubmit = async (data: FormData) => {
    clearError();
    try {
      await resetPassword(data.email);
      setSent(true);
    } catch {
      // Error set on auth store — shown below
    }
  };

  return (
    <SafeAreaView className="flex-1 bg-surface">
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} className="flex-1">
        <ScrollView className="flex-1 px-6" keyboardShouldPersistTaps="handled">
          <TouchableOpacity onPress={() => router.back()} className="mt-4 mb-8 flex-row items-center">
            <Ionicons name="arrow-back" size={22} color={colors.stone[500]} style={RTL_FLIP} />
            <Text className="text-stone-700 ms-2 font-medium">{t('forgot.backToLogin')}</Text>
          </TouchableOpacity>

          {sent ? (
            <View className="items-center py-12">
              <View
                className="mb-4 h-20 w-20 items-center justify-center rounded-full"
                style={{ backgroundColor: colors.success.bg }}
              >
                <Ionicons name="mail-open-outline" size={36} color={colors.success.DEFAULT} />
              </View>
              <Text className="text-xl font-bold text-stone-900 text-center mb-2">{t('forgot.sentTitle')}</Text>
              <Text className="text-stone-500 text-center leading-5">
                {t('forgot.sentBody')}
              </Text>
              <Button variant="primary" className="mt-8" onPress={() => router.back()}>
                {t('forgot.backToLogin')}
              </Button>
            </View>
          ) : (
            <>
              <Text className="text-xl font-bold text-stone-900 mb-2">{t('forgot.title')}</Text>
              <Text className="text-stone-500 mb-8 leading-5">
                {t('forgot.body')}
              </Text>

              {error && (
                <View className="mb-4 rounded-xl bg-error-bg px-4 py-3">
                  <Text className="text-error text-sm">{error}</Text>
                </View>
              )}

              <Controller control={control} name="email" render={({ field }) => (
                <Input label={t('fields.email')} placeholder="you@example.com" keyboardType="email-address" autoCapitalize="none" value={field.value} onChangeText={field.onChange} error={errors.email?.message} />
              )} />

              <Button variant="primary" size="lg" fullWidth loading={isLoading} onPress={handleSubmit(onSubmit)}>
                {t('forgot.submit')}
              </Button>
            </>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
