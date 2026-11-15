import { Ionicons } from '@expo/vector-icons';
import { useRouter, type Href } from 'expo-router';
import React from 'react';
import { ScrollView, Text, View } from 'react-native';
import { useCareerAccess } from '../../hooks/useCareer';
import { useT } from '../../i18n';
import { careerErrorMessage } from '../../lib/career-view';
import { linkState, type CareerHref, type CareerLinkState } from '../../lib/career/nav';
import { colors } from '../../theme/colors';
import { Button } from '../ui/Button';
import { ErrorState } from '../ui/ErrorState';
import { SkeletonCard } from '../ui/Skeleton';

export type FeatureGateState = 'loading' | 'error' | 'locked' | CareerLinkState;

/**
 * The state of one career area for the signed-in account (website CareerNav
 * `linkState`): available, coming soon (switched off or not open yet), or not
 * in the caller's plan. `locked` means career tools are not active at all.
 */
export function useFeatureState(href: CareerHref, options: { ignorePlan?: boolean } = {}) {
  const access = useCareerAccess();
  let state: FeatureGateState;
  if (access.isLoading) state = 'loading';
  else if (access.error || !access.data) state = 'error';
  else if (!access.data.enabled) state = 'locked';
  else {
    state = linkState(href, access.data);
    if (state === 'plan' && options.ignorePlan) state = 'available';
  }
  return { state, access };
}

/**
 * Renders `children` only when the area is available; otherwise an honest
 * screen body: loading, a retry, "career tools not active", "coming soon"
 * (nothing is sold or charged) or "not in your plan" with a link to the
 * information-only plans comparison (never a purchase).
 *
 *   <FeatureState href="/career/learning">{…screen body…}</FeatureState>
 *
 * `ignorePlan`: for areas people outside the plan still use (Business staff
 * and invited candidates). `soonBody`: area-specific "coming soon" copy.
 */
export function FeatureState({
  href,
  children,
  ignorePlan,
  soonTitle,
  soonBody,
}: {
  href: CareerHref;
  children: React.ReactNode;
  ignorePlan?: boolean;
  soonTitle?: string;
  soonBody?: string;
}) {
  const { state, access } = useFeatureState(href, { ignorePlan });
  const t = useT('careerBusiness');
  if (state === 'available') return <>{children}</>;
  if (state === 'loading') {
    return (
      <View className="p-5" accessibilityLabel={t('scope.loading')}>
        <SkeletonCard />
      </View>
    );
  }
  if (state === 'error') {
    return <ErrorState message={careerErrorMessage(access.error, t('scope.unavailableBody'))} onRetry={() => void access.refetch()} />;
  }
  if (state === 'locked') return <StateCard icon="lock-closed-outline" title={t('mobile.lockedTitle')} body={t('mobile.lockedBody')} />;
  if (state === 'soon') {
    return <StateCard icon="time-outline" badge={t('scope.comingSoon')} title={soonTitle ?? t('scope.offTitle')} body={soonBody ?? t('mobile.soonBody')} />;
  }
  return <PlanCard />;
}

/** "Not in your plan": information only, with the plans comparison (no price, no purchase). */
export function PlanCard({ title, body, children }: { title?: string; body?: string; children?: React.ReactNode }) {
  const t = useT('careerBusiness');
  const router = useRouter();
  return (
    <StateCard icon="layers-outline" badge={t('nav.statePlan')} title={title ?? t('mobile.planTitle')} body={body ?? t('mobile.planBody')}>
      <View className="mt-4 self-start">
        <Button variant="outline" size="sm" onPress={() => router.push('/(dashboard)/career/plans' as Href)} accessibilityRole="link">
          {t('mobile.comparePlans')}
        </Button>
      </View>
      {children}
    </StateCard>
  );
}

/** A plain explanation card: icon, optional badge, title, body. */
export function StateCard({
  icon,
  badge,
  title,
  body,
  children,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  badge?: string;
  title: string;
  body: string;
  children?: React.ReactNode;
}) {
  return (
    <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 40 }}>
      <View className="bg-white rounded-2xl border border-stone-100 p-5" accessible={!children} accessibilityLabel={!children ? [badge, title, body].filter(Boolean).join('. ') : undefined}>
        <View className="flex-row items-center flex-wrap gap-2">
          <Ionicons name={icon} size={20} color={colors.stone[500]} />
          {badge ? (
            <View className="bg-stone-100 rounded-full px-2.5 py-0.5">
              <Text className="text-stone-600 text-[11px] font-bold">{badge}</Text>
            </View>
          ) : null}
        </View>
        <Text className="text-lg font-black text-stone-900 mt-3" accessibilityRole="header">
          {title}
        </Text>
        <Text className="text-stone-600 text-sm mt-2 leading-5">{body}</Text>
        {children}
      </View>
    </ScrollView>
  );
}
