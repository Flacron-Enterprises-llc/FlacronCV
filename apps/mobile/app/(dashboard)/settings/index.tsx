import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React from 'react';
import { Alert, ScrollView, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuthStore } from '../../../src/store/auth-store';
import { useCurrentUser, useUploadProfilePhoto } from '../../../src/hooks/useUser';
import { getInitials } from '../../../src/lib/utils';
import { SubscriptionPlan } from '../../../src/types/enums';
import { PLAN_CONFIGS } from '../../../src/types/subscription.types';

export default function SettingsScreen() {
  const router = useRouter();
  const { user: authUser, logout } = useAuthStore();
  const { data: user } = useCurrentUser();
  const uploadPhoto = useUploadProfilePhoto();

  const currentUser = user ?? authUser;
  const plan = currentUser?.subscription?.plan ?? SubscriptionPlan.FREE;
  const planConfig = PLAN_CONFIGS[plan];

  const handleLogout = () => {
    Alert.alert('Sign Out', 'Are you sure you want to sign out?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Sign Out', style: 'destructive', onPress: logout },
    ]);
  };

  const MENU_SECTIONS = [
    {
      title: 'Account',
      items: [
        { icon: 'person-outline', label: 'Profile', onPress: () => router.push('/(dashboard)/settings/profile') },
        { icon: 'notifications-outline', label: 'Notifications', onPress: () => {} },
        { icon: 'shield-checkmark-outline', label: 'Security', onPress: () => {} },
      ],
    },
    {
      title: 'Subscription',
      items: [
        { icon: 'card-outline', label: 'Billing & Plans', onPress: () => router.push('/(dashboard)/settings/billing'), badge: planConfig.plan.toUpperCase() },
      ],
    },
    {
      title: 'Support',
      items: [
        { icon: 'help-circle-outline', label: 'Help & Support', onPress: () => router.push('/(dashboard)/support') },
        { icon: 'document-text-outline', label: 'Terms of Service', onPress: () => {} },
        { icon: 'lock-closed-outline', label: 'Privacy Policy', onPress: () => {} },
      ],
    },
  ];

  return (
    <SafeAreaView className="flex-1 bg-stone-50">
      <ScrollView showsVerticalScrollIndicator={false}>
        {/* Profile Header */}
        <View className="bg-white px-5 pt-6 pb-6 border-b border-stone-100">
          <View className="flex-row items-center">
            <TouchableOpacity onPress={() => uploadPhoto.mutate()} className="relative">
              <View className="w-16 h-16 rounded-full bg-brand-100 items-center justify-center">
                <Text className="text-brand-700 text-xl font-black">
                  {getInitials(currentUser?.displayName ?? 'U')}
                </Text>
              </View>
              <View className="absolute -bottom-1 -right-1 w-5 h-5 rounded-full bg-brand-500 items-center justify-center border-2 border-white">
                <Ionicons name="camera" size={10} color="#fff" />
              </View>
            </TouchableOpacity>
            <View className="ml-4 flex-1">
              <Text className="text-lg font-black text-stone-900">{currentUser?.displayName ?? 'User'}</Text>
              <Text className="text-stone-500 text-sm">{currentUser?.email}</Text>
              <View className="flex-row items-center mt-1.5">
                <View className="bg-brand-100 px-2.5 py-0.5 rounded-full">
                  <Text className="text-brand-700 text-xs font-bold capitalize">{plan}</Text>
                </View>
              </View>
            </View>
            <Ionicons name="chevron-forward" size={18} color="#d6d3d1" />
          </View>
        </View>

        {/* Usage Stats */}
        <View className="bg-white mx-4 my-4 rounded-2xl border border-stone-100 p-4">
          <Text className="font-bold text-stone-800 mb-3">Monthly Usage</Text>
          <UsageBar
            label="AI Credits"
            used={currentUser?.usage?.aiCreditsUsed ?? 0}
            limit={currentUser?.usage?.aiCreditsLimit ?? 5}
            color="#8b5cf6"
          />
          <UsageBar
            label="Exports"
            used={currentUser?.usage?.exportsThisMonth ?? 0}
            limit={typeof planConfig.limits.exports === 'number' ? planConfig.limits.exports : 999}
            color="#f97316"
            unlimited={planConfig.limits.exports === 'unlimited'}
          />
        </View>

        {/* Menu Sections */}
        {MENU_SECTIONS.map((section) => (
          <View key={section.title} className="mx-4 mb-4">
            <Text className="text-xs font-semibold text-stone-400 uppercase tracking-wide px-1 mb-2">
              {section.title}
            </Text>
            <View className="bg-white rounded-2xl border border-stone-100 overflow-hidden">
              {section.items.map((item, index) => (
                <TouchableOpacity
                  key={item.label}
                  onPress={item.onPress}
                  className={['flex-row items-center px-4 py-4', index > 0 ? 'border-t border-stone-50' : ''].join(' ')}
                  activeOpacity={0.7}
                >
                  <View className="w-8 h-8 rounded-xl bg-stone-100 items-center justify-center mr-3">
                    <Ionicons name={item.icon as any} size={18} color="#78716c" />
                  </View>
                  <Text className="flex-1 text-stone-800 font-medium">{item.label}</Text>
                  {item.badge && (
                    <View className="bg-brand-100 px-2 py-0.5 rounded-full mr-2">
                      <Text className="text-brand-600 text-xs font-bold">{item.badge}</Text>
                    </View>
                  )}
                  <Ionicons name="chevron-forward" size={16} color="#d6d3d1" />
                </TouchableOpacity>
              ))}
            </View>
          </View>
        ))}

        {/* Sign Out */}
        <View className="mx-4 mb-8">
          <TouchableOpacity
            onPress={handleLogout}
            className="bg-red-50 border border-red-100 rounded-2xl p-4 flex-row items-center justify-center"
          >
            <Ionicons name="log-out-outline" size={20} color="#ef4444" />
            <Text className="text-red-500 font-semibold ml-2">Sign Out</Text>
          </TouchableOpacity>
          <Text className="text-center text-stone-300 text-xs mt-3">
            FlacronCV v1.0.0
          </Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function UsageBar({ label, used, limit, color, unlimited = false }: {
  label: string; used: number; limit: number; color: string; unlimited?: boolean;
}) {
  const percent = unlimited ? 10 : Math.min((used / Math.max(limit, 1)) * 100, 100);
  return (
    <View className="mb-3">
      <View className="flex-row justify-between mb-1">
        <Text className="text-sm text-stone-600">{label}</Text>
        <Text className="text-sm font-semibold text-stone-700">
          {used} / {unlimited ? '∞' : limit}
        </Text>
      </View>
      <View className="h-2 bg-stone-100 rounded-full overflow-hidden">
        <View className="h-full rounded-full" style={{ width: `${percent}%`, backgroundColor: color }} />
      </View>
    </View>
  );
}
