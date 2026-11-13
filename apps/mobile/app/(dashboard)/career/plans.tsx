import { Ionicons } from '@expo/vector-icons';
import React, { useState } from 'react';
import { RefreshControl, ScrollView, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { PlanId } from '../../../../../packages/career-shared/src/catalog';
import { CareerHeader, Pill } from '../../../src/components/career/CareerHeader';
import { SHOW_CAREER_PRICES } from '../../../src/config/career';
import { useCareerAccess, useCareerSubscription } from '../../../src/hooks/useCareer';
import {
  CAREER_PLAN_IDS,
  careerPlanName,
  currentCareerPlan,
  PLAN_ROWS,
  planPrices,
  RECOMMENDED_CAREER_PLAN,
  rowLabel,
  rowValue,
} from '../../../src/lib/career/plans';
import { useT } from '../../../src/i18n';
import { colors } from '../../../src/theme/colors';

/**
 * Career plans comparison: the five catalog plans and what each includes
 * (the website's pricing comparison rows), with the account's current career
 * plan highlighted and shown first.
 *
 * Information only. There is deliberately no purchase button, no "upgrade"
 * call to action and no link to buy on the website (Apple App Review 3.1.1 /
 * 3.1.3, Google Play Payments policy): career plans are sold outside the app.
 * Prices are hidden unless EXPO_PUBLIC_SHOW_CAREER_PRICES=true (see
 * SHOW_CAREER_PRICES in src/config/career.ts for why the default is off), and
 * even then they are plain text with the exact catalog amounts.
 */
export default function CareerPlansScreen() {
  const t = useT('careerHub.plans');
  const access = useCareerAccess();
  const subscription = useCareerSubscription();
  const current = currentCareerPlan(access.data);
  const [picked, setPicked] = useState<PlanId | null>(null);
  const shown: PlanId = picked ?? current ?? RECOMMENDED_CAREER_PLAN;
  const source =
    subscription.data?.source === 'local_fixture'
      ? t('fixture')
      : access.data?.source === 'purchase'
        ? t('source.purchase')
        : t('source.v1PlanMap');
  const prices = SHOW_CAREER_PRICES ? planPrices(shown) : null;
  const mine = shown === current;

  const refresh = () => {
    void access.refetch();
    void subscription.refetch();
  };

  return (
    <SafeAreaView className="flex-1 bg-stone-50" edges={['top', 'bottom']}>
      <CareerHeader title={t('title')} />
      <ScrollView
        contentContainerStyle={{ padding: 20, paddingBottom: 40 }}
        refreshControl={<RefreshControl refreshing={access.isRefetching} onRefresh={refresh} tintColor={colors.brand[600]} />}
      >
        <Text className="text-stone-600 text-sm leading-5">{t('intro')}</Text>
        <Text className="text-stone-500 text-sm leading-5 mt-2">{t('creditsNote')}</Text>
        {access.data ? (
          <Text className="text-stone-900 text-sm font-semibold mt-3">
            {current ? t('currentPlan', { plan: careerPlanName(current), source }) : t('currentNone')}
          </Text>
        ) : null}
        <View className="bg-stone-100 rounded-xl p-3 mt-3">
          <Text className="text-stone-600 text-xs leading-4">{t('infoOnly')}</Text>
        </View>

        <View className="flex-row flex-wrap gap-2 mt-4" accessibilityRole="tablist">
          {CAREER_PLAN_IDS.map((plan) => {
            const selected = plan === shown;
            const isMine = plan === current;
            return (
              <TouchableOpacity
                key={plan}
                onPress={() => setPicked(plan)}
                className={`flex-row items-center rounded-full px-4 min-h-[44px] border ${
                  selected ? 'bg-brand-600 border-brand-600' : isMine ? 'bg-brand-50 border-brand-500' : 'bg-white border-stone-200'
                }`}
                accessibilityRole="tab"
                accessibilityState={{ selected }}
                accessibilityLabel={isMine ? `${careerPlanName(plan)}, ${t('yourPlan')}` : careerPlanName(plan)}
              >
                {isMine ? (
                  <Ionicons name="checkmark-circle" size={16} color={selected ? '#ffffff' : colors.brand[600]} style={{ marginEnd: 4 }} />
                ) : null}
                <Text className={`text-sm font-semibold ${selected ? 'text-white' : 'text-stone-800'}`}>{careerPlanName(plan)}</Text>
              </TouchableOpacity>
            );
          })}
        </View>

        <View className={`bg-white rounded-2xl p-5 mt-4 ${mine ? 'border-2 border-brand-500' : 'border border-stone-100'}`}>
          <View className="flex-row items-center flex-wrap gap-2">
            <Text className="text-lg font-black text-stone-900 me-1" accessibilityRole="header">
              {careerPlanName(shown)}
            </Text>
            {mine ? <Pill label={t('yourPlan')} tone="brand" /> : null}
            {shown === RECOMMENDED_CAREER_PLAN ? <Pill label={t('recommended')} tone="default" /> : null}
          </View>
          {prices ? <Text className="text-stone-700 text-sm mt-1">{t('price', { monthly: prices.monthly, annual: prices.annual })}</Text> : null}
          <View className="mt-3">
            {PLAN_ROWS.map((row) => {
              const value = rowValue(shown, row);
              return (
                <View key={row} className="flex-row items-start py-2 border-b border-stone-100" accessible accessibilityLabel={`${rowLabel(row)}: ${value.text}`}>
                  <Ionicons
                    name={value.included ? 'checkmark-circle' : 'remove-circle-outline'}
                    size={16}
                    color={value.included ? colors.brand[600] : colors.stone[300]}
                    style={{ marginEnd: 8, marginTop: 2 }}
                  />
                  <Text className="flex-1 text-stone-700 text-sm leading-5 me-2">{rowLabel(row)}</Text>
                  <Text className={`text-sm leading-5 font-semibold shrink ${value.included ? 'text-stone-900' : 'text-stone-400'}`} style={{ maxWidth: '50%' }}>
                    {value.text}
                  </Text>
                </View>
              );
            })}
          </View>
          {shown === 'business' ? <Text className="text-stone-500 text-xs mt-3 leading-4">{t('pooledNote')}</Text> : null}
        </View>

        {SHOW_CAREER_PRICES ? (
          <Text className="text-stone-500 text-xs mt-4 leading-4">{[t('currency'), t('taxes'), t('annualNote')].join(' ')}</Text>
        ) : null}
        <Text className="text-stone-500 text-xs mt-3 leading-4">{t('renewalNote')}</Text>
      </ScrollView>
    </SafeAreaView>
  );
}
