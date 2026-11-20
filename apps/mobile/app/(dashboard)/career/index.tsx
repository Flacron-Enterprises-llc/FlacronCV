import { Ionicons } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import { useRouter, type Href } from 'expo-router';
import React from 'react';
import { RefreshControl, ScrollView, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Button } from '../../../src/components/ui/Button';
import { CareerHeader, Pill } from '../../../src/components/career/CareerHeader';
import { CAREER_ENABLED } from '../../../src/config/career';
import {
  useCareerAccess,
  useCareerFacts,
  useCareerResumes,
  useCareerSubscription,
  useCareerUsage,
  useUid,
} from '../../../src/hooks/useCareer';
import { useSavedOpportunities } from '../../../src/hooks/career/opportunities';
import { api } from '../../../src/lib/api';
import { APPLICATION_STATUSES } from '../../../../../packages/career-shared/src/applications';
import { careerApi } from '../../../src/lib/career-api';
import { actionLabel, actionRoute, careerOverview, unitLabel, type CareerOverview } from '../../../src/lib/career/overview';
import { utcDateOnly } from '../../../../../packages/career-shared/src/dashboard';
import type { JobApplication } from '../../../src/types/job.types';
import {
  careerAccessState,
  describeAccess,
  documentCredits,
  FACT_TYPE_LABEL,
  formatDay,
  visibleAreas,
  WHERE_LABEL,
  type CareerArea,
} from '../../../src/lib/career-view';
import { formatNumber, useT } from '../../../src/i18n';
import { RTL_FLIP } from '../../../src/i18n/native';
import { colors } from '../../../src/theme/colors';

/**
 * Career tools overview: entitlement, career credits, the website dashboard's
 * summary (recent draft, confirmed facts and missing sections, saved
 * opportunities and the next deadline from the Job Tracker, interviews left,
 * usage per unit) with its single suggested next action, and what is available
 * in the app. The summary logic is career-shared's (src/lib/career/overview.ts).
 * No prices or purchase links (store rules; see career-view.ts); the plans
 * comparison it links to is information only.
 */
export default function CareerOverviewScreen() {
  const router = useRouter();
  const t = useT('career');
  const tc = useT('common');
  const access = useCareerAccess();
  const subscription = useCareerSubscription();
  const usage = useCareerUsage();
  const uid = useUid();

  const state = careerAccessState({
    enabled: CAREER_ENABLED,
    loading: access.isLoading,
    error: access.error,
    access: access.data,
    // The V1 subscription read is informative; its failure must not hide access.
    subscription: subscription.data,
  });
  const copy = describeAccess(state);
  const active = state.kind === 'active';
  const credits = active ? documentCredits(usage.data, state.plan) : null;
  const renewal = formatDay(usage.data?.renewalDate ?? null);
  const features = access.data?.features;
  const facts = useCareerFacts();
  const resumes = useCareerResumes();
  // Same key and request as the alerts screen; only read when that area is switched on.
  const alertsOn = active && features?.alertItems === true;
  const alerts = useQuery({ queryKey: ['career', uid, 'alerts'], queryFn: () => careerApi.alerts(), enabled: alertsOn, retry: false });
  // V1's Job Tracker is the only application tracker (same as the website's overview); same key as the Jobs tab.
  const jobs = useQuery({ queryKey: ['jobs'], queryFn: () => api.get<JobApplication[]>('/jobs'), enabled: active, staleTime: 30_000 });
  // Saved listings are optional on the overview: a failure leaves the rest usable (website rule).
  const savedListings = useSavedOpportunities(active);
  const overview: CareerOverview | null =
    active && facts.data
      ? careerOverview({
          facts: facts.data.items,
          jobs: jobs.data ?? [],
          alertCount: alertsOn ? (alerts.data?.items.length ?? 0) : 0,
          usage: usage.data ?? null,
          resumes: resumes.data?.items ?? [],
          today: utcDateOnly(new Date()),
          savedListings: savedListings.data ?? [],
          alerts: alertsOn ? (alerts.data?.items ?? []) : [],
        })
      : null;
  const partialError = active && Boolean(facts.error || resumes.error || jobs.error || usage.error);
  const refreshing = access.isRefetching || usage.isRefetching || facts.isRefetching || jobs.isRefetching;

  const refresh = () => {
    void access.refetch();
    void subscription.refetch();
    if (active) {
      void usage.refetch();
      void facts.refetch();
      void resumes.refetch();
      void jobs.refetch();
      void savedListings.refetch();
      if (alertsOn) void alerts.refetch();
    }
  };

  return (
    <SafeAreaView className="flex-1 bg-stone-50" edges={['top', 'bottom']}>
      <CareerHeader title={t('overview.title')} subtitle={t('overview.subtitle')} />
      <ScrollView
        contentContainerStyle={{ padding: 20, paddingBottom: 40 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={colors.brand[600]} />}
      >
        <View className="bg-surface rounded-2xl border border-stone-100 p-5" accessible accessibilityLabel={`${copy.title}. ${copy.body}`}>
          <View className="flex-row items-center justify-between">
            <Text className="text-lg font-black text-stone-900 flex-1 me-2">{copy.title}</Text>
            {copy.badge ? <Pill label={copy.badge} tone={copy.badgeKind === 'test' ? 'warning' : copy.badgeKind === 'ending' ? 'warning' : 'success'} /> : null}
          </View>
          {copy.body ? <Text className="text-stone-600 text-sm mt-2 leading-5">{copy.body}</Text> : null}
          {state.kind === 'offline' || state.kind === 'unavailable' ? (
            <View className="mt-4 self-start">
              <Button variant="outline" size="sm" onPress={refresh}>
                {tc('retry')}
              </Button>
            </View>
          ) : null}
        </View>

        {active ? (
          <View className="bg-surface rounded-2xl border border-stone-100 p-5 mt-4">
            <Text className="text-sm font-semibold text-stone-500 uppercase tracking-wide">{t('overview.credits')}</Text>
            {credits ? (
              <>
                <Text className="text-3xl font-black text-stone-900 mt-2">
                  {credits.remaining}
                  <Text className="text-base font-semibold text-stone-500">{` ${t('overview.creditsLeft', { granted: credits.granted })}`}</Text>
                </Text>
                {credits.packs > 0 ? <Text className="text-stone-500 text-sm mt-1">{t('overview.packs', { count: credits.packs })}</Text> : null}
                {renewal ? <Text className="text-stone-500 text-sm mt-1">{t('overview.renews', { date: renewal })}</Text> : null}
              </>
            ) : (
              <Text className="text-stone-500 text-sm mt-2">{usage.isError ? t('overview.creditsError') : tc('loading')}</Text>
            )}
            <Text className="text-stone-500 text-xs mt-3 leading-4">
              {t('overview.creditsNote')}
            </Text>
          </View>
        ) : null}

        {active ? (
          <OverviewSummary
            overview={overview}
            loading={facts.isLoading}
            partialError={partialError}
            onOpen={(route) => router.push(route as Href)}
          />
        ) : null}

        {CAREER_ENABLED ? <PlansLink onOpen={() => router.push('/(dashboard)/career/plans' as Href)} /> : null}

        <Text className="text-sm font-semibold text-stone-500 uppercase tracking-wide mt-6 mb-3">{t('overview.whatYouCanDo')}</Text>
        {visibleAreas(access.data?.features).map((area) => (
          <AreaRow key={area.key} area={area} enabled={active || area.key === 'tracker'} onOpen={(route) => router.push(route as Href)} />
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}

function AreaRow({ area, enabled, onOpen }: { area: CareerArea; enabled: boolean; onOpen: (route: string) => void }) {
  const inApp = area.where === 'app' && area.route;
  const content = (
    <>
      <View className="flex-1 me-2">
        <Text className={`font-bold ${inApp && enabled ? 'text-stone-900' : 'text-stone-700'}`}>{area.title}</Text>
        <Text className="text-stone-500 text-sm mt-0.5 leading-5">{area.body}</Text>
        {area.where !== 'app' ? (
          <View className="mt-2">
            <Pill label={WHERE_LABEL[area.where].toUpperCase()} tone={area.where === 'web' ? 'default' : 'warning'} />
          </View>
        ) : null}
      </View>
      {inApp && enabled ? <Ionicons name="chevron-forward" size={18} color={colors.stone[300]} style={RTL_FLIP} /> : null}
    </>
  );
  if (inApp && enabled) {
    return (
      <TouchableOpacity
        onPress={() => onOpen(area.route as string)}
        className="bg-surface rounded-2xl border border-stone-100 p-4 mb-3 flex-row items-center min-h-[56px]"
        accessibilityRole="button"
        activeOpacity={0.8}
      >
        {content}
      </TouchableOpacity>
    );
  }
  // Not a control: plain information, styled flatter so it does not look tappable.
  return <View className="bg-stone-100/60 rounded-2xl p-4 mb-3 flex-row items-center">{content}</View>;
}

/** A date-only deadline (YYYY-MM-DD) shown as a day in the current language. */
function day(dateOnly: string | null): string | null {
  return dateOnly ? formatDay(`${dateOnly}T00:00:00Z`) : null;
}

function OverviewSummary({
  overview,
  loading,
  partialError,
  onOpen,
}: {
  overview: CareerOverview | null;
  loading: boolean;
  partialError: boolean;
  onOpen: (route: string) => void;
}) {
  const t = useT('careerHub.overview');
  const th = useT('careerHome');
  const tc = useT('common');
  if (!overview) {
    return (
      <View className="bg-surface rounded-2xl border border-stone-100 p-5 mt-4">
        <Text className="text-stone-500 text-sm">{loading ? tc('loading') : t('loadError')}</Text>
      </View>
    );
  }
  const { action, counts, deadline, recent } = overview;
  const label = actionLabel(action, day(action.deadline));
  const deadlineDay = day(deadline?.deadline ?? null);
  const created = recent ? formatDay(recent.createdAt) : null;
  const missing = counts.missingCore.map((type) => FACT_TYPE_LABEL[type] ?? type).join(', ');
  return (
    <>
      <TouchableOpacity
        onPress={() => onOpen(actionRoute(action))}
        className="bg-brand-600 rounded-2xl p-5 mt-4 flex-row items-center"
        accessibilityRole="button"
        accessibilityLabel={t('nextA11y', { action: label })}
        accessibilityHint={t('nextBody')}
        activeOpacity={0.85}
      >
        <View className="flex-1 me-3">
          <Text className="text-orange-100 text-xs font-semibold uppercase tracking-wide">{t('nextTitle')}</Text>
          <Text className="text-white text-lg font-black mt-1">{label}</Text>
          <Text className="text-orange-100 text-xs mt-1 leading-4">{t('nextBody')}</Text>
        </View>
        <Ionicons name="arrow-forward" size={22} color="#ffffff" style={RTL_FLIP} />
      </TouchableOpacity>

      {partialError ? (
        <View className="bg-warning-bg rounded-xl p-3 mt-3" accessibilityLiveRegion="polite">
          <Text className="text-warning text-sm">{t('loadError')}</Text>
        </View>
      ) : null}

      <Text className="text-sm font-semibold text-stone-500 uppercase tracking-wide mt-6 mb-3">{t('summaryHeading')}</Text>

      {recent ? (
        <TouchableOpacity
          onPress={() => onOpen(`/(dashboard)/career/documents/resume/${recent.id}`)}
          className="bg-surface rounded-2xl border border-stone-100 p-4 mb-3 flex-row items-center min-h-[56px]"
          accessibilityRole="button"
          accessibilityLabel={t('openDraftA11y', { title: recent.title })}
          activeOpacity={0.8}
        >
          <View className="flex-1 me-2">
            <Text className="text-xs font-semibold text-stone-500 uppercase tracking-wide">{t('recentDraft')}</Text>
            <Text className="font-bold text-stone-900 mt-1" numberOfLines={2}>
              {recent.title}
            </Text>
            {created ? <Text className="text-stone-500 text-xs mt-0.5">{t('recentDraftMeta', { date: created })}</Text> : null}
          </View>
          <Ionicons name="chevron-forward" size={18} color={colors.stone[300]} style={RTL_FLIP} />
        </TouchableOpacity>
      ) : null}

      <SummaryCard title={t('profileTitle')}>
        <Text className="text-stone-900 text-sm">{t('confirmedCount', { count: counts.confirmed })}</Text>
        {counts.missingCore.length > 0 ? <Text className="text-stone-500 text-sm mt-1">{t('missingCore', { sections: missing })}</Text> : null}
      </SummaryCard>

      <SummaryCard title={t('savedTitle')}>
        <Text className="text-stone-900 text-sm">{t('savedCount', { count: overview.saved })}</Text>
        <Text className="text-stone-500 text-sm mt-1">
          {deadline && deadlineDay ? t('nextDeadline', { title: deadline.title, date: deadlineDay }) : t('noDeadline')}
        </Text>
        {overview.followUp ? (
          <Text className="text-stone-500 text-sm mt-1">{th('next_follow_up', { title: overview.followUp.title, date: day(overview.followUp.date) ?? overview.followUp.date })}</Text>
        ) : null}
      </SummaryCard>

      <SummaryCard title={th('relevant_title')}>
        {overview.relevant.length === 0 ? <Text className="text-stone-500 text-sm">{th('relevant_empty')}</Text> : null}
        {overview.relevant.map((entry) => (
          <TouchableOpacity
            key={entry.id}
            onPress={() => onOpen(`/(dashboard)/career/opportunities/${entry.id}`)}
            className="min-h-[44px] justify-center py-1"
            accessibilityRole="link"
          >
            <Text className="text-brand-700 font-semibold text-sm">{entry.title}</Text>
            <Text className="text-stone-500 text-xs mt-0.5">
              {[entry.source === 'saved' ? th('relevant_saved') : th('relevant_alert'), entry.deadline ? th('relevant_deadline', { date: day(entry.deadline.slice(0, 10)) ?? entry.deadline }) : null]
                .filter(Boolean)
                .join(' · ')}
            </Text>
          </TouchableOpacity>
        ))}
        <Text className="text-stone-900 text-sm font-semibold mt-3">{th('deadlines_title')}</Text>
        {overview.deadlines.length === 0 ? <Text className="text-stone-500 text-sm mt-1">{th('no_deadline')}</Text> : null}
        {overview.deadlines.map((entry) => (
          <TouchableOpacity
            key={entry.key}
            onPress={() => onOpen(entry.kind === 'listing' ? `/(dashboard)/career/opportunities/${entry.id}` : `/(dashboard)/jobs/${entry.id}`)}
            className="min-h-[44px] justify-center py-1"
            accessibilityRole="link"
          >
            <Text className="text-stone-900 text-sm">{th('next_deadline', { title: entry.title, date: day(entry.date) ?? entry.date })}</Text>
            <Text className="text-stone-500 text-xs mt-0.5">{entry.kind === 'listing' ? th('deadline_kind_listing') : th('deadline_kind_application')}</Text>
          </TouchableOpacity>
        ))}
        <View className="flex-row flex-wrap mt-1">
          <TouchableOpacity onPress={() => onOpen('/(dashboard)/career/alerts')} className="min-h-[44px] justify-center me-4" accessibilityRole="link">
            <Text className="text-brand-600 font-semibold text-sm">{th('open_alerts')}</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => onOpen('/(dashboard)/career/reminders')} className="min-h-[44px] justify-center" accessibilityRole="link">
            <Text className="text-brand-600 font-semibold text-sm">{th('open_reminders')}</Text>
          </TouchableOpacity>
        </View>
      </SummaryCard>

      <SummaryCard title={th('stages_title')}>
        <View className="flex-row flex-wrap">
          {APPLICATION_STATUSES.map((status) => (
            <View key={status} className="bg-stone-100 rounded-full px-3 py-1 me-2 mb-2">
              <Text className="text-stone-700 text-xs">{`${th(`status_${status}`)}: ${overview.stages[status]}`}</Text>
            </View>
          ))}
        </View>
      </SummaryCard>

      <SummaryCard title={t('interviewTitle')}>
        <Text className="text-stone-900 text-sm">{t('interviewRemaining', { count: overview.interviewsLeft })}</Text>
        <TouchableOpacity
          onPress={() =>
            onOpen(overview.practiceOpportunityId ? `/(dashboard)/career/interviews?opportunityId=${encodeURIComponent(overview.practiceOpportunityId)}` : '/(dashboard)/career/interviews')
          }
          className="min-h-[44px] justify-center"
          accessibilityRole="link"
        >
          <Text className="text-brand-600 font-semibold text-sm">{th('practice')}</Text>
        </TouchableOpacity>
      </SummaryCard>

      <CoachCard left={overview.coachingLeft} onOpen={onOpen} />

      {overview.units.length > 0 ? (
        <SummaryCard title={t('usageTitle')}>
          {overview.units.map((unit) => (
            <View key={unit.unit} className="flex-row items-center justify-between py-1">
              <Text className="text-stone-700 text-sm flex-1 me-2">{unitLabel(unit.unit)}</Text>
              <Text className={`text-sm font-semibold ${unit.remaining === 0 ? 'text-stone-400' : 'text-stone-900'}`}>
                {unit.remaining === 0 ? t('noneLeft') : formatNumber(unit.remaining)}
              </Text>
            </View>
          ))}
        </SummaryCard>
      ) : null}
    </>
  );
}

/** The career coach entry: replies left and a link to the conversations. */
function CoachCard({ left, onOpen }: { left: number; onOpen: (route: string) => void }) {
  const t = useT('careerCoach');
  return (
    <SummaryCard title={t('title')}>
      <Text className="text-stone-900 text-sm">{t('homeLeft', { count: left })}</Text>
      <TouchableOpacity onPress={() => onOpen('/(dashboard)/career/coach')} className="min-h-[44px] justify-center" accessibilityRole="link">
        <Text className="text-brand-600 font-semibold text-sm">{t('homeOpen')}</Text>
      </TouchableOpacity>
    </SummaryCard>
  );
}

function SummaryCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View className="bg-surface rounded-2xl border border-stone-100 p-4 mb-3">
      <Text className="font-bold text-stone-900 mb-1.5" accessibilityRole="header">
        {title}
      </Text>
      {children}
    </View>
  );
}

/** Information only: what each career plan includes. Never a purchase or upgrade action. */
function PlansLink({ onOpen }: { onOpen: () => void }) {
  const t = useT('careerHub.overview');
  return (
    <TouchableOpacity
      onPress={onOpen}
      className="bg-surface rounded-2xl border border-stone-100 p-4 mt-3 flex-row items-center min-h-[56px]"
      accessibilityRole="link"
      activeOpacity={0.8}
    >
      <View className="flex-1 me-2">
        <Text className="font-bold text-stone-900">{t('plansLink')}</Text>
        <Text className="text-stone-500 text-sm mt-0.5">{t('plansLinkBody')}</Text>
      </View>
      <Ionicons name="chevron-forward" size={18} color={colors.stone[300]} style={RTL_FLIP} />
    </TouchableOpacity>
  );
}
