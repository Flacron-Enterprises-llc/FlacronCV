import { zodResolver } from '@hookform/resolvers/zod';
import { LinearGradient } from 'expo-linear-gradient';
import { Link } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import React, { useCallback, useEffect, useState } from 'react';
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
import {
  LEGAL_POST_FAILED_MESSAGE,
  LEGAL_POST_FAILED_TITLE,
  recordAcceptanceAfterSignup,
} from '../../src/lib/legal-acceptance';
import { useAuthStore } from '../../src/store/auth-store';

// Required for expo-auth-session redirect to work correctly
WebBrowser.maybeCompleteAuthSession();

const schema = z.object({
  email: z.string().email('Please enter a valid email'),
  password: z.string().min(6, 'Password must be at least 6 characters'),
});

type FormData = z.infer<typeof schema>;

export default function LoginScreen() {
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
      setLegalGate(false);
      setLegalOpen(false);
      if (!ok) {
        Alert.alert(LEGAL_POST_FAILED_TITLE, LEGAL_POST_FAILED_MESSAGE);
      }
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
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        className="flex-1"
      >
        <ScrollView
          className="flex-1"
          contentContainerStyle={{ flexGrow: 1 }}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* Header */}
          <LinearGradient colors={['#fff7ed', '#ffffff']} className="px-6 pt-8 pb-10">
            <View className="items-center mb-8">
              <View
                className="w-14 h-14 rounded-2xl bg-brand-500 items-center justify-center mb-4"
                style={{
                  shadowColor: '#f97316',
                  shadowOffset: { width: 0, height: 6 },
                  shadowOpacity: 0.3,
                  shadowRadius: 12,
                  elevation: 6,
                }}
              >
                <Image
                  source={require('../../assets/logo.png')}
                  style={{ width: 36, height: 36 }}
                  resizeMode="contain"
                />
              </View>
              <Text className="text-2xl font-black text-stone-900">Welcome back</Text>
              <Text className="text-stone-500 mt-1">Sign in to your FlacronCV account</Text>
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
                    label="Email Address"
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
                    label="Password"
                    placeholder="••••••••"
                    isPassword
                    value={field.value}
                    onChangeText={field.onChange}
                    error={errors.password?.message}
                  />
                )}
              />

              <Link href="/(auth)/forgot-password" asChild>
                <TouchableOpacity className="mb-5">
                  <Text className="text-brand-500 text-sm font-medium text-right">
                    Forgot password?
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
                Sign In
              </Button>

              {/* Google Sign-In — only rendered when the platform client ID is configured */}
              {isGoogleSignInAvailable() && (
                <>
                  <View className="flex-row items-center my-5">
                    <View className="flex-1 h-px bg-stone-200" />
                    <Text className="mx-3 text-stone-400 text-sm font-medium">or continue with</Text>
                    <View className="flex-1 h-px bg-stone-200" />
                  </View>
                  <GoogleSignInButton
                    label="Continue with Google"
                    onToken={(token) => void handleGoogleToken(token)}
                  />
                </>
              )}
            </View>

            {/* Register Link */}
            <View className="flex-row justify-center mt-6 mb-8">
              <Text className="text-stone-500">Don't have an account? </Text>
              <Link href="/(auth)/register" asChild>
                <TouchableOpacity>
                  <Text className="text-brand-500 font-semibold">Sign up free</Text>
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
