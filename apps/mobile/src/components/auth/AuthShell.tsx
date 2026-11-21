import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useT } from '../../i18n';
import { RTL_FLIP } from '../../i18n/native';
import { BrandLogo } from '../brand/BrandLogo';
import { BrandBottomWave, BrandTopWave } from '../brand/BrandWaves';
import { useLightStatusBar } from '../../hooks/useLightStatusBar';

/**
 * Frame for the sign-in, sign-up and password screens: navy/orange brand
 * curves top and bottom, the FlacronCV logo, a large title and subtitle, then
 * the screen's content. Scrolls with the keyboard; content is capped at a
 * phone width so tablets get a centred column.
 */
export function AuthShell({
  title,
  subtitle,
  hero,
  onBack,
  children,
}: {
  title: string;
  subtitle?: string;
  /** Illustration or feature row between the heading and the form. */
  hero?: React.ReactNode;
  /** Shows a back button on the navy band. */
  onBack?: () => void;
  children: React.ReactNode;
}) {
  const insets = useSafeAreaInsets();
  const tc = useT('common');
  useLightStatusBar();
  return (
    <View className="flex-1 bg-surface">
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} className="flex-1">
        <ScrollView
          className="flex-1"
          contentContainerStyle={{ flexGrow: 1 }}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          bounces={false}
        >
          <BrandTopWave />
          {onBack ? (
            <Pressable
              onPress={onBack}
              accessibilityRole="button"
              accessibilityLabel={tc('back')}
              className="absolute start-3 h-11 w-11 items-center justify-center rounded-full"
              style={{ top: insets.top + 6 }}
              hitSlop={8}
            >
              <Ionicons name="arrow-back" size={24} color="#ffffff" style={RTL_FLIP} />
            </Pressable>
          ) : null}

          <View className="w-full self-center px-6" style={{ maxWidth: 480 }}>
            <View className="items-center mt-1">
              <BrandLogo />
              <Text
                className="mt-6 text-center text-[30px] font-black leading-9 text-ink"
                accessibilityRole="header"
              >
                {title}
              </Text>
              {subtitle ? (
                <Text className="mt-2 text-center text-base leading-6 text-stone-600">{subtitle}</Text>
              ) : null}
            </View>
            {hero ? <View className="mt-6">{hero}</View> : null}
            <View className="mt-7">{children}</View>
          </View>

          <View className="mt-auto pt-8">
            <BrandBottomWave />
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

/** "──── Or continue with ────" divider. */
export function AuthDivider({ label }: { label: string }) {
  return (
    <View className="my-6 flex-row items-center">
      <View className="h-px flex-1 bg-stone-200" />
      <Text className="mx-3 text-sm font-medium text-stone-600">{label}</Text>
      <View className="h-px flex-1 bg-stone-200" />
    </View>
  );
}

/** Error message box above an auth form. */
export function AuthError({ message }: { message: string | null | undefined }) {
  if (!message) return null;
  return (
    <View className="mb-5 flex-row items-start rounded-2xl border border-red-200 bg-error-bg p-3.5" accessibilityLiveRegion="polite">
      <Ionicons name="alert-circle" size={18} color="#dc2626" style={{ marginEnd: 8, marginTop: 1 }} />
      <Text className="flex-1 text-sm leading-5 text-error">{message}</Text>
    </View>
  );
}

/** "Don't have an account?  Sign Up Free" footer line. */
export function AuthFooterLink({ prompt, action, onPress }: { prompt: string; action: string; onPress: () => void }) {
  return (
    <View className="mt-7 flex-row flex-wrap items-center justify-center">
      <Text className="text-base text-stone-600">{`${prompt} `}</Text>
      <Pressable onPress={onPress} accessibilityRole="link" hitSlop={10} className="min-h-[44px] justify-center">
        <Text className="text-base font-bold text-brand-700 underline">{action}</Text>
      </Pressable>
    </View>
  );
}
