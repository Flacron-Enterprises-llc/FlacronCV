import { Ionicons } from '@expo/vector-icons';
import { useRouter, type Href } from 'expo-router';
import React from 'react';
import { RefreshControl, ScrollView, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Button } from '../../../src/components/ui/Button';
import { CareerHeader, Pill } from '../../../src/components/career/CareerHeader';
import { CAREER_ENABLED } from '../../../src/config/career';
import { useCareerAccess, useCareerSubscription, useCareerUsage } from '../../../src/hooks/useCareer';
import {
  careerAccessState,
  describeAccess,
  documentCredits,
  formatDay,
  visibleAreas,
  WHERE_LABEL,
  type CareerArea,
} from '../../../src/lib/career-view';
import { useT } from '../../../src/i18n';
import { RTL_FLIP } from '../../../src/i18n/native';
import { colors } from '../../../src/theme/colors';

/**
 * Career tools overview: entitlement, career credits and what is available in
 * the app. No prices or purchase links (store rules; see career-view.ts).
 */
export default function CareerOverviewScreen() {
  const router = useRouter();
  const t = useT('career');
  const tc = useT('common');
  const access = useCareerAccess();
  const subscription = useCareerSubscription();
  const usage = useCareerUsage();

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
  const refreshing = access.isRefetching || usage.isRefetching;

  const refresh = () => {
    void access.refetch();
    void subscription.refetch();
    if (active) void usage.refetch();
  };

  return (
    <SafeAreaView className="flex-1 bg-stone-50" edges={['top', 'bottom']}>
      <CareerHeader title={t('overview.title')} subtitle={t('overview.subtitle')} />
      <ScrollView
        contentContainerStyle={{ padding: 20, paddingBottom: 40 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={colors.brand[600]} />}
      >
        <View className="bg-white rounded-2xl border border-stone-100 p-5" accessible accessibilityLabel={`${copy.title}. ${copy.body}`}>
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
          <View className="bg-white rounded-2xl border border-stone-100 p-5 mt-4">
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
        className="bg-white rounded-2xl border border-stone-100 p-4 mb-3 flex-row items-center min-h-[56px]"
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
