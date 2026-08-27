import { Ionicons } from '@expo/vector-icons';
import { Redirect, Tabs, useSegments } from 'expo-router';
import React from 'react';
import { useAuthStore } from '../../src/store/auth-store';

const TAB_ROOTS = new Set(['index', 'cvs', 'cover-letters', 'templates', 'settings']);

/** Tab roots keep the bar. Pushed stack screens (wizard, editors, support, …) hide it. */
function hideTabBarOnNested(segments: readonly string[]): boolean {
  const parts = segments.filter((s) => !s.startsWith('('));
  if (parts.length <= 1) return false;
  const tab = parts[0];
  if (tab === 'support') return true;
  const rest = parts.slice(1).filter((s) => s !== 'index');
  return TAB_ROOTS.has(tab) && rest.length > 0;
}

export default function DashboardLayout() {
  const { firebaseUser, isInitialized, legalGate } = useAuthStore();
  const segments = useSegments();
  const hideTabBar = hideTabBarOnNested(segments);

  if (isInitialized && (!firebaseUser || legalGate)) {
    return <Redirect href="/(auth)/login" />;
  }

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: '#f97316',
        tabBarInactiveTintColor: '#a8a29e',
        tabBarStyle: hideTabBar
          ? { display: 'none' }
          : {
              backgroundColor: '#fff',
              borderTopColor: '#f5f5f4',
            },
        tabBarLabelStyle: {
          fontSize: 10,
          fontWeight: '600',
        },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Dashboard',
          tabBarIcon: ({ color }) => (
            <Ionicons name="grid-outline" size={22} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="cvs"
        options={{
          title: 'My CVs',
          tabBarIcon: ({ color }) => (
            <Ionicons name="document-text-outline" size={22} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="cover-letters"
        options={{
          title: 'Cover Letters',
          tabBarIcon: ({ color }) => (
            <Ionicons name="mail-outline" size={22} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="templates"
        options={{
          title: 'Templates',
          tabBarIcon: ({ color }) => (
            <Ionicons name="layers-outline" size={22} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          title: 'Settings',
          tabBarIcon: ({ color }) => (
            <Ionicons name="settings-outline" size={22} color={color} />
          ),
        }}
      />
      {/* Support is accessible from within the app but not a top-level tab */}
      <Tabs.Screen
        name="support"
        options={{ href: null }}
      />
    </Tabs>
  );
}
