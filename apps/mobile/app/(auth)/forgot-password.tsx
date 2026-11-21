import { zodResolver } from '@hookform/resolvers/zod';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React, { useMemo, useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { Text, View } from 'react-native';
import { z } from 'zod';
import { AuthError, AuthFooterLink, AuthShell } from '../../src/components/auth/AuthShell';
import { Button } from '../../src/components/ui/Button';
import { Input } from '../../src/components/ui/Input';
import { useT } from '../../src/i18n';
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

  const backToLogin = () => (router.canGoBack() ? router.back() : router.replace('/(auth)/login'));

  const onSubmit = async (data: FormData) => {
    clearError();
    try {
      await resetPassword(data.email);
      setSent(true);
    } catch {
      // Error set on auth store — shown above the form
    }
  };

  if (sent) {
    return (
      <AuthShell title={t('forgot.sentTitle')} subtitle={t('forgot.sentBody')} onBack={backToLogin}>
        <View className="mb-8 items-center">
          <View className="h-24 w-24 items-center justify-center rounded-full" style={{ backgroundColor: colors.success.bg }}>
            <Ionicons name="mail-open-outline" size={42} color={colors.success.DEFAULT} />
          </View>
        </View>
        <Button variant="primary" size="lg" pill fullWidth onPress={backToLogin}>
          {t('forgot.backToLogin')}
        </Button>
      </AuthShell>
    );
  }

  return (
    <AuthShell title={t('forgot.title')} subtitle={t('forgot.body')} onBack={backToLogin}>
      <View className="mb-7 items-center">
        <View className="h-20 w-20 items-center justify-center rounded-full bg-brand-50">
          <Ionicons name="key-outline" size={34} color={colors.brand[600]} />
        </View>
      </View>

      <AuthError message={error} />

      <Controller
        control={control}
        name="email"
        render={({ field }) => (
          <Input
            variant="soft"
            labelIcon="mail-outline"
            label={t('fields.email')}
            placeholder="you@example.com"
            keyboardType="email-address"
            autoCapitalize="none"
            autoComplete="email"
            textContentType="emailAddress"
            value={field.value}
            onChangeText={field.onChange}
            onSubmitEditing={handleSubmit(onSubmit)}
            returnKeyType="send"
            error={errors.email?.message}
          />
        )}
      />

      <View className="mt-2">
        <Button variant="primary" size="lg" pill fullWidth loading={isLoading} onPress={handleSubmit(onSubmit)}>
          {t('forgot.submit')}
        </Button>
      </View>

      <AuthFooterLink prompt={t('forgot.remembered')} action={t('register.signIn')} onPress={backToLogin} />
    </AuthShell>
  );
}
