import { Ionicons } from '@expo/vector-icons';
import axios from 'axios';
import { useRouter } from 'expo-router';
import React, { useState } from 'react';
import { Alert, Linking, Platform, ScrollView, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { PlanCard } from '../../../src/components/subscription/PlanCard';
import { ErrorState } from '../../../src/components/ui/ErrorState';
import { Badge } from '../../../src/components/ui/Badge';
import { Skeleton } from '../../../src/components/ui/Skeleton';
import { useInvoices } from '../../../src/hooks/useInvoices';
import {
  BILLING_HISTORY_COPY,
  invoiceAccessibilityLabel,
  invoiceAmount,
  invoiceStatusLabel,
  invoiceStatusVariant,
  invoiceSubtitle,
} from '../../../src/lib/billing-history';
import { useCreateCheckoutSession, useCreatePortalSession } from '../../../src/hooks/usePayment';
import { useCurrentUser } from '../../../src/hooks/useUser';
import { useAuthStore } from '../../../src/store/auth-store';
import { BillingInterval, SubscriptionPlan, SubscriptionStatus } from '../../../src/types/enums';
import { PLAN_CONFIGS, yearlySavingsPercent } from '../../../src/types/subscription.types';
import { requestFailureMessage } from '../../../src/lib/api-errors';
import {
  effectivePlanForCopy,
  hasLiveStorePurchase,
  hasLiveStripeSubscription,
} from '../../../src/lib/entitlements';
import { skuForPlan } from '../../../src/config/iap-products';
import { formatDate, toDate } from '../../../src/lib/utils';
import { PAID_UPGRADES_ENABLED } from '../../../src/config/paid-upgrades';
import { colors } from '../../../src/theme/colors';
import { CareerAddonCard } from '../../../src/components/career/CareerAddonCard';

function formatLimit(limit: number | 'unlimited'): string {
  return limit === 'unlimited' ? '∞' : String(limit);
}

function loadFailureMessage(err: unknown): string {
  if (axios.isAxiosError(err) && !err.response) {
    return 'No connection. Check your network and try again.';
  }
  return 'Could not load usage. Please try again.';
}

const nativeStoreBilling =
  PAID_UPGRADES_ENABLED && (Platform.OS === 'ios' || Platform.OS === 'android');

function NativeStorePaywall({
  interval,
  currentPlan,
  onEntitlementChanged,
}: {
  interval: BillingInterval;
  currentPlan: SubscriptionPlan;
  onEntitlementChanged: () => void;
}) {
  // Lazy so Expo Go does not evaluate expo-iap while S1 is off.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { StorePaywall } = require('../../../src/components/subscription/StorePaywall') as typeof import('../../../src/components/subscription/StorePaywall');
  return (
    <StorePaywall
      interval={interval}
      currentPlan={currentPlan}
      onEntitlementChanged={onEntitlementChanged}
    />
  );
}

async function openNativeStoreSubscriptions(skuAndroid?: string | null) {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { openStoreSubscriptionManagement } = require('../../../src/components/subscription/StorePaywall') as typeof import('../../../src/components/subscription/StorePaywall');
  await openStoreSubscriptionManagement(skuAndroid);
}

export default function BillingScreen() {
  const router = useRouter();
  const { user: authUser, syncUser, userSyncError } = useAuthStore();
  const { data: userData, error: userError, refetch } = useCurrentUser();
  const [interval, setInterval] = useState<BillingInterval>(BillingInterval.MONTH);
  const createCheckout = useCreateCheckoutSession();
  const createPortal = useCreatePortalSession();

  const user = userData ?? authUser;
  const usage = user?.usage;
  const usageFailed = !usage && !!(userError || userSyncError);
  const usageLoading = !usage && !usageFailed;
  // Gates use resolveEffectivePlan — display the same plan, not a stale stored Pro.
  const plan = effectivePlanForCopy(user?.subscription);
  const status = user?.subscription?.status;
  const periodEnd = user?.subscription?.currentPeriodEnd;
  const cancelAtPeriodEnd = !!user?.subscription?.cancelAtPeriodEnd;
  const limits = PLAN_CONFIGS[plan].limits;
  const storeLive = hasLiveStorePurchase(user?.subscription);
  const stripeLive = hasLiveStripeSubscription(user?.subscription);
  const canManageStore = nativeStoreBilling && storeLive;
  const canManageStripe =
    PAID_UPGRADES_ENABLED && stripeLive && !!user?.subscription?.stripeCustomerId;

  const handleSubscribe = async (targetPlan: SubscriptionPlan) => {
    if (!PAID_UPGRADES_ENABLED) return;
    if (targetPlan === SubscriptionPlan.FREE) return;

    try {
      const session = await createCheckout.mutateAsync({ plan: targetPlan, interval });
      await Linking.openURL(session.url);
    } catch (err) {
      Alert.alert(
        'Checkout unavailable',
        requestFailureMessage(err, 'Failed to create checkout session. Please try again.'),
      );
    }
  };

  const handleManageBilling = async () => {
    if (canManageStore) {
      try {
        await openNativeStoreSubscriptions(skuForPlan(plan, interval));
      } catch (err) {
        Alert.alert(
          'Could not open subscriptions',
          requestFailureMessage(err, 'Open your App Store or Google Play account to manage this subscription.'),
        );
      }
      return;
    }
    if (!canManageStripe) return;
    try {
      const portal = await createPortal.mutateAsync();
      await Linking.openURL(portal.url);
    } catch (err) {
      Alert.alert(
        'Billing portal unavailable',
        requestFailureMessage(err, 'Failed to open billing portal. Please try again.'),
      );
    }
  };

  const yearlyDiscount = yearlySavingsPercent(SubscriptionPlan.PRO);

  return (
    <SafeAreaView className="flex-1 bg-stone-50" edges={['top', 'bottom']}>
      <View className="flex-row items-center px-5 pt-4 pb-3 bg-white border-b border-stone-100">
        <TouchableOpacity onPress={() => router.back()} className="mr-3">
          <Ionicons name="arrow-back" size={22} color={colors.stone[700]} />
        </TouchableOpacity>
        <View>
          <Text className="text-xl font-black text-stone-900">
            {PAID_UPGRADES_ENABLED ? 'Billing & Plans' : 'Plan & usage'}
          </Text>
          <Text className="text-stone-400 text-sm">
            {PAID_UPGRADES_ENABLED ? 'Manage your subscription' : 'Your current plan'}
          </Text>
        </View>
      </View>

      <ScrollView className="flex-1" showsVerticalScrollIndicator={false}>
        {usageFailed ? (
          <View className="mx-4 my-4 bg-white rounded-2xl border border-stone-100">
            <ErrorState
              message={userError ? loadFailureMessage(userError) : (userSyncError ?? 'Could not load usage. Please try again.')}
              onRetry={() => {
                void syncUser();
                void refetch();
              }}
            />
          </View>
        ) : usageLoading ? (
          <View className="mx-4 my-4 bg-white rounded-2xl border border-stone-100 p-4 h-32" />
        ) : usage ? (
          <View className="mx-4 my-4 bg-white rounded-2xl border border-stone-100 p-4">
            <Text className="font-bold text-stone-800 mb-3">Current Plan</Text>
            <View className="flex-row items-center justify-between mb-2">
              <Text className="text-stone-600">Plan</Text>
              <Text className="font-semibold text-stone-900 capitalize">{plan}</Text>
            </View>
            {status ? (
              <View className="flex-row items-center justify-between mb-2">
                <Text className="text-stone-600">Status</Text>
                <View className={['px-2 py-0.5 rounded-full', status === SubscriptionStatus.ACTIVE ? 'bg-success-bg' : 'bg-warning-bg'].join(' ')}>
                  <Text className={status === SubscriptionStatus.ACTIVE ? 'text-success font-medium text-sm' : 'text-warning font-medium text-sm'}>
                    {status}
                  </Text>
                </View>
              </View>
            ) : null}
            {toDate(periodEnd) && (
              <View className="flex-row items-center justify-between">
                <Text className="text-stone-600">{cancelAtPeriodEnd ? 'Ends' : 'Renews'}</Text>
                <Text className="font-semibold text-stone-900">{formatDate(periodEnd)}</Text>
              </View>
            )}
            {(canManageStore || canManageStripe) && (
              <TouchableOpacity
                onPress={() => void handleManageBilling()}
                disabled={createPortal.isPending}
                className="mt-3 border border-stone-200 rounded-xl py-2.5 items-center"
              >
                <Text className="text-stone-700 font-semibold">
                  {createPortal.isPending
                    ? 'Opening…'
                    : canManageStore
                      ? 'Manage subscription'
                      : 'Manage Billing'}
                </Text>
              </TouchableOpacity>
            )}
            <View className="mt-3 pt-3 border-t border-stone-100">
              <UsageRow label="CVs" used={usage.cvsCreated} limit={limits.cvs} />
              <UsageRow label="Cover letters" used={usage.coverLettersCreated} limit={limits.coverLetters} />
              <UsageRow
                label="Credits"
                used={usage.aiCreditsUsed}
                limit={usage.aiCreditsLimit}
              />
              <UsageRow label="Exports this month" used={usage.exportsThisMonth} limit={limits.exports} last />
            </View>
          </View>
        ) : null}

        <BillingHistory storeBilled={storeLive} />

        {PAID_UPGRADES_ENABLED && (
          <>
            <View className="mx-4 mb-4">
              <View className="bg-white rounded-2xl border border-stone-100 p-1 flex-row">
                {[BillingInterval.MONTH, BillingInterval.YEAR].map((int) => (
                  <TouchableOpacity
                    key={int}
                    onPress={() => setInterval(int)}
                    className={['flex-1 py-2.5 rounded-xl items-center flex-row justify-center gap-2', interval === int ? 'bg-brand-600' : ''].join(' ')}
                  >
                    <Text className={interval === int ? 'text-white font-bold' : 'text-stone-600 font-medium'}>
                      {int === BillingInterval.MONTH ? 'Monthly' : 'Yearly'}
                    </Text>
                    {int === BillingInterval.YEAR && (
                      <View className="bg-success px-1.5 rounded-full">
                        <Text className="text-white text-xs font-black">-{yearlyDiscount}%</Text>
                      </View>
                    )}
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            <View className="px-4 pb-8">
              {nativeStoreBilling ? (
                <NativeStorePaywall
                  interval={interval}
                  currentPlan={plan}
                  onEntitlementChanged={() => {
                    void syncUser();
                    void refetch();
                  }}
                />
              ) : (
                <>
                  {Object.values(SubscriptionPlan).map((p) => (
                    <PlanCard
                      key={p}
                      config={PLAN_CONFIGS[p]}
                      interval={interval}
                      isCurrentPlan={plan === p}
                      isLoading={createCheckout.isPending}
                      onSelect={() => void handleSubscribe(p)}
                    />
                  ))}

                  <Text className="text-stone-400 text-xs text-center mt-4 leading-4">
                    All payments are securely processed by Stripe. You can cancel or change your plan at any time.
                  </Text>
                </>
              )}
            </View>
          </>
        )}
        <CareerAddonCard />
      </ScrollView>
    </SafeAreaView>
  );
}

/**
 * Website "Billing History", read-only: amount, date, invoice number, status.
 * No invoice / PDF / portal links — store rules forbid sending users to an
 * external payment page from the app.
 */
function BillingHistory({ storeBilled }: { storeBilled: boolean }) {
  const { data: invoices, isLoading, isError, refetch, isRefetching } = useInvoices();

  return (
    <View className="mx-4 mb-4 bg-white rounded-2xl border border-stone-100 p-4">
      <View className="flex-row items-center mb-1">
        <Ionicons name="receipt-outline" size={18} color={colors.stone[400]} />
        <Text className="font-bold text-stone-800 ml-2" accessibilityRole="header">
          {BILLING_HISTORY_COPY.title}
        </Text>
      </View>
      {isLoading ? (
        <View className="mt-3" accessibilityLabel="Loading billing history">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} height={44} className="mb-2 rounded-xl" />
          ))}
        </View>
      ) : isError ? (
        <View className="items-center py-6">
          <Ionicons name="alert-circle-outline" size={28} color={colors.error.DEFAULT} />
          <Text className="text-stone-500 text-sm mt-2 text-center">{BILLING_HISTORY_COPY.loadError}</Text>
          <TouchableOpacity
            onPress={() => void refetch()}
            disabled={isRefetching}
            className="mt-2 px-4 py-3"
            accessibilityRole="button"
            accessibilityState={{ disabled: isRefetching }}
          >
            <Text className="text-brand-600 font-semibold">
              {isRefetching ? 'Loading…' : BILLING_HISTORY_COPY.retry}
            </Text>
          </TouchableOpacity>
        </View>
      ) : invoices && invoices.length > 0 ? (
        <View className="mt-2">
          {invoices.map((inv, index) => (
            <View
              key={inv.id}
              className={['flex-row items-center justify-between py-3', index > 0 ? 'border-t border-stone-100' : ''].join(' ')}
              accessible
              accessibilityLabel={invoiceAccessibilityLabel(inv, formatDate)}
            >
              <View className="flex-1 mr-3">
                <Text className="text-stone-900 font-semibold text-sm">{invoiceAmount(inv)}</Text>
                <Text className="text-stone-500 text-xs mt-0.5" numberOfLines={1}>
                  {invoiceSubtitle(inv, formatDate)}
                </Text>
              </View>
              <Badge variant={invoiceStatusVariant(inv.status)} size="sm">
                {invoiceStatusLabel(inv.status)}
              </Badge>
            </View>
          ))}
        </View>
      ) : (
        <View className="items-center py-6">
          <View className="w-12 h-12 rounded-full bg-stone-100 items-center justify-center mb-2">
            <Ionicons name="receipt-outline" size={22} color={colors.stone[400]} />
          </View>
          <Text className="text-stone-500 text-sm text-center">{BILLING_HISTORY_COPY.empty}</Text>
          {storeBilled ? (
            <Text className="text-stone-400 text-xs text-center mt-1">
              {BILLING_HISTORY_COPY.storeNote}
            </Text>
          ) : null}
        </View>
      )}
    </View>
  );
}

function UsageRow({
  label,
  used,
  limit,
  last = false,
}: {
  label: string;
  used: number;
  limit: number | 'unlimited';
  last?: boolean;
}) {
  return (
    <View className={['flex-row items-center justify-between', last ? '' : 'mb-2'].join(' ')}>
      <Text className="text-stone-600">{label}</Text>
      <Text className="font-semibold text-stone-900">
        {used} / {formatLimit(limit)}
      </Text>
    </View>
  );
}
