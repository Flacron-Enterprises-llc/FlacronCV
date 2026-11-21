import { zodResolver } from '@hookform/resolvers/zod';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import React, { useCallback, useMemo, useRef, useState } from 'react';
import { Controller, useForm, useWatch } from 'react-hook-form';
import { Alert, Text, TextInput, View } from 'react-native';
import { z } from 'zod';
import {
  AppleSignInButton,
  useAppleSignInAvailable,
  type AppleSignInHandle,
} from '../../src/components/auth/AppleSignInButton';
import { AuthDivider, AuthError, AuthFooterLink, AuthShell } from '../../src/components/auth/AuthShell';
import {
  GoogleSignInButton,
  isGoogleSignInAvailable,
  type GoogleSignInHandle,
} from '../../src/components/auth/GoogleSignInButton';
import {
  LegalAcceptanceModal,
  LegalSignupLine,
} from '../../src/components/auth/LegalAcceptanceModal';
import { Button } from '../../src/components/ui/Button';
import { Input } from '../../src/components/ui/Input';
import { useT, type TFunction } from '../../src/i18n';
import {
  legalPostFailedMessage,
  legalPostFailedTitle,
  recordAcceptanceAfterSignup,
} from '../../src/lib/legal-acceptance';
import { getFirebaseAuth } from '../../src/lib/firebase';
import { useAuthStore, type AppleSignInResult } from '../../src/store/auth-store';
import { EmailSuggestion, PasswordStrengthMeter } from '../../src/components/auth/PasswordStrength';
import { passwordStrength, suggestEmail } from '../../src/lib/auth-quality';
import { colors } from '../../src/theme/colors';

WebBrowser.maybeCompleteAuthSession();

/** `t` is the `auth` namespace translator. */
const makeSchema = (t: TFunction) =>
  z
    .object({
      displayName: z.string().trim().min(2, t('validation.nameMin')),
      email: z.string().trim().email(t('validation.email')),
      password: z.string().min(8, t('validation.passwordMin8')),
      confirmPassword: z.string(),
    })
    .refine((d) => passwordStrength(d.password, guessableWords(d.displayName, d.email)).acceptable || d.password.length < 8, {
      message: t('validation.passwordCommon'),
      path: ['password'],
    })
    .refine((d) => d.password === d.confirmPassword, {
      message: t('validation.passwordsMismatch'),
      path: ['confirmPassword'],
    });

type FormData = z.infer<ReturnType<typeof makeSchema>>;

/** Words that would make a password guessable for this person. */
function guessableWords(name: string, email: string): string[] {
  return [name, ...name.split(/\s+/), email.split('@')[0] ?? ''];
}

export default function RegisterScreen() {
  const t = useT('auth');
  const schema = useMemo(() => makeSchema(t), [t]);
  const router = useRouter();
  const { register, loginWithGoogle, loginWithApple, isLoading, error, clearError, setLegalGate } = useAuthStore();
  const googleRef = useRef<GoogleSignInHandle>(null);
  const appleRef = useRef<AppleSignInHandle>(null);
  const pendingSignup = useRef<'password' | 'google' | 'apple' | null>(null);
  const googleAvailable = isGoogleSignInAvailable();
  const appleAvailable = useAppleSignInAvailable();
  const pendingForm = useRef<FormData | null>(null);
  const [legalOpen, setLegalOpen] = useState(false);
  const [legalChecked, setLegalChecked] = useState(false);
  const [legalAccepting, setLegalAccepting] = useState(false);

  const {
    control,
    handleSubmit,
    setValue,
    formState: { errors },
  } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: { displayName: '', email: '', password: '', confirmPassword: '' },
  });
  const [watchName, watchEmail, watchPassword] = useWatch({ control, name: ['displayName', 'email', 'password'] });
  const strength = useMemo(
    () => passwordStrength(watchPassword ?? '', guessableWords(watchName ?? '', watchEmail ?? '')),
    [watchName, watchEmail, watchPassword],
  );
  const emailSuggestion = useMemo(() => suggestEmail(watchEmail ?? ''), [watchEmail]);
  const emailRef = useRef<TextInput>(null);
  const passwordRef = useRef<TextInput>(null);
  const confirmRef = useRef<TextInput>(null);

  const closeLegal = () => {
    setLegalOpen(false);
    setLegalChecked(false);
    pendingSignup.current = null;
    pendingForm.current = null;
  };

  const completeLegalOrStayGated = async (): Promise<boolean> => {
    const ok = await recordAcceptanceAfterSignup();
    if (ok) {
      setLegalGate(false);
      closeLegal();
      return true;
    }
    Alert.alert(legalPostFailedTitle(), legalPostFailedMessage());
    setLegalOpen(true);
    return false;
  };

  /** Google or Apple after the person agreed in the modal: sign in, then record the agreement. */
  const handleProviderSignUp = useCallback(async (signIn: () => Promise<unknown>) => {
    clearError();
    setLegalGate(true);
    try {
      await signIn();
      const ok = await recordAcceptanceAfterSignup();
      if (ok) {
        setLegalGate(false);
        setLegalOpen(false);
        setLegalChecked(false);
        pendingSignup.current = null;
        pendingForm.current = null;
      } else {
        Alert.alert(legalPostFailedTitle(), legalPostFailedMessage());
        setLegalOpen(true);
      }
    } catch {
      // They already agreed in the modal. If Auth exists, record legal;
      // else clear leftover gate so email login is not stuck.
      if (getFirebaseAuth().currentUser) {
        const ok = await recordAcceptanceAfterSignup();
        if (ok) {
          setLegalGate(false);
          setLegalOpen(false);
          setLegalChecked(false);
          pendingSignup.current = null;
          pendingForm.current = null;
        } else {
          Alert.alert(legalPostFailedTitle(), legalPostFailedMessage());
          setLegalOpen(true);
        }
      } else {
        setLegalGate(false);
      }
    }
  }, [clearError, setLegalGate]);

  const handleGoogleToken = useCallback(
    (token: string) => void handleProviderSignUp(() => loginWithGoogle(token)),
    [handleProviderSignUp, loginWithGoogle],
  );
  const handleAppleResult = useCallback(
    (result: AppleSignInResult) => void handleProviderSignUp(() => loginWithApple(result)),
    [handleProviderSignUp, loginWithApple],
  );

  /** A provider button: the legal agreement comes first, then the provider sheet. */
  const startProviderSignUp = (method: 'google' | 'apple') => {
    clearError();
    pendingSignup.current = method;
    setLegalChecked(false);
    setLegalOpen(true);
  };

  const onSubmit = (data: FormData) => {
    clearError();
    pendingSignup.current = 'password';
    pendingForm.current = data;
    setLegalChecked(false);
    setLegalOpen(true);
  };

  const handleLegalAccept = async () => {
    if (!legalChecked || legalAccepting) return;

    // Auth already exists (Google POST retry, or leftover session). Record only.
    if (getFirebaseAuth().currentUser) {
      setLegalAccepting(true);
      try {
        await completeLegalOrStayGated();
      } finally {
        setLegalAccepting(false);
      }
      return;
    }

    if (!pendingSignup.current) return;
    const method = pendingSignup.current;
    const form = pendingForm.current;

    if (method === 'password' && form) {
      setLegalAccepting(true);
      setLegalGate(true);
      try {
        // register() fail-softs Nest verify so we still record legal below.
        await register(form.email, form.password, form.displayName);
        await completeLegalOrStayGated();
      } catch {
        // Firebase create/profile failed. If Auth user exists, still record
        // legal (they already ticked). Else drop gate so login is not stuck.
        if (getFirebaseAuth().currentUser) {
          await completeLegalOrStayGated();
        } else {
          setLegalGate(false);
          closeLegal();
        }
      } finally {
        setLegalAccepting(false);
      }
    } else if (method === 'google') {
      setLegalOpen(false);
      await googleRef.current?.prompt();
    } else if (method === 'apple') {
      setLegalOpen(false);
      await appleRef.current?.prompt();
    }
  };

  return (
    <>
      <AuthShell title={t('register.title')} subtitle={t('register.subtitle')} hero={<FeatureRow />}>
        <AuthError message={error} />

        <Controller
          control={control}
          name="displayName"
          render={({ field }) => (
            <Input
              variant="soft"
              labelIcon="person-outline"
              label={t('fields.fullName')}
              placeholder={t('fields.fullNamePlaceholder')}
              autoCapitalize="words"
              autoComplete="name"
              textContentType="name"
              returnKeyType="next"
              submitBehavior="submit"
              onSubmitEditing={() => emailRef.current?.focus()}
              value={field.value}
              onChangeText={field.onChange}
              error={errors.displayName?.message}
            />
          )}
        />

        <Controller
          control={control}
          name="email"
          render={({ field }) => (
            <Input
              ref={emailRef}
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
              placeholder={t('fields.passwordPlaceholder')}
              isPassword
              autoComplete="new-password"
              textContentType="newPassword"
              returnKeyType="next"
              submitBehavior="submit"
              onSubmitEditing={() => confirmRef.current?.focus()}
              value={field.value}
              onChangeText={field.onChange}
              error={errors.password?.message}
            />
          )}
        />
        {watchPassword ? <PasswordStrengthMeter strength={strength} /> : null}

        <Controller
          control={control}
          name="confirmPassword"
          render={({ field }) => (
            <Input
              variant="soft"
              labelIcon="lock-closed-outline"
              ref={confirmRef}
              label={t('fields.confirmPassword')}
              placeholder={t('fields.confirmPasswordPlaceholder')}
              isPassword
              autoComplete="new-password"
              textContentType="newPassword"
              returnKeyType="go"
              onSubmitEditing={handleSubmit(onSubmit)}
              value={field.value}
              onChangeText={field.onChange}
              error={errors.confirmPassword?.message}
            />
          )}
        />

        <View className="mb-6 mt-1 flex-row items-start rounded-2xl bg-brand-50 p-3.5">
          <Ionicons name="shield-checkmark" size={18} color={colors.brand[600]} style={{ marginEnd: 10, marginTop: 1 }} />
          <View className="flex-1">
            <LegalSignupLine />
          </View>
        </View>

        <Button variant="primary" size="lg" pill fullWidth loading={isLoading} onPress={handleSubmit(onSubmit)}>
          {t('register.submit')}
        </Button>

        {/* Provider sign-up — each button only when its provider is configured for this build */}
        {googleAvailable || appleAvailable ? (
          <>
            <AuthDivider label={t('register.orSignUpWith')} />
            <View className="gap-3">
              {googleAvailable ? (
                <GoogleSignInButton
                  ref={googleRef}
                  label={t('register.google')}
                  onPressOverride={() => startProviderSignUp('google')}
                  onToken={handleGoogleToken}
                />
              ) : null}
              {appleAvailable ? (
                <AppleSignInButton
                  ref={appleRef}
                  label={t('register.apple')}
                  onPressOverride={() => startProviderSignUp('apple')}
                  onResult={handleAppleResult}
                />
              ) : null}
            </View>
          </>
        ) : null}

        <AuthFooterLink
          prompt={t('register.haveAccount')}
          action={t('register.signIn')}
          onPress={() => (router.canGoBack() ? router.back() : router.replace('/(auth)/login'))}
        />
      </AuthShell>
      <LegalAcceptanceModal
        visible={legalOpen}
        checked={legalChecked}
        onCheckedChange={setLegalChecked}
        onAccept={() => void handleLegalAccept()}
        onCancel={closeLegal}
        accepting={legalAccepting || isLoading}
      />
    </>
  );
}

/** Build CV · Find Jobs · Grow Career — what the account is for, at a glance. */
function FeatureRow() {
  const t = useT('auth');
  const items = [
    { icon: 'document-text-outline' as const, label: t('register.features.buildCv'), tint: 'bg-brand-50', color: colors.brand[600] },
    { icon: 'briefcase-outline' as const, label: t('register.features.findJobs'), tint: 'bg-brand-50', color: colors.brand[600] },
    { icon: 'school-outline' as const, label: t('register.features.growCareer'), tint: 'bg-stone-100', color: colors.ink },
  ];
  return (
    <View className="flex-row items-stretch">
      {items.map((item, i) => (
        <View key={item.icon} className="flex-1 flex-row">
          {i > 0 ? <View className="my-2 w-px bg-stone-200" /> : null}
          <View className="flex-1 items-center px-1">
            <View className={`h-14 w-14 items-center justify-center rounded-full ${item.tint}`}>
              <Ionicons name={item.icon} size={24} color={item.color} />
            </View>
            <Text className="mt-2 text-center text-[15px] font-bold text-ink" numberOfLines={2}>
              {item.label}
            </Text>
          </View>
        </View>
      ))}
    </View>
  );
}
