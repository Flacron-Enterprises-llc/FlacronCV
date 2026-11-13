import { zodResolver } from '@hookform/resolvers/zod';
import { LinearGradient } from 'expo-linear-gradient';
import { Link } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import {
  Alert,
  Image,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { z } from 'zod';
import { GoogleSignInButton, isGoogleSignInAvailable } from '../../src/components/auth/GoogleSignInButton';
import { LegalAcceptanceModal } from '../../src/components/auth/LegalAcceptanceModal';
import { Button } from '../../src/components/ui/Button';
import { Input } from '../../src/components/ui/Input';
import { useT } from '../../src/i18n';
import {
  legalPostFailedMessage,
  legalPostFailedTitle,
  recordAcceptanceAfterSignup,
} from '../../src/lib/legal-acceptance';
import { colors } from '../../src/theme/colors';
import { useAuthStore } from '../../src/store/auth-store';

// Required for expo-auth-session redirect to work correctly
WebBrowser.maybeCompleteAuthSession();

const makeSchema = (messages: { email: string; password: string }) =>
  z.object({
    email: z.string().email(messages.email),
    password: z.string().min(6, messages.password),
  });

type FormData = z.infer<ReturnType<typeof makeSchema>>;

export default function LoginScreen() {
  const t = useT('auth');
  const schema = useMemo(
    () => makeSchema({ email: t('validation.email'), password: t('validation.passwordMin6') }),
    [t],
  );
  const { login, loginWithGoogle, logout, isLoading, error, clearError, legalGate, setLegalGate } =
    useAuthStore();
  const [legalOpen, setLegalOpen] = useState(false);
  const [legalChecked, setLegalChecked] = useState(false);
  const [legalAccepting, setLegalAccepting] = useState(false);

  const {
    control,
    handleSubmit,
    formState: { errors },
  } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: { email: '', password: '' },
  });

  useEffect(() => {
    if (legalGate) {
      setLegalOpen(true);
    }
  }, [legalGate]);

  const onSubmit = async (data: FormData) => {
    clearError();
    try {
      await login(data.email, data.password);
    } catch {
      // Error already set in store
    }
  };

  const handleGoogleToken = useCallback(
    async (token: string) => {
      clearError();
      try {
        const { isNewUser } = await loginWithGoogle(token, { gateNewUser: true });
        if (isNewUser) {
          setLegalChecked(false);
          setLegalOpen(true);
        }
      } catch {
        // Error in store
      }
    },
    [clearError, loginWithGoogle],
  );

  const handleLegalAccept = async () => {
    if (!legalChecked) return;
    setLegalAccepting(true);
    try {
      const ok = await recordAcceptanceAfterSignup();
      if (!ok) {
        Alert.alert(legalPostFailedTitle(), legalPostFailedMessage());
        return;
      }
      setLegalGate(false);
      setLegalOpen(false);
    } finally {
      setLegalAccepting(false);
    }
  };

  const handleLegalCancel = async () => {
    setLegalOpen(false);
    setLegalChecked(false);
    // Sign out only — do not delete the Auth user. Consent uid stays so the
    // next Google sign-in still shows this modal (isNewUser will be false).
    await logout();
  };

  return (
    <SafeAreaView className="flex-1 bg-white">
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        className="flex-1"
        keyboardVerticalOffset={0}
      >
        <ScrollView
          className="flex-1"
          contentContainerStyle={{ flexGrow: 1, paddingBottom: 48 }}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* Header — pale brand wash into white; mark sits alone (no orange tile) */}
          <LinearGradient
            colors={[colors.brand[50], '#ffffff']}
            className="px-6 pt-8 pb-10"
          >
            <View className="items-center mb-8">
              <Image
                source={require('../../assets/icon.png')}
                style={{ width: 56, height: 56, borderRadius: 14, marginBottom: 16 }}
                resizeMode="contain"
              />
              <Text className="text-xl font-bold text-stone-900">{t('login.title')}</Text>
              <Text className="text-stone-500 mt-1">{t('login.subtitle')}</Text>
            </View>
          </LinearGradient>

          {/* Form Card */}
          <View className="px-6 -mt-4">
            <View className="bg-white rounded-3xl border border-stone-100 shadow-sm p-6">
              {/* Error Banner */}
              {error && (
                <View className="bg-red-50 border border-red-200 rounded-xl p-3 mb-4">
                  <Text className="text-red-600 text-sm">{error}</Text>
                </View>
              )}

              <Controller
                control={control}
                name="email"
                render={({ field }) => (
                  <Input
                    label={t('fields.email')}
                    placeholder="you@example.com"
                    keyboardType="email-address"
                    autoCapitalize="none"
                    autoComplete="email"
                    value={field.value}
                    onChangeText={field.onChange}
                    error={errors.email?.message}
                  />
                )}
              />

              <Controller
                control={control}
                name="password"
                render={({ field }) => (
                  <Input
                    label={t('fields.password')}
                    placeholder="••••••••"
                    isPassword
                    value={field.value}
                    onChangeText={field.onChange}
                    error={errors.password?.message}
                  />
                )}
              />

              <Link href="/(auth)/forgot-password" asChild>
                <TouchableOpacity className="mb-5 self-end">
                  <Text className="text-brand-600 text-sm font-medium">
                    {t('login.forgotPassword')}
                  </Text>
                </TouchableOpacity>
              </Link>

              <Button
                variant="primary"
                size="lg"
                fullWidth
                loading={isLoading}
                onPress={handleSubmit(onSubmit)}
              >
                {t('login.submit')}
              </Button>

              {/* Google Sign-In — only rendered when the platform client ID is configured */}
              {isGoogleSignInAvailable() && (
                <>
                  <View className="flex-row items-center my-5">
                    <View className="flex-1 h-px bg-stone-200" />
                    <Text className="mx-3 text-stone-400 text-sm font-medium">{t('login.orContinueWith')}</Text>
                    <View className="flex-1 h-px bg-stone-200" />
                  </View>
                  <GoogleSignInButton
                    label={t('login.google')}
                    onToken={(token) => void handleGoogleToken(token)}
                  />
                </>
              )}
            </View>

            {/* Register Link */}
            <View className="flex-row justify-center mt-6 mb-8">
              <Text className="text-stone-500">{`${t('login.noAccount')} `}</Text>
              <Link href="/(auth)/register" asChild>
                <TouchableOpacity>
                  <Text className="text-brand-600 font-semibold">{t('login.signUp')}</Text>
                </TouchableOpacity>
              </Link>
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
      <LegalAcceptanceModal
        visible={legalOpen}
        checked={legalChecked}
        onCheckedChange={setLegalChecked}
        onAccept={() => void handleLegalAccept()}
        onCancel={() => void handleLegalCancel()}
        accepting={legalAccepting}
      />
    </SafeAreaView>
  );
}
