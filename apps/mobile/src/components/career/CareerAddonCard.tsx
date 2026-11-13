import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React from 'react';
import { Text, TouchableOpacity, View } from 'react-native';
import { CAREER_ENABLED } from '../../config/career';
import { useCareerAccess, useCareerSubscription } from '../../hooks/useCareer';
import { careerAccessState, describeAccess } from '../../lib/career-view';
import { useT } from '../../i18n';
import { RTL_FLIP } from '../../i18n/native';
import { colors } from '../../theme/colors';
import { Pill } from './CareerHeader';

/**
 * Billing screen: the career add-on's status, provider independent. It never
 * offers a purchase, shows a price or links to buy elsewhere; it does not
 * touch the V1 plan above it. It links to the career plans comparison
 * (career/plans: what each plan includes, information only).
 */
export function CareerAddonCard() {
  const router = useRouter();
  const t = useT('career');
  const th = useT('careerHub.overview');
  const access = useCareerAccess();
  const subscription = useCareerSubscription();
  if (!CAREER_ENABLED) return null;
  const state = careerAccessState({
    enabled: true,
    loading: access.isLoading,
    error: access.error,
    access: access.data,
    subscription: subscription.data,
  });
  const copy = describeAccess(state);
  return (
    <View className="mx-5 mb-6">
      <Text className="text-sm font-semibold text-stone-500 uppercase tracking-wide mb-3">{t('addon.heading')}</Text>
      <TouchableOpacity
        onPress={() => router.push('/(dashboard)/career')}
        className="bg-white rounded-2xl border border-stone-100 p-4 flex-row items-center"
        accessibilityRole="button"
        activeOpacity={0.8}
      >
        <View className="flex-1 me-2">
          <View className="flex-row items-center justify-between">
            <Text className="font-bold text-stone-900 flex-1 me-2">{copy.title}</Text>
            {copy.badge ? <Pill label={copy.badge} tone={copy.badgeKind === 'active' ? 'success' : 'warning'} /> : null}
          </View>
          {copy.body ? <Text className="text-stone-500 text-sm mt-1 leading-5">{copy.body}</Text> : null}
          <Text className="text-stone-400 text-xs mt-2">{t('addon.note')}</Text>
        </View>
        <Ionicons name="chevron-forward" size={18} color={colors.stone[300]} style={RTL_FLIP} />
      </TouchableOpacity>
      {/* What each career plan includes: information only, no price unless switched on, never a way to buy. */}
      <TouchableOpacity
        onPress={() => router.push('/(dashboard)/career/plans')}
        className="bg-white rounded-2xl border border-stone-100 p-4 mt-3 flex-row items-center min-h-[48px]"
        accessibilityRole="link"
        activeOpacity={0.8}
      >
        <View className="flex-1 me-2">
          <Text className="font-semibold text-stone-900">{th('plansLink')}</Text>
          <Text className="text-stone-500 text-sm mt-0.5">{th('plansLinkBody')}</Text>
        </View>
        <Ionicons name="chevron-forward" size={18} color={colors.stone[300]} style={RTL_FLIP} />
      </TouchableOpacity>
    </View>
  );
}
