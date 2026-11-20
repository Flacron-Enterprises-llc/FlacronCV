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
import { AnnouncementBanner } from '../../src/components/app/AnnouncementBanner';
import { PaymentIssueNotice } from '../../src/components/app/PaymentIssueNotice';
import { RecentDocuments } from '../../src/components/dashboard/RecentDocuments';
import { StatsCard } from '../../src/components/dashboard/StatsCard';
import { ErrorState } from '../../src/components/ui/ErrorState';
import { useAuthStore } from '../../src/store/auth-store';
import { useCVList } from '../../src/hooks/useCVs';
import { useCoverLetterList } from '../../src/hooks/useCoverLetters';
import { useCurrentUser } from '../../src/hooks/useUser';
import { useJobList } from '../../src/hooks/useJobs';
import { useV1Usage } from '../../src/hooks/usePayment';
import { PAID_UPGRADES_ENABLED } from '../../src/config/paid-upgrades';
import { CAREER_ENABLED } from '../../src/config/career';
import { planForDisplay, sharedPlanLimits } from '../../src/lib/entitlements';
import { canPurchaseInApp } from '../../src/lib/billing';
import {
  documentStats,
  greetingKey,
  greetingName,
  HOME_PIPELINE,
  isFirstVisit,
  jobPipelineCounts,
} from '../../src/lib/home-dashboard';
import { planBenefits, planName } from '../../src/lib/plan-catalog';
import {
  confirmVerifiedEmail,
  resendVerificationEmail,
} from '../../src/lib/email-verification';
import { colors } from '../../src/theme/colors';
import { formatNumber, t as tNow, useT } from '../../src/i18n';
import { RTL_FLIP } from '../../src/i18n/native';

function loadFailureMessage(err: unknown): string {
  if (axios.isAxiosError(err) && !err.response) {
    return tNow('common.noConnection');
  }
  return tNow('dashboard.loadError');
}

export default function DashboardScreen() {
  const t = useT('dashboard');
  const ts = useT('settings');
  const tPlans = useT('plans');
  const liveUsage = useV1Usage();
  const jobs = useJobList();
  const router = useRouter();
  const { user: authUser, syncUser, userSyncError, emailVerified } = useAuthStore();
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
  // user === null with a Firebase session is not Free — do not paint the Free badge.
  const accountFailed = !user && !!(userError || userSyncError);
  const accountLoading = !user && !accountFailed;

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

  // The real (effective) plan: five-plan or legacy. Legacy Free / Pro keep their old badge wording.
  const plan = user ? planForDisplay(user.subscription) : null;
  const badge = plan
    ? {
        label: plan === 'free' ? t('header.planBadge.free') : plan === 'pro' ? t('header.planBadge.pro') : planName(plan),
        textClass: plan === 'free' ? 'text-stone-600' : 'text-brand-700',
        bgClass: plan === 'free' ? 'bg-stone-100' : 'bg-brand-100',
      }
    : null;
  // Live counters (stored CVs / letters for capacity plans); the sign-in snapshot until they load.
  const counters = liveUsage.data ?? usage;
  const limits = user ? sharedPlanLimits(user.subscription) : null;
  const docs = plan ? documentStats(plan, counters) : null;
  const aiLimit = limits ? Math.min(usage?.aiCreditsLimit ?? limits.aiCredits, limits.aiCredits) : 0;
  const ratio = (used: number, limit: number | null) =>
    limit === null ? `${formatNumber(used)} · ${t('stats.unlimited')}` : `${formatNumber(used)} / ${formatNumber(limit)}`;
  const firstName = greetingName(user);
  const greeting = t(`greeting.${greetingKey(isFirstVisit(user), !!firstName)}`, { name: firstName });
  const pipeline = jobPipelineCounts(jobs.data);

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
        <View className="px-5 pt-4 pb-6 bg-surface border-b border-stone-100">
          <View className="flex-row items-center justify-between">
            <View className="flex-1">
              <Text className="text-xl font-bold text-stone-900" numberOfLines={2} accessibilityRole="header">
                {user ? greeting : ts('header.userFallback')}
              </Text>
              <Text className="text-stone-500 text-sm mt-0.5">{t('greeting.subtitle')}</Text>
            </View>
            <View className="flex-row items-center gap-2">
              {accountFailed ? (
                <View className="px-3 py-1 rounded-full bg-warning-bg">
                  <Text className="text-xs font-bold text-warning">{ts('header.unavailable')}</Text>
                </View>
              ) : accountLoading || !badge ? (
                <View className="px-3 py-1 rounded-full bg-stone-100">
                  <Text className="text-xs font-bold text-stone-400">…</Text>
                </View>
              ) : (
                <View className={`px-3 py-1 rounded-full ${badge.bgClass}`}>
                  <Text className={`text-xs font-bold ${badge.textClass}`}>
                    {badge.label}
                  </Text>
                </View>
              )}
            </View>
          </View>
        </View>

        {!emailVerified && (
          <View
            className="mx-4 mt-4 rounded-2xl border p-4"
            style={{ borderColor: colors.warning.DEFAULT, backgroundColor: colors.warning.bg }}
          >
            <Text className="font-bold text-stone-900 mb-1">{t('verifyEmail.title')}</Text>
            <Text className="text-stone-600 text-sm leading-5 mb-3">
              {t('verifyEmail.body')}
            </Text>
            <View className="flex-row gap-2">
              <TouchableOpacity
                onPress={() => void resendVerificationEmail()}
                className="flex-1 rounded-xl bg-surface border border-stone-200 py-2.5 items-center"
              >
                <Text className="text-stone-800 font-semibold text-sm">{t('verifyEmail.resend')}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => void confirmVerifiedEmail()}
                className="flex-1 rounded-xl bg-brand-600 py-2.5 items-center"
              >
                <Text className="text-white font-semibold text-sm">{t('verifyEmail.confirm')}</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

        {/* Stats Grid */}
        <View className="px-5 pt-5">
          <PaymentIssueNotice className="mb-3" />
          <AnnouncementBanner className="mb-3" />
          <Text className="text-sm font-semibold text-stone-500 uppercase tracking-wide mb-3">
            {t('stats.title')}
          </Text>
          {usageFailed ? (
            <ErrorState
              message={userError ? loadFailureMessage(userError) : (userSyncError ?? t('loadError'))}
              onRetry={() => {
                void syncUser();
                void refetchUser();
              }}
            />
          ) : usageLoading || !usage ? (
            <View className="flex-row gap-3 mb-6">
              <View className="flex-1 bg-surface rounded-2xl border border-stone-100 p-4 h-28" />
              <View className="flex-1 bg-surface rounded-2xl border border-stone-100 p-4 h-28" />
            </View>
          ) : (
            <>
              <View className="flex-row gap-3 mb-3">
                <StatsCard
                  label={t('stats.cvsCreated')}
                  value={docs ? ratio(docs.cvs.used, docs.cvs.limit) : formatNumber(usage.cvsCreated)}
                  icon="document-text"
                />
                <StatsCard
                  label={t('stats.coverLetters')}
                  value={docs ? ratio(docs.coverLetters.used, docs.coverLetters.limit) : formatNumber(usage.coverLettersCreated)}
                  icon="mail"
                />
              </View>
              <View className="flex-row gap-3 mb-6">
                <StatsCard
                  label={t('stats.downloads')}
                  value={formatNumber(counters?.exportsThisMonth ?? usage.exportsThisMonth)}
                  icon="download"
                  subtitle={t('stats.thisMonth')}
                />
                <StatsCard
                  label={ts('usage.credits')}
                  value={ratio(counters?.aiCreditsUsed ?? usage.aiCreditsUsed, aiLimit)}
                  icon="sparkles"
                  subtitle={t('stats.usedThisMonth')}
                />
              </View>
            </>
          )}
        </View>

        {/* Quick Actions — all brand-600; same geometry as before */}
        <View className="px-5 mb-6">
          <Text className="text-sm font-semibold text-stone-500 uppercase tracking-wide mb-3">
            {t('quickActions.title')}
          </Text>
          <View className="flex-row gap-3">
            <TouchableOpacity
              onPress={() => router.push('/(dashboard)/cvs/new')}
              className="flex-1 bg-brand-600 rounded-2xl p-4 items-center"
            >
              <Ionicons name="add-circle" size={28} color={colors.white} />
              <Text className="text-white font-bold mt-1.5 text-sm">{t('quickActions.newCv')}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => router.push('/(dashboard)/cover-letters/new')}
              className="flex-1 bg-brand-600 rounded-2xl p-4 items-center"
            >
              <Ionicons name="mail" size={28} color={colors.white} />
              <Text className="text-white font-bold mt-1.5 text-sm">{t('quickActions.coverLetter')}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => router.push('/(dashboard)/templates')}
              className="flex-1 bg-brand-600 rounded-2xl p-4 items-center"
            >
              <Ionicons name="layers" size={28} color={colors.white} />
              <Text className="text-white font-bold mt-1.5 text-sm">{t('quickActions.templates')}</Text>
            </TouchableOpacity>
          </View>
          <TouchableOpacity
            onPress={() => router.push('./jobs')}
            className="mt-3 bg-surface rounded-2xl border border-stone-100 p-4 flex-row items-center"
            activeOpacity={0.8}
          >
            <View className="w-10 h-10 rounded-xl bg-brand-50 items-center justify-center me-3">
              <Ionicons name="briefcase-outline" size={20} color={colors.brand[600]} />
            </View>
            <View className="flex-1">
              <Text className="font-bold text-stone-900">{t('quickActions.jobTracker')}</Text>
              <Text className="text-stone-500 text-sm mt-0.5">{t('quickActions.jobTrackerDescription')}</Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={colors.stone[300]} style={RTL_FLIP} />
          </TouchableOpacity>
          {CAREER_ENABLED ? (
            <TouchableOpacity
              onPress={() => router.push('/(dashboard)/career')}
              className="mt-3 bg-surface rounded-2xl border border-stone-100 p-4 flex-row items-center"
              activeOpacity={0.8}
              accessibilityRole="button"
            >
              <View className="w-10 h-10 rounded-xl bg-brand-50 items-center justify-center me-3">
                <Ionicons name="compass-outline" size={20} color={colors.brand[600]} />
              </View>
              <View className="flex-1">
                <Text className="font-bold text-stone-900">{t('quickActions.careerTools')}</Text>
                <Text className="text-stone-500 text-sm mt-0.5">{t('quickActions.careerToolsDescription')}</Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={colors.stone[300]} style={RTL_FLIP} />
            </TouchableOpacity>
          ) : null}
        </View>

        {/* Recent Documents */}
        <View className="px-5 mb-8">
          <View className="flex-row items-center justify-between mb-3">
            <Text className="text-sm font-semibold text-stone-500 uppercase tracking-wide">
              {t('recent.title')}
            </Text>
            <TouchableOpacity onPress={() => router.push('/(dashboard)/cvs')}>
              <Text className="text-brand-600 text-sm font-semibold">{t('recent.viewAll')}</Text>
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

        {/* Job tracker summary (website RecentActivity). */}
        <View className="px-5 mb-8">
          <View className="bg-surface rounded-2xl border border-stone-100 p-4">
            <View className="flex-row items-center mb-3">
              <Ionicons name="briefcase-outline" size={18} color={colors.stone[400]} />
              <Text className="font-bold text-stone-900 ms-2" accessibilityRole="header">{t('jobs.title')}</Text>
            </View>
            {jobs.isPending && !jobs.data ? (
              <View className="h-16 bg-stone-100 rounded-xl" />
            ) : jobs.isError ? (
              <Text className="text-stone-600 text-sm">{t('jobs.error')}</Text>
            ) : pipeline.active === 0 ? (
              <Text className="text-stone-600 text-sm leading-5">{t('jobs.empty')}</Text>
            ) : (
              <View className="flex-row flex-wrap gap-2">
                {HOME_PIPELINE.map((stage) => (
                  <View
                    key={stage}
                    className="bg-stone-50 rounded-xl px-3 py-2"
                    style={{ flexBasis: '47%', flexGrow: 1 }}
                    accessible
                    accessibilityLabel={`${t(`jobs.status.${stage}`)}: ${pipeline.counts[stage]}`}
                  >
                    <Text className="text-stone-500 text-xs" numberOfLines={1}>{t(`jobs.status.${stage}`)}</Text>
                    <Text className="text-stone-900 text-xl font-bold">{formatNumber(pipeline.counts[stage])}</Text>
                  </View>
                ))}
              </View>
            )}
            <TouchableOpacity
              onPress={() => router.push('./jobs')}
              className="mt-3 flex-row items-center min-h-[44px]"
              accessibilityRole="button"
            >
              <Text className="text-brand-600 font-semibold text-sm me-1">{t('jobs.open')}</Text>
              <Ionicons name="arrow-forward" size={16} color={colors.brand[600]} style={RTL_FLIP} />
            </TouchableOpacity>
          </View>
        </View>

        {/* Upgrade banner — Free accounts, only when the app can sell a plan (in-app purchase). */}
        {PAID_UPGRADES_ENABLED && plan === 'free' && canPurchaseInApp(user?.subscription) && (
          <View className="mx-5 mb-8">
            <View className="bg-brand-600 rounded-2xl p-5 overflow-hidden">
              <View className="flex-row items-center justify-between">
                <View className="flex-1">
                  <Text className="text-white font-bold text-lg">{t('upgradePlans.title')}</Text>
                  <Text className="text-orange-100 text-sm mt-1">{tPlans('planIncludes', { plan: planName('starter') })}</Text>
                  {planBenefits('starter').slice(0, 4).map((benefit) => (
                    <Text key={benefit} className="text-white text-sm mt-0.5">{'\u2022 '}{benefit}</Text>
                  ))}
                </View>
                <Ionicons name="sparkles" size={36} color="rgba(255,255,255,0.6)" />
              </View>
              <TouchableOpacity
                onPress={() => router.push('/(dashboard)/settings/plans')}
                className="bg-surface mt-4 rounded-xl min-h-[44px] items-center justify-center"
                accessibilityRole="button"
              >
                <Text className="text-brand-600 font-bold">{t('upgradePlans.cta')}</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
