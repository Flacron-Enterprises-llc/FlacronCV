import { zodResolver } from '@hookform/resolvers/zod';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React, { useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { KeyboardAvoidingView, Platform, ScrollView, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { z } from 'zod';
import { Button } from '../../src/components/ui/Button';
import { Input } from '../../src/components/ui/Input';
import { useAuthStore } from '../../src/store/auth-store';
import { colors } from '../../src/theme/colors';

const schema = z.object({
  email: z.string().email('Please enter a valid email'),
});

type FormData = z.infer<typeof schema>;

export default function ForgotPasswordScreen() {
  const router = useRouter();
  const { resetPassword, isLoading } = useAuthStore();
  const [sent, setSent] = useState(false);

  const { control, handleSubmit, formState: { errors } } = useForm<FormData>({
    resolver: zodResolver(schema),
  });

  const onSubmit = async (data: FormData) => {
    try {
      await resetPassword(data.email);
      setSent(true);
    } catch {
      // Error handled in store
    }
  };

  return (
    <SafeAreaView className="flex-1 bg-white">
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} className="flex-1">
        <ScrollView className="flex-1 px-6" keyboardShouldPersistTaps="handled">
          <TouchableOpacity onPress={() => router.back()} className="mt-4 mb-8 flex-row items-center">
            <Ionicons name="arrow-back" size={22} color={colors.stone[500]} />
            <Text className="text-stone-700 ml-2 font-medium">Back to Login</Text>
          </TouchableOpacity>

          {sent ? (
            <View className="items-center py-12">
              <View
                className="mb-4 h-20 w-20 items-center justify-center rounded-full"
                style={{ backgroundColor: colors.success.bg }}
              >
                <Ionicons name="mail-open-outline" size={36} color={colors.success.DEFAULT} />
              </View>
              <Text className="text-xl font-bold text-stone-900 text-center mb-2">Check your email</Text>
              <Text className="text-stone-500 text-center leading-5">
                We've sent password reset instructions to your email address.
              </Text>
              <Button variant="primary" className="mt-8" onPress={() => router.back()}>
                Back to Login
              </Button>
            </View>
          ) : (
            <>
              <Text className="text-xl font-bold text-stone-900 mb-2">Reset password</Text>
              <Text className="text-stone-500 mb-8 leading-5">
                Enter your email address and we'll send you instructions to reset your password.
              </Text>

              <Controller control={control} name="email" render={({ field }) => (
                <Input label="Email Address" placeholder="you@example.com" keyboardType="email-address" autoCapitalize="none" value={field.value} onChangeText={field.onChange} error={errors.email?.message} />
              )} />

              <Button variant="primary" size="lg" fullWidth loading={isLoading} onPress={handleSubmit(onSubmit)}>
                Send Reset Email
              </Button>
            </>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
