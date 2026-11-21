import { zodResolver } from '@hookform/resolvers/zod';
import { Link, useRouter } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Controller, useForm, useWatch } from 'react-hook-form';
import { Alert, Pressable, Text, TextInput, View } from 'react-native';
import { z } from 'zod';
import { AppleSignInButton, useAppleSignInAvailable } from '../../src/components/auth/AppleSignInButton';
import { AuthDivider, AuthError, AuthFooterLink, AuthShell } from '../../src/components/auth/AuthShell';
import { GoogleSignInButton, isGoogleSignInAvailable } from '../../src/components/auth/GoogleSignInButton';
import { LegalAcceptanceModal } from '../../src/components/auth/LegalAcceptanceModal';
import { CvIllustration } from '../../src/components/brand/CvIllustration';
import { Button } from '../../src/components/ui/Button';
import { Input } from '../../src/components/ui/Input';
import { useT } from '../../src/i18n';
import {
  legalPostFailedMessage,
  legalPostFailedTitle,
  recordAcceptanceAfterSignup,
} from '../../src/lib/legal-acceptance';
import { useAuthStore, type AppleSignInResult } from '../../src/store/auth-store';
import { EmailSuggestion } from '../../src/components/auth/PasswordStrength';
import { suggestEmail } from '../../src/lib/auth-quality';

// Required for expo-auth-session redirect to work correctly
WebBrowser.maybeCompleteAuthSession();

const makeSchema = (messages: { email: string; password: string }) =>
  z.object({
    email: z.string().trim().email(messages.email),
    password: z.string().min(6, messages.password),
  });

type FormData = z.infer<ReturnType<typeof makeSchema>>;

export default function LoginScreen() {
  const t = useT('auth');
  const router = useRouter();
  const schema = useMemo(
    () => makeSchema({ email: t('validation.email'), password: t('validation.passwordMin6') }),
    [t],
  );
  const { login, loginWithGoogle, loginWithApple, logout, isLoading, error, clearError, legalGate, setLegalGate } =
    useAuthStore();
  const [legalOpen, setLegalOpen] = useState(false);
  const [legalChecked, setLegalChecked] = useState(false);
  const [legalAccepting, setLegalAccepting] = useState(false);
  const googleAvailable = isGoogleSignInAvailable();
  const appleAvailable = useAppleSignInAvailable();

  const {
    control,
    handleSubmit,
    setValue,
    formState: { errors },
  } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: { email: '', password: '' },
  });
  const watchEmail = useWatch({ control, name: 'email' });
  const emailSuggestion = useMemo(() => suggestEmail(watchEmail ?? ''), [watchEmail]);
  const passwordRef = useRef<TextInput>(null);

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

  /** Google or Apple: a brand-new account must agree to the legal documents first. */
  const handleProviderSignIn = useCallback(
    async (signIn: () => Promise<{ isNewUser: boolean }>) => {
      clearError();
      try {
        const { isNewUser } = await signIn();
        if (isNewUser) {
          setLegalChecked(false);
          setLegalOpen(true);
        }
      } catch {
        // Error in store
      }
    },
    [clearError],
  );

  const handleGoogleToken = useCallback(
    (token: string) => void handleProviderSignIn(() => loginWithGoogle(token, { gateNewUser: true })),
    [handleProviderSignIn, loginWithGoogle],
  );
  const handleAppleResult = useCallback(
    (result: AppleSignInResult) => void handleProviderSignIn(() => loginWithApple(result, { gateNewUser: true })),
    [handleProviderSignIn, loginWithApple],
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
    // next provider sign-in still shows this modal (isNewUser will be false).
    await logout();
  };

  return (
    <>
      <AuthShell title={t('login.title')} subtitle={t('login.subtitle')} hero={<CvIllustration width={236} />}>
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
              autoCorrect={false}
              autoComplete="email"
              textContentType="emailAddress"
              returnKeyType="next"
              submitBehavior="submit"
              onSubmitEditing={() => passwordRef.current?.focus()}
              value={field.value}
              onChangeText={field.onChange}
              error={errors.email?.message}
            />
          )}
        />
        {!errors.email ? (
          <EmailSuggestion suggestion={emailSuggestion} onAccept={(email) => setValue('email', email, { shouldValidate: true })} />
        ) : null}

        <Controller
          control={control}
          name="password"
          render={({ field }) => (
            <Input
              ref={passwordRef}
              variant="soft"
              labelIcon="lock-closed-outline"
              label={t('fields.password')}
              placeholder="••••••••"
              isPassword
              autoComplete="password"
              textContentType="password"
              value={field.value}
              onChangeText={field.onChange}
              onSubmitEditing={handleSubmit(onSubmit)}
              returnKeyType="go"
              error={errors.password?.message}
            />
          )}
        />

        <Link href="/(auth)/forgot-password" asChild>
          <Pressable className="-mt-1 mb-6 min-h-[44px] justify-center self-end" accessibilityRole="link" hitSlop={6}>
            <Text className="text-[15px] font-semibold text-brand-700">{t('login.forgotPassword')}</Text>
          </Pressable>
        </Link>

        <Button variant="primary" size="lg" pill fullWidth loading={isLoading} onPress={handleSubmit(onSubmit)}>
          {t('login.submit')}
        </Button>

        {/* Provider sign-in — each button only when its provider is configured for this build */}
        {googleAvailable || appleAvailable ? (
          <>
            <AuthDivider label={t('login.orContinueWith')} />
            <View className="gap-3">
              {googleAvailable ? <GoogleSignInButton label={t('login.google')} onToken={handleGoogleToken} /> : null}
              {appleAvailable ? <AppleSignInButton label={t('login.apple')} onResult={handleAppleResult} /> : null}
            </View>
          </>
        ) : null}

        <AuthFooterLink
          prompt={t('login.noAccount')}
          action={t('login.signUp')}
          onPress={() => router.push('/(auth)/register')}
        />
      </AuthShell>
      <LegalAcceptanceModal
        visible={legalOpen}
        checked={legalChecked}
        onCheckedChange={setLegalChecked}
        onAccept={() => void handleLegalAccept()}
        onCancel={() => void handleLegalCancel()}
        accepting={legalAccepting}
      />
    </>
  );
}
