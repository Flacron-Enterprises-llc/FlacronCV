import '../global.css';
import * as Notifications from 'expo-notifications';
import { Stack, useRouter, type ErrorBoundaryProps, type Href } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import React, { useEffect } from 'react';
import { View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import {
  ensureRemindersChannel,
  jobHref,
  jobIdFromNotificationResponse,
} from '../src/lib/job-reminders';
import { bootstrapI18n, useProfileLanguageSync } from '../src/i18n/native';
import { CrashScreen } from '../src/components/app/CrashScreen';
import { OfflineBanner } from '../src/components/app/OfflineBanner';
import { AuthProvider } from '../src/providers/AuthProvider';
import { QueryProvider } from '../src/providers/QueryProvider';
import { useAuthStore } from '../src/store/auth-store';
import { THEME_VARS, paletteFor, useScheme } from '../src/theme/palette';

SplashScreen.preventAutoHideAsync();

// Language + layout direction (RTL for ar/ur) before the first screen; see src/i18n/README.md.
void bootstrapI18n();

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

const handledResponseIds = new Set<string>();

function NotificationRoutes() {
  const router = useRouter();
  const sessionReady = useAuthStore(
    (s) => s.isInitialized && !!s.firebaseUser && !s.legalGate,
  );

  useEffect(() => {
    void ensureRemindersChannel();
  }, []);

  useEffect(() => {
    if (!sessionReady) return;

    const open = (response: Notifications.NotificationResponse | null) => {
      if (!response) return;
      const ident = response.notification.request.identifier;
      if (handledResponseIds.has(ident)) return;
      const jobId = jobIdFromNotificationResponse(response);
      if (!jobId) return;
      handledResponseIds.add(ident);
      router.push(jobHref(jobId) as Href);
    };

    const sub = Notifications.addNotificationResponseReceivedListener(open);
    void Notifications.getLastNotificationResponseAsync().then(open);
    return () => sub.remove();
  }, [router, sessionReady]);

  return null;
}

/** The signed-in profile's preferences.language wins over the device copy, as on the website. */
function LanguageSync() {
  useProfileLanguageSync(useAuthStore((s) => s.user?.preferences?.language));
  return null;
}

/**
 * Any screen that throws lands here (expo-router renders it in place of the
 * failed route) instead of a blank screen or a closed app.
 */
export function ErrorBoundary({ error, retry }: ErrorBoundaryProps) {
  useEffect(() => {
    console.error('[screen error]', error);
  }, [error]);
  return <CrashScreen onRetry={() => void retry()} />;
}

export default function RootLayout() {
  // Light or dark from the device setting; THEME_VARS sets every colour token for the tree.
  const scheme = useScheme();
  const palette = paletteFor(scheme);
  useEffect(() => {
    const timer = setTimeout(() => SplashScreen.hideAsync(), 400);
    return () => clearTimeout(timer);
  }, []);

  return (
    <GestureHandlerRootView style={{ flex: 1, backgroundColor: palette.page }}>
      <View style={[{ flex: 1 }, THEME_VARS[scheme]]}>
      <StatusBar style={scheme === 'dark' ? 'light' : 'dark'} />
      <QueryProvider>
        <AuthProvider>
          <LanguageSync />
          <NotificationRoutes />
          <Stack screenOptions={{ headerShown: false, animation: 'fade', contentStyle: { backgroundColor: palette.page } }}>
            <Stack.Screen name="index" />
            <Stack.Screen
              name="onboarding"
              options={{ animation: 'fade', gestureEnabled: false }}
            />
            <Stack.Screen name="(auth)" />
            <Stack.Screen name="(dashboard)" />
          </Stack>
          <OfflineBanner />
        </AuthProvider>
      </QueryProvider>
      </View>
    </GestureHandlerRootView>
  );
}
