import '../global.css';
import * as Notifications from 'expo-notifications';
import { Stack, useRouter, type Href } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import React, { useEffect } from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import {
  ensureRemindersChannel,
  jobHref,
  jobIdFromNotificationResponse,
} from '../src/lib/job-reminders';
import { AuthProvider } from '../src/providers/AuthProvider';
import { QueryProvider } from '../src/providers/QueryProvider';
import { useAuthStore } from '../src/store/auth-store';

SplashScreen.preventAutoHideAsync();

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

export default function RootLayout() {
  useEffect(() => {
    const timer = setTimeout(() => SplashScreen.hideAsync(), 400);
    return () => clearTimeout(timer);
  }, []);

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <QueryProvider>
        <AuthProvider>
          <NotificationRoutes />
          <Stack screenOptions={{ headerShown: false, animation: 'fade' }}>
            <Stack.Screen name="index" />
            <Stack.Screen
              name="onboarding"
              options={{ animation: 'fade', gestureEnabled: false }}
            />
            <Stack.Screen name="(auth)" />
            <Stack.Screen name="(dashboard)" />
          </Stack>
        </AuthProvider>
      </QueryProvider>
    </GestureHandlerRootView>
  );
}
