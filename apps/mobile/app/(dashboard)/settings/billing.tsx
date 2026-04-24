import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React, { useState } from 'react';
import { Alert, Linking, ScrollView, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { PlanCard } from '../../../src/components/subscription/PlanCard';
import { Button } from '../../../src/components/ui/Button';
import { useCreateCheckoutSession, useCreatePortalSession } from '../../../src/hooks/usePayment';
import { useAuthStore } from '../../../src/store/auth-store';
import { BillingInterval, SubscriptionPlan, SubscriptionStatus } from '../../../src/types/enums';
import { PLAN_CONFIGS } from '../../../src/types/subscription.types';
import { formatDate } from '../../../src/lib/utils';

export default function BillingScreen() {
  const router = useRouter();
  const { user } = useAuthStore();
  const [interval, setInterval] = useState<BillingInterval>(BillingInterval.MONTH);
  const createCheckout = useCreateCheckoutSession();
  const createPortal = useCreatePortalSession();

  const plan = user?.subscription?.plan ?? SubscriptionPlan.FREE;
  const status = user?.subscription?.status ?? SubscriptionStatus.ACTIVE;
  const periodEnd = user?.subscription?.currentPeriodEnd;

  const handleSubscribe = async (targetPlan: SubscriptionPlan) => {
    if (targetPlan === SubscriptionPlan.FREE) return;

    try {
      const session = await createCheckout.mutateAsync({ plan: targetPlan, interval });
      // Open Stripe checkout in browser
      const canOpen = await Linking.canOpenURL(session.url);
      if (canOpen) {
        await Linking.openURL(session.url);
      } else {
        Alert.alert('Error', 'Cannot open payment page. Please try again.');
      }
    } catch {
      Alert.alert('Error', 'Failed to create checkout session.');
    }
  };

  const handleManageBilling = async () => {
    try {
      const portal = await createPortal.mutateAsync();
      await Linking.openURL(portal.url);
    } catch {
      Alert.alert('Error', 'Failed to open billing portal.');
    }
  };

  const yearlyDiscount = Math.round(((PLAN_CONFIGS[SubscriptionPlan.PRO].priceMonthly * 12 - PLAN_CONFIGS[SubscriptionPlan.PRO].priceYearly) / (PLAN_CONFIGS[SubscriptionPlan.PRO].priceMonthly * 12)) * 100);

  return (
    <SafeAreaView className="flex-1 bg-stone-50">
      <View className="flex-row items-center px-5 pt-4 pb-3 bg-white border-b border-stone-100">
        <TouchableOpacity onPress={() => router.back()} className="mr-3">
          <Ionicons name="arrow-back" size={22} color="#374151" />
        </TouchableOpacity>
        <View>
          <Text className="text-xl font-black text-stone-900">Billing & Plans</Text>
          <Text className="text-stone-400 text-sm">Manage your subscription</Text>
        </View>
      </View>

      <ScrollView className="flex-1" showsVerticalScrollIndicator={false}>
        {/* Current Plan Status */}
        {plan !== SubscriptionPlan.FREE && (
          <View className="mx-4 my-4 bg-white rounded-2xl border border-stone-100 p-4">
            <Text className="font-bold text-stone-800 mb-3">Current Plan</Text>
            <View className="flex-row items-center justify-between mb-2">
              <Text className="text-stone-600">Plan</Text>
              <Text className="font-semibold text-stone-900 capitalize">{plan}</Text>
            </View>
            <View className="flex-row items-center justify-between mb-2">
              <Text className="text-stone-600">Status</Text>
              <View className={['px-2 py-0.5 rounded-full', status === SubscriptionStatus.ACTIVE ? 'bg-green-100' : 'bg-amber-100'].join(' ')}>
                <Text className={status === SubscriptionStatus.ACTIVE ? 'text-green-700 font-medium text-sm' : 'text-amber-700 font-medium text-sm'}>
                  {status}
                </Text>
              </View>
            </View>
            {periodEnd && (
              <View className="flex-row items-center justify-between">
                <Text className="text-stone-600">Renews</Text>
                <Text className="font-semibold text-stone-900">{formatDate(periodEnd)}</Text>
              </View>
            )}
            <TouchableOpacity
              onPress={handleManageBilling}
              disabled={createPortal.isPending}
              className="mt-3 border border-stone-200 rounded-xl py-2.5 items-center"
            >
              <Text className="text-stone-700 font-semibold">Manage Billing</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Billing Interval Toggle */}
        <View className="mx-4 mb-4">
          <View className="bg-white rounded-2xl border border-stone-100 p-1 flex-row">
            {[BillingInterval.MONTH, BillingInterval.YEAR].map((int) => (
              <TouchableOpacity
                key={int}
                onPress={() => setInterval(int)}
                className={['flex-1 py-2.5 rounded-xl items-center flex-row justify-center gap-2', interval === int ? 'bg-brand-500' : ''].join(' ')}
              >
                <Text className={interval === int ? 'text-white font-bold' : 'text-stone-600 font-medium'}>
                  {int === BillingInterval.MONTH ? 'Monthly' : 'Yearly'}
                </Text>
                {int === BillingInterval.YEAR && (
                  <View className="bg-green-400 px-1.5 rounded-full">
                    <Text className="text-white text-xs font-black">-{yearlyDiscount}%</Text>
                  </View>
                )}
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* Plan Cards */}
        <View className="px-4 pb-8">
          {Object.values(SubscriptionPlan).map((p) => (
            <PlanCard
              key={p}
              config={PLAN_CONFIGS[p]}
              interval={interval}
              isCurrentPlan={plan === p}
              isLoading={createCheckout.isPending}
              onSelect={() => handleSubscribe(p)}
            />
          ))}

          <Text className="text-stone-400 text-xs text-center mt-4 leading-4">
            All payments are securely processed by Stripe. You can cancel or change your plan at any time.
          </Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
