import { zodResolver } from '@hookform/resolvers/zod';
import { LinearGradient } from 'expo-linear-gradient';
import { Link } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import React, { useCallback, useRef, useState } from 'react';
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
import {
  LEGAL_POST_FAILED_MESSAGE,
  LEGAL_POST_FAILED_TITLE,
  recordAcceptanceAfterSignup,
} from '../../src/lib/legal-acceptance';
import { getFirebaseAuth } from '../../src/lib/firebase';
import { useAuthStore } from '../../src/store/auth-store';
import { colors } from '../../src/theme/colors';

WebBrowser.maybeCompleteAuthSession();

const schema = z
  .object({
    displayName: z.string().min(2, 'Name must be at least 2 characters'),
    email: z.string().email('Please enter a valid email'),
    password: z.string().min(8, 'Password must be at least 8 characters'),
    confirmPassword: z.string(),
  })
  .refine((d) => d.password === d.confirmPassword, {
    message: "Passwords don't match",
    path: ['confirmPassword'],
  });

type FormData = z.infer<typeof schema>;

export default function RegisterScreen() {
  const { register, loginWithGoogle, isLoading, error, clearError, setLegalGate } = useAuthStore();
  const googleRef = useRef<GoogleSignInHandle>(null);
  const pendingSignup = useRef<'password' | 'google' | null>(null);
  const pendingForm = useRef<FormData | null>(null);
  const [legalOpen, setLegalOpen] = useState(false);
  const [legalChecked, setLegalChecked] = useState(false);
  const [legalAccepting, setLegalAccepting] = useState(false);

  const {
    control,
    handleSubmit,
    formState: { errors },
  } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: { displayName: '', email: '', password: '', confirmPassword: '' },
  });

  const closeLegal = () => {
    setLegalOpen(false);
    setLegalChecked(false);
    pendingSignup.current = null;
    pendingForm.current = null;
  };

  const finishAcceptance = async () => {
    const ok = await recordAcceptanceAfterSignup();
    if (!ok) {
      Alert.alert(LEGAL_POST_FAILED_TITLE, LEGAL_POST_FAILED_MESSAGE);
    }
  };

  const handleGoogleToken = useCallback(async (token: string) => {
    clearError();
    setLegalGate(true);
    try {
      await loginWithGoogle(token);
      await finishAcceptance();
      setLegalGate(false);
    } catch {
      // They already agreed in the modal. If Auth exists, record legal;
      // else clear leftover gate so email login is not stuck.
      if (getFirebaseAuth().currentUser) {
        await finishAcceptance();
        setLegalGate(false);
      } else {
        setLegalGate(false);
      }
    }
  }, [clearError, loginWithGoogle, setLegalGate]);

  const onSubmit = (data: FormData) => {
    clearError();
    pendingSignup.current = 'password';
    pendingForm.current = data;
    setLegalChecked(false);
    setLegalOpen(true);
  };

  const handleLegalAccept = async () => {
    if (!legalChecked || !pendingSignup.current || legalAccepting) return;
    const method = pendingSignup.current;
    const form = pendingForm.current;

    if (method === 'password' && form) {
      setLegalAccepting(true);
      setLegalGate(true);
      try {
        // register() fail-softs Nest verify so we still record legal below.
        await register(form.email, form.password, form.displayName);
        await finishAcceptance();
        setLegalGate(false);
        closeLegal();
      } catch {
        // Firebase create/profile failed. If Auth user exists, still record
        // legal (they already ticked). Else drop gate so login is not stuck.
        if (getFirebaseAuth().currentUser) {
          await finishAcceptance();
          setLegalGate(false);
        } else {
          setLegalGate(false);
        }
        setLegalOpen(false);
        setLegalChecked(false);
        pendingSignup.current = null;
        pendingForm.current = null;
      } finally {
        setLegalAccepting(false);
      }
    } else if (method === 'google') {
      closeLegal();
      await googleRef.current?.prompt();
    }
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
              <Text className="text-xl font-bold text-stone-900">Create account</Text>
              <Text className="text-stone-500 mt-1">Start building your dream CV today</Text>
            </View>
          </LinearGradient>

          {/* Form Card */}
          <View className="px-6 -mt-4">
            <View className="bg-white rounded-3xl border border-stone-100 shadow-sm p-6">
              {/* Google Sign-Up — only rendered when the platform client ID is configured */}
              {isGoogleSignInAvailable() && (
                <>
                  <View style={{ marginBottom: 16 }}>
                    <GoogleSignInButton
                      ref={googleRef}
                      label="Sign up with Google"
                      onPressOverride={() => {
                        clearError();
                        pendingSignup.current = 'google';
                        setLegalChecked(false);
                        setLegalOpen(true);
                      }}
                      onToken={(token) => void handleGoogleToken(token)}
                    />
                  </View>
                  <View className="flex-row items-center mb-5">
                    <View className="flex-1 h-px bg-stone-200" />
                    <Text className="mx-3 text-stone-400 text-sm font-medium">or with email</Text>
                    <View className="flex-1 h-px bg-stone-200" />
                  </View>
                </>
              )}

              {/* Error Banner */}
              {error && (
                <View className="bg-red-50 border border-red-200 rounded-xl p-3 mb-4">
                  <Text className="text-red-600 text-sm">{error}</Text>
                </View>
              )}

              <Controller
                control={control}
                name="displayName"
                render={({ field }) => (
                  <Input
                    label="Full Name"
                    placeholder="John Doe"
                    autoCapitalize="words"
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
                    label="Email Address"
                    placeholder="you@example.com"
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
                name="password"
                render={({ field }) => (
                  <Input
                    label="Password"
                    placeholder="Min. 8 characters"
                    isPassword
                    value={field.value}
                    onChangeText={field.onChange}
                    error={errors.password?.message}
                  />
                )}
              />

              <Controller
                control={control}
                name="confirmPassword"
                render={({ field }) => (
                  <Input
                    label="Confirm Password"
                    placeholder="Repeat password"
                    isPassword
                    value={field.value}
                    onChangeText={field.onChange}
                    error={errors.confirmPassword?.message}
                  />
                )}
              />

              <LegalSignupLine />

              <Button
                variant="primary"
                size="lg"
                fullWidth
                loading={isLoading}
                onPress={handleSubmit(onSubmit)}
              >
                Create Account
              </Button>
            </View>

            {/* Login Link */}
            <View className="flex-row justify-center mt-6 mb-8">
              <Text className="text-stone-500">Already have an account? </Text>
              <Link href="/(auth)/login" asChild>
                <TouchableOpacity>
                  <Text className="text-brand-600 font-semibold">Sign in</Text>
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
        onCancel={closeLegal}
        accepting={legalAccepting || isLoading}
      />
    </SafeAreaView>
  );
}
