import { Ionicons } from '@expo/vector-icons';
import { Redirect, Tabs, useSegments } from 'expo-router';
import React from 'react';
import { View } from 'react-native';
import { MaintenanceGate } from '../../src/components/app/MaintenanceGate';
import { AppTour, AppTourProvider } from '../../src/components/tour/AppTour';
import { useAuthStore } from '../../src/store/auth-store';
import { colors } from '../../src/theme/colors';
import { usePalette } from '../../src/theme/palette';
import { useT } from '../../src/i18n';
import { CAREER_ENABLED } from '../../src/config/career';

const TAB_ROOTS = new Set(['index', 'cvs', 'cover-letters', 'templates', 'career', 'settings']);

/** Tab roots keep the bar. Pushed stack screens (wizard, editors, support, jobs, …) hide it. */
function hideTabBarOnNested(segments: readonly string[]): boolean {
  const parts = segments.filter((s) => !s.startsWith('('));
  if (parts.length <= 1) return false;
  const tab = parts[0];
  if (tab === 'support' || tab === 'jobs' || tab === 'career') return true;
  const rest = parts.slice(1).filter((s) => s !== 'index');
  return TAB_ROOTS.has(tab) && rest.length > 0;
}

export default function DashboardLayout() {
  const t = useT('tabs');
  const { firebaseUser, isInitialized, legalGate } = useAuthStore();
  const segments = useSegments();
  const hideTabBar = hideTabBarOnNested(segments);
  const palette = usePalette();

  if (isInitialized && (!firebaseUser || legalGate)) {
    return <Redirect href="/(auth)/login" />;
  }

  // Maintenance mode blocks the signed-in app (admins pass); the tour card floats above the tabs.
  return (
    <MaintenanceGate>
      <AppTourProvider>
        <View style={{ flex: 1 }}>
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.brand[600],
        tabBarInactiveTintColor: palette.muted,
        sceneStyle: { backgroundColor: palette.page },
        tabBarStyle: hideTabBar
          ? { display: 'none' }
          : {
              backgroundColor: palette.surface,
              borderTopColor: palette.border,
            },
        // React Navigation sizes the bar for its default label; extra padding or a
        // larger label pushes the text below the bar (clipped on Android).
        tabBarLabelStyle: {
          fontSize: 10,
          fontWeight: '600',
        },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: t('dashboard'),
          tabBarIcon: ({ color, focused }) => (
            <Ionicons name={focused ? 'grid' : 'grid-outline'} size={22} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="cvs"
        options={{
          title: t('cvs'),
          tabBarIcon: ({ color, focused }) => (
            <Ionicons name={focused ? 'document-text' : 'document-text-outline'} size={22} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="cover-letters"
        options={{
          title: t('coverLetters'),
          tabBarIcon: ({ color, focused }) => (
            <Ionicons name={focused ? 'mail' : 'mail-outline'} size={22} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="templates"
        options={{
          // With career tools on, Career takes this slot; templates stay one tap away on Home.
          ...(CAREER_ENABLED ? { href: null } : {}),
          title: t('templates'),
          tabBarIcon: ({ color, focused }) => (
            <Ionicons name={focused ? 'layers' : 'layers-outline'} size={22} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="career"
        options={{
          // Career tools; the stack redirects home when the build has career off.
          ...(CAREER_ENABLED ? {} : { href: null }),
          title: t('career'),
          tabBarIcon: ({ color, focused }) => (
            <Ionicons name={focused ? 'compass' : 'compass-outline'} size={22} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          title: t('settings'),
          tabBarIcon: ({ color, focused }) => (
            <Ionicons name={focused ? 'settings' : 'settings-outline'} size={22} color={color} />
          ),
        }}
      />
      {/* Support and Job Tracker are reachable in-app but not top-level tabs */}
      <Tabs.Screen
        name="support"
        options={{ href: null }}
      />
      <Tabs.Screen
        name="jobs"
        options={{ href: null }}
      />
    </Tabs>
          <AppTour />
        </View>
      </AppTourProvider>
    </MaintenanceGate>
  );
}
