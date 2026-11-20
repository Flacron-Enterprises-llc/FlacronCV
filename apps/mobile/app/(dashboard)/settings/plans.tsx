import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React, { useState } from 'react';
import { Alert, Platform, RefreshControl, ScrollView, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  IntervalToggle,
  PlanCard,
  PlanComparisonList,
  PlanDefinitions,
  PlanTermsNote,
  type PlanCardAction,
} from '../../../src/components/subscription/PlanCatalog';
import { CAREER_ENABLED } from '../../../src/config/career';
import { PAID_UPGRADES_ENABLED } from '../../../src/config/paid-upgrades';
import { useCurrentUser } from '../../../src/hooks/useUser';
import { requestFailureMessage } from '../../../src/lib/api-errors';
import { billingOwner, billingStore, canPurchaseInApp } from '../../../src/lib/billing';
import { planForDisplay } from '../../../src/lib/entitlements';
import { PRICING_PLANS, equivalentPlan, isLegacyPlan, isPricingPlan, planName, type BillingInterval, type PlanId } from '../../../src/lib/plan-catalog';
import { useAuthStore } from '../../../src/store/auth-store';
import { colors } from '../../../src/theme/colors';
import { useT } from '../../../src/i18n';
import { RTL_FLIP } from '../../../src/i18n/native';

function NativeStorePaywall(props: React.ComponentProps<typeof import('../../../src/components/subscription/StorePaywall').StorePaywall>) {
  // Lazy so builds without in-app purchase (and Expo Go) never evaluate expo-iap.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { StorePaywall } = require('../../../src/components/subscription/StorePaywall') as typeof import('../../../src/components/subscription/StorePaywall');
  return <StorePaywall {...props} />;
}

async function openNativeStoreSubscriptions() {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { openStoreSubscriptionManagement } = require('../../../src/components/subscription/StorePaywall') as typeof import('../../../src/components/subscription/StorePaywall');
  await openStoreSubscriptionManagement();
}

/**
 * The five plans (Free, Starter, Professional — recommended, Career Pro,
 * Business), monthly or annual, as the website's pricing page shows them:
 * cards, a compact comparison and what each unit means, all from the shared
 * catalog. Starter, Professional and Career Pro are bought through the App
 * Store / Google Play when this build carries their product ids; otherwise the
 * card says "Coming soon". Business is Contact Sales only (an in-app support
 * request). Nothing here links to a purchase on the website.
 *
 * Never a second subscription: an account billed on the website, by a store,
 * or by support sees who manages its plan instead of purchase buttons.
 */
export default function PlansScreen() {
  const t = useT('plans');
  const ts = useT('settings');
  const tc = useT('common');
  const router = useRouter();
  const { user: authUser, syncUser } = useAuthStore();
  const { data: userData, refetch, isRefetching } = useCurrentUser();
  const [interval, setInterval] = useState<BillingInterval>('monthly');

  const user = userData ?? authUser;
  const subscription = user?.subscription;
  const current: string = user ? planForDisplay(subscription) : 'free';
  const owner = billingOwner(subscription);
  const store = billingStore(subscription);
  const canPurchase = !!user && canPurchaseInApp(subscription);
  const storeOnThisDevice = (store === 'apple' && Platform.OS === 'ios') || (store === 'google' && Platform.OS === 'android');
  const native = Platform.OS === 'ios' || Platform.OS === 'android';
  const sell = PAID_UPGRADES_ENABLED && native;

  const refresh = () => {
    void syncUser();
    void refetch();
  };
  const contactSales = () => router.push('/(dashboard)/support/new');

  const manageInStore = async () => {
    try {
      await openNativeStoreSubscriptions();
    } catch (err) {
      Alert.alert(ts('billing.storeErrorTitle'), requestFailureMessage(err, ts('billing.storeError')));
    }
  };

  const infoAction = (plan: PlanId): PlanCardAction => {
    if (plan === current) return { kind: 'current' };
    if (plan === 'business') return { kind: 'contact_sales', onPress: contactSales };
    if (plan === 'free' || !canPurchase) return { kind: 'none' };
    return { kind: 'coming_soon' };
  };

  return (
    <SafeAreaView className="flex-1 bg-stone-50" edges={['top', 'bottom']}>
      <View className="flex-row items-center px-5 pt-4 pb-3 bg-surface border-b border-stone-100">
        <TouchableOpacity
          onPress={() => router.back()}
          className="me-3 h-11 w-11 -ms-2 items-center justify-center"
          accessibilityRole="button"
          accessibilityLabel={tc('back')}
        >
          <Ionicons name="arrow-back" size={22} color={colors.stone[700]} style={RTL_FLIP} />
        </TouchableOpacity>
        <Text className="text-xl font-black text-stone-900 flex-1" accessibilityRole="header" numberOfLines={1}>
          {t('title')}
        </Text>
      </View>

      <ScrollView
        contentContainerStyle={{ padding: 16, paddingBottom: 40 }}
        refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={refresh} tintColor={colors.brand[600]} />}
      >
        <Text className="text-stone-600 text-sm leading-5">{t('lede')}</Text>

        {user && owner !== 'none' ? (
          <View className="mt-4 bg-surface rounded-2xl border border-stone-100 p-4">
            <Text className="text-stone-900 font-semibold">{t('currentPlan')}: {planName(current)}</Text>
            {isLegacyPlan(current) ? (
              <Text className="text-stone-600 text-sm mt-1 leading-5">{t('legacyNote', { tier: planName(equivalentPlan(current)) })}</Text>
            ) : null}
            <Text className="text-stone-600 text-sm mt-2 leading-5">
              {owner === 'store' ? (store === 'google' ? t('owner.google') : t('owner.apple')) : owner === 'website' ? t('owner.website') : t('owner.support')}
            </Text>
            {owner === 'store' && storeOnThisDevice ? (
              <TouchableOpacity
                onPress={() => void manageInStore()}
                className="mt-3 border border-stone-200 rounded-xl min-h-[48px] items-center justify-center px-4"
                accessibilityRole="button"
              >
                <Text className="text-stone-700 font-semibold">{store === 'google' ? t('manageGoogle') : t('manageApple')}</Text>
              </TouchableOpacity>
            ) : null}
            {owner === 'support' ? (
              <TouchableOpacity
                onPress={contactSales}
                className="mt-3 border border-stone-200 rounded-xl min-h-[48px] items-center justify-center px-4"
                accessibilityRole="button"
              >
                <Text className="text-stone-700 font-semibold">{t('openSupport')}</Text>
              </TouchableOpacity>
            ) : null}
          </View>
        ) : null}

        {!sell && canPurchase ? (
          <View className="mt-4 bg-stone-100 rounded-xl p-3">
            <Text className="text-stone-600 text-xs leading-4">{t('comingSoonInApp')}</Text>
          </View>
        ) : null}

        <View className="mt-4">
          <IntervalToggle value={interval} onChange={setInterval} />
          {interval === 'annual' ? <Text className="text-stone-500 text-xs mt-2 leading-4">{t('annualNote')}</Text> : null}
        </View>

        <View className="mt-4">
          {sell ? (
            <NativeStorePaywall
              interval={interval}
              currentPlan={current}
              canPurchase={canPurchase}
              careerEnabled={CAREER_ENABLED}
              onContactSales={contactSales}
              onEntitlementChanged={refresh}
            />
          ) : (
            <>
              {PRICING_PLANS.map((plan) => (
                <PlanCard
                  key={plan}
                  plan={plan}
                  interval={interval}
                  isCurrent={plan === current}
                  careerEnabled={CAREER_ENABLED}
                  action={infoAction(plan)}
                />
              ))}
              <PlanTermsNote storePrices={false} />
            </>
          )}
        </View>

        <View className="mt-4">
          <PlanComparisonList careerEnabled={CAREER_ENABLED} initialPlan={isPricingPlan(current) ? current : null} />
        </View>
        <View className="mt-4">
          <PlanDefinitions />
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
