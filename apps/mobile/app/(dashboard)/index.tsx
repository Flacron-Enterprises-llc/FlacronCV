import { Ionicons } from '@expo/vector-icons';
import axios from 'axios';
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
import { ErrorState } from '../../src/components/ui/ErrorState';
import { useAuthStore } from '../../src/store/auth-store';
import { useCVList } from '../../src/hooks/useCVs';
import { useCoverLetterList } from '../../src/hooks/useCoverLetters';
import { useCurrentUser } from '../../src/hooks/useUser';
import { SubscriptionPlan } from '../../src/types/enums';
import { PLAN_CONFIGS } from '../../src/types/subscription.types';
import { PAID_UPGRADES_ENABLED } from '../../src/config/paid-upgrades';
import { colors } from '../../src/theme/colors';

function loadFailureMessage(err: unknown): string {
  if (axios.isAxiosError(err) && !err.response) {
    return 'No connection. Check your network and try again.';
  }
  return 'Could not load. Please try again.';
}

export default function DashboardScreen() {
  const router = useRouter();
  const { user: authUser, syncUser, userSyncError } = useAuthStore();
  const {
    data: userData,
    error: userError,
    refetch: refetchUser,
    isFetching: userFetching,
    isPending: userPending,
  } = useCurrentUser();
  const {
    data: cvsData,
    error: cvsError,
    refetch: refetchCVs,
    isFetching: cvsFetching,
    isPending: cvsPending,
  } = useCVList();
  const {
    data: clData,
    error: clError,
    refetch: refetchCLs,
    isFetching: clFetching,
    isPending: clPending,
  } = useCoverLetterList();

  const user = userData ?? authUser;
  const usage = user?.usage;
  const usageFailed = !usage && !!(userError || userSyncError);
  const usageLoading = !usage && !usageFailed;

  const cvsFailed = !!cvsError;
  const coverLettersFailed = !!clError;
  const recentsLoading =
    (cvsPending && !cvsData && !cvsError) || (clPending && !clData && !clError);

  const onRefresh = () => {
    void syncUser();
    void refetchUser();
    void refetchCVs();
    void refetchCLs();
  };

  const plan = user?.subscription?.plan;
  const planBadge = {
    [SubscriptionPlan.FREE]: {
      label: 'Free Plan',
      textClass: 'text-stone-600',
      bgClass: 'bg-stone-100',
    },
    [SubscriptionPlan.PRO]: {
      label: 'Pro Plan',
      textClass: 'text-brand-700',
      bgClass: 'bg-brand-100',
    },
    [SubscriptionPlan.ENTERPRISE]: {
      label: 'Enterprise',
      textClass: 'text-brand-700',
      bgClass: 'bg-brand-100',
    },
  };
  const badge = plan ? planBadge[plan] : null;

  const pullRefreshing =
    (userFetching || cvsFetching || clFetching) &&
    !userPending &&
    !cvsPending &&
    !clPending;

  return (
    <SafeAreaView className="flex-1 bg-stone-50" edges={['top']}>
      <ScrollView
        className="flex-1"
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={pullRefreshing}
            onRefresh={onRefresh}
            tintColor={colors.brand[600]}
          />
        }
      >
        {/* Header */}
        <View className="px-5 pt-4 pb-6 bg-white border-b border-stone-100">
          <View className="flex-row items-center justify-between">
            <View className="flex-1">
              <Text className="text-stone-400 text-sm">Welcome back,</Text>
              <Text className="text-xl font-bold text-stone-900" numberOfLines={1}>
                {user?.displayName ?? user?.profile?.firstName ?? 'User'} 👋
              </Text>
            </View>
            {badge ? (
              <View className="flex-row items-center gap-2">
                <View className={`px-3 py-1 rounded-full ${badge.bgClass}`}>
                  <Text className={`text-xs font-bold ${badge.textClass}`}>
                    {badge.label}
                  </Text>
                </View>
              </View>
            ) : null}
          </View>
        </View>

        {/* Stats Grid */}
        <View className="px-5 pt-5">
          <Text className="text-sm font-semibold text-stone-500 uppercase tracking-wide mb-3">
            Overview
          </Text>
          {usageFailed ? (
            <ErrorState
              message={userError ? loadFailureMessage(userError) : (userSyncError ?? 'Could not load. Please try again.')}
              onRetry={() => {
                void syncUser();
                void refetchUser();
              }}
            />
          ) : usageLoading || !usage ? (
            <View className="flex-row gap-3 mb-6">
              <View className="flex-1 bg-white rounded-2xl border border-stone-100 p-4 h-28" />
              <View className="flex-1 bg-white rounded-2xl border border-stone-100 p-4 h-28" />
            </View>
          ) : (
            <>
              <View className="flex-row gap-3 mb-3">
                <StatsCard
                  label="CVs Created"
                  value={usage.cvsCreated}
                  icon="document-text"
                />
                <StatsCard
                  label="Cover Letters"
                  value={usage.coverLettersCreated}
                  icon="mail"
                />
              </View>
              <View className="flex-row gap-3 mb-6">
                <StatsCard
                  label="Downloads"
                  value={usage.exportsThisMonth}
                  icon="download"
                  subtitle="This month"
                />
                <StatsCard
                  label="AI Credits"
                  value={`${usage.aiCreditsUsed}/${usage.aiCreditsLimit}`}
                  icon="sparkles"
                  subtitle="Used this month"
                />
              </View>
            </>
          )}
        </View>

        {/* Quick Actions — all brand-600; same geometry as before */}
        <View className="px-5 mb-6">
          <Text className="text-sm font-semibold text-stone-500 uppercase tracking-wide mb-3">
            Quick Actions
          </Text>
          <View className="flex-row gap-3">
            <TouchableOpacity
              onPress={() => router.push('/(dashboard)/cvs/new')}
              className="flex-1 bg-brand-600 rounded-2xl p-4 items-center"
            >
              <Ionicons name="add-circle" size={28} color={colors.white} />
              <Text className="text-white font-bold mt-1.5 text-sm">New CV</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => router.push('/(dashboard)/cover-letters/new')}
              className="flex-1 bg-brand-600 rounded-2xl p-4 items-center"
            >
              <Ionicons name="mail" size={28} color={colors.white} />
              <Text className="text-white font-bold mt-1.5 text-sm">Cover Letter</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => router.push('/(dashboard)/templates')}
              className="flex-1 bg-brand-600 rounded-2xl p-4 items-center"
            >
              <Ionicons name="layers" size={28} color={colors.white} />
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
              <Text className="text-brand-600 text-sm font-semibold">View all</Text>
            </TouchableOpacity>
          </View>
          <RecentDocuments
            cvs={cvsFailed ? [] : cvsData?.items?.slice(0, 3)}
            coverLetters={coverLettersFailed ? [] : clData?.items?.slice(0, 2)}
            isLoading={recentsLoading}
            cvsFailed={cvsFailed}
            coverLettersFailed={coverLettersFailed}
            errorMessage={loadFailureMessage(cvsError ?? clError)}
            onRetry={() => {
              void refetchCVs();
              void refetchCLs();
            }}
          />
        </View>

        {/* Upgrade Banner (Free users) — hidden when paid upgrades are off (S1). */}
        {PAID_UPGRADES_ENABLED && plan === SubscriptionPlan.FREE && (
          <View className="mx-5 mb-8">
            <View className="bg-brand-600 rounded-2xl p-5 overflow-hidden">
              <View className="flex-row items-center justify-between">
                <View className="flex-1">
                  <Text className="text-white font-bold text-lg">Upgrade to Pro</Text>
                  <Text className="text-brand-100 text-sm mt-0.5">
                    Unlock unlimited CVs, 100 AI credits & more
                  </Text>
                </View>
                <Ionicons name="sparkles" size={36} color="rgba(255,255,255,0.6)" />
              </View>
              <TouchableOpacity
                onPress={() => router.push('/(dashboard)/settings/billing')}
                className="bg-white mt-4 rounded-xl py-2.5 items-center"
              >
                <Text className="text-brand-600 font-bold">
                  {`Upgrade Now — $${PLAN_CONFIGS[SubscriptionPlan.PRO].priceMonthly.toFixed(2)}/mo`}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
