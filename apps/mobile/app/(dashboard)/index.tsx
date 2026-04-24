import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React from 'react';
import {
  RefreshControl,
  ScrollView,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { RecentDocuments } from '../../src/components/dashboard/RecentDocuments';
import { StatsCard } from '../../src/components/dashboard/StatsCard';
import { useAuthStore } from '../../src/store/auth-store';
import { useCVList } from '../../src/hooks/useCVs';
import { useCoverLetterList } from '../../src/hooks/useCoverLetters';
import { useCurrentUser } from '../../src/hooks/useUser';
import { SubscriptionPlan } from '../../src/types/enums';

export default function DashboardScreen() {
  const router = useRouter();
  const { user: authUser } = useAuthStore();
  const { data: userData, refetch: refetchUser, isLoading: userLoading } = useCurrentUser();
  const { data: cvsData, refetch: refetchCVs, isLoading: cvsLoading } = useCVList();
  const { data: clData, refetch: refetchCLs, isLoading: clLoading } = useCoverLetterList();

  const user = userData ?? authUser;
  const isRefreshing = userLoading || cvsLoading || clLoading;

  const onRefresh = () => {
    refetchUser();
    refetchCVs();
    refetchCLs();
  };

  const planBadge = {
    [SubscriptionPlan.FREE]: { label: 'Free Plan', color: '#6b7280', bg: '#f3f4f6' },
    [SubscriptionPlan.PRO]: { label: 'Pro Plan', color: '#d97706', bg: '#fef3c7' },
    [SubscriptionPlan.ENTERPRISE]: { label: 'Enterprise', color: '#7c3aed', bg: '#f3e8ff' },
  };

  const plan = user?.subscription?.plan ?? SubscriptionPlan.FREE;
  const badge = planBadge[plan] ?? planBadge[SubscriptionPlan.FREE];

  return (
    <SafeAreaView className="flex-1 bg-stone-50">
      <ScrollView
        className="flex-1"
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={false} onRefresh={onRefresh} tintColor="#f97316" />
        }
      >
        {/* Header */}
        <View className="px-5 pt-4 pb-6 bg-white border-b border-stone-100">
          <View className="flex-row items-center justify-between">
            <View className="flex-1">
              <Text className="text-stone-400 text-sm">Welcome back,</Text>
              <Text className="text-xl font-black text-stone-900" numberOfLines={1}>
                {user?.displayName ?? user?.profile?.firstName ?? 'User'} 👋
              </Text>
            </View>
            <View className="flex-row items-center gap-2">
              <View className="px-3 py-1 rounded-full" style={{ backgroundColor: badge.bg }}>
                <Text className="text-xs font-bold" style={{ color: badge.color }}>
                  {badge.label}
                </Text>
              </View>
            </View>
          </View>
        </View>

        {/* Stats Grid */}
        <View className="px-5 pt-5">
          <Text className="text-sm font-semibold text-stone-500 uppercase tracking-wide mb-3">
            Overview
          </Text>
          <View className="flex-row gap-3 mb-3">
            <StatsCard
              label="CVs Created"
              value={user?.usage?.cvsCreated ?? cvsData?.total ?? 0}
              icon="document-text"
              color="#f97316"
            />
            <StatsCard
              label="Cover Letters"
              value={user?.usage?.coverLettersCreated ?? clData?.total ?? 0}
              icon="mail"
              color="#3b82f6"
            />
          </View>
          <View className="flex-row gap-3 mb-6">
            <StatsCard
              label="Downloads"
              value={user?.usage?.exportsThisMonth ?? 0}
              icon="download"
              color="#22c55e"
              subtitle="This month"
            />
            <StatsCard
              label="AI Credits"
              value={`${user?.usage?.aiCreditsUsed ?? 0}/${user?.usage?.aiCreditsLimit ?? 5}`}
              icon="sparkles"
              color="#8b5cf6"
              subtitle="Used this month"
            />
          </View>
        </View>

        {/* Quick Actions */}
        <View className="px-5 mb-6">
          <Text className="text-sm font-semibold text-stone-500 uppercase tracking-wide mb-3">
            Quick Actions
          </Text>
          <View className="flex-row gap-3">
            <TouchableOpacity
              onPress={() => router.push('/(dashboard)/cvs/new')}
              className="flex-1 bg-brand-500 rounded-2xl p-4 items-center"
            >
              <Ionicons name="add-circle" size={28} color="#fff" />
              <Text className="text-white font-bold mt-1.5 text-sm">New CV</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => router.push('/(dashboard)/cover-letters/new')}
              className="flex-1 bg-blue-500 rounded-2xl p-4 items-center"
            >
              <Ionicons name="mail" size={28} color="#fff" />
              <Text className="text-white font-bold mt-1.5 text-sm">Cover Letter</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => router.push('/(dashboard)/templates')}
              className="flex-1 bg-stone-800 rounded-2xl p-4 items-center"
            >
              <Ionicons name="layers" size={28} color="#fff" />
              <Text className="text-white font-bold mt-1.5 text-sm">Templates</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Recent Documents */}
        <View className="px-5 mb-8">
          <View className="flex-row items-center justify-between mb-3">
            <Text className="text-sm font-semibold text-stone-500 uppercase tracking-wide">
              Recent Documents
            </Text>
            <TouchableOpacity onPress={() => router.push('/(dashboard)/cvs')}>
              <Text className="text-brand-500 text-sm font-semibold">View all</Text>
            </TouchableOpacity>
          </View>
          <RecentDocuments
            cvs={cvsData?.data?.slice(0, 3)}
            coverLetters={clData?.data?.slice(0, 2)}
            isLoading={cvsLoading || clLoading}
          />
        </View>

        {/* Upgrade Banner (Free users) */}
        {plan === SubscriptionPlan.FREE && (
          <View className="mx-5 mb-8">
            <View className="bg-gradient-to-r from-brand-500 to-orange-600 rounded-2xl p-5 overflow-hidden" style={{ backgroundColor: '#f97316' }}>
              <View className="flex-row items-center justify-between">
                <View className="flex-1">
                  <Text className="text-white font-black text-lg">Upgrade to Pro</Text>
                  <Text className="text-orange-100 text-sm mt-0.5">
                    Unlock unlimited CVs, 100 AI credits & more
                  </Text>
                </View>
                <Ionicons name="sparkles" size={36} color="rgba(255,255,255,0.6)" />
              </View>
              <TouchableOpacity
                onPress={() => router.push('/(dashboard)/settings/billing')}
                className="bg-white mt-4 rounded-xl py-2.5 items-center"
              >
                <Text className="text-brand-600 font-bold">Upgrade Now — $29.99/mo</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
