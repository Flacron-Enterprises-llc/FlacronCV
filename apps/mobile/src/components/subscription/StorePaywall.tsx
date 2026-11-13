import React, { useEffect, useRef, useState } from 'react';
import { Alert, Platform, Text, TouchableOpacity, View } from 'react-native';
import {
  ErrorCode,
  deepLinkToSubscriptions,
  finishTransaction,
  getAvailablePurchases,
  useIAP,
  type ProductSubscription,
  type Purchase,
} from 'expo-iap';
import { PlanCard } from './PlanCard';
import { allStoreSkus, IAP_ANDROID_PACKAGE, skuForPlan, storeProductIds } from '../../config/iap-products';
import { verifyMobilePurchase } from '../../hooks/usePayment';
import { requestFailureMessage } from '../../lib/api-errors';
import { t, useT } from '../../i18n';
import { BillingInterval, SubscriptionPlan } from '../../types/enums';
import { PLAN_CONFIGS } from '../../types/subscription.types';

export type StorePaywallProps = {
  interval: BillingInterval;
  currentPlan: SubscriptionPlan;
  onEntitlementChanged: () => void;
};

function isPendingPurchase(purchase: Purchase): boolean {
  return purchase.purchaseState === 'pending';
}

function androidOfferToken(sub: ProductSubscription | undefined): string | null {
  if (!sub || sub.platform !== 'android') return null;
  const offer = sub.subscriptionOffers.find((o) => o.offerTokenAndroid);
  return offer?.offerTokenAndroid ?? null;
}

function verifyBody(purchase: Purchase) {
  if (Platform.OS === 'ios') {
    return {
      provider: 'apple' as const,
      signedTransactionInfo: purchase.purchaseToken?.trim() || undefined,
      transactionId: (purchase.transactionId ?? purchase.id)?.trim() || undefined,
    };
  }
  return {
    provider: 'google' as const,
    purchaseToken: purchase.purchaseToken?.trim() || undefined,
  };
}

export async function openStoreSubscriptionManagement(skuAndroid?: string | null) {
  await deepLinkToSubscriptions({
    skuAndroid: skuAndroid ?? storeProductIds().proMonthly,
    packageNameAndroid: IAP_ANDROID_PACKAGE,
  });
}

/**
 * Native IAP paywall. Import only when S1 is on (billing lazy-requires this
 * file) so Expo Go does not load expo-iap while the flag is off.
 */
export function StorePaywall({ interval, currentPlan, onEntitlementChanged }: StorePaywallProps) {
  const tp = useT('subscription.paywall');
  const [busySku, setBusySku] = useState<string | null>(null);
  const [restoring, setRestoring] = useState(false);
  const processed = useRef(new Set<string>());
  const onChangedRef = useRef(onEntitlementChanged);
  onChangedRef.current = onEntitlementChanged;

  const {
    connected,
    subscriptions,
    fetchProducts,
    requestPurchase,
    restorePurchases,
  } = useIAP({
    onPurchaseSuccess: (purchase) => {
      void (async () => {
        const key = purchase.transactionId ?? purchase.id;
        if (key && processed.current.has(key)) return;
        if (key) processed.current.add(key);

        if (isPendingPurchase(purchase)) {
          setBusySku(null);
          Alert.alert(
            t('subscription.paywall.pendingTitle'),
            t('subscription.paywall.pendingBody'),
          );
          return;
        }

        try {
          const body = verifyBody(purchase);
          await verifyMobilePurchase(body);
          await finishTransaction({ purchase, isConsumable: false });
          onChangedRef.current();
        } catch (err) {
          if (key) processed.current.delete(key);
          Alert.alert(
            t('subscription.paywall.confirmFailedTitle'),
            requestFailureMessage(err, t('subscription.paywall.confirmFailedBody')),
          );
        } finally {
          setBusySku(null);
        }
      })();
    },
    onPurchaseError: (error) => {
      setBusySku(null);
      if (error.code === ErrorCode.UserCancelled) return;
      if (error.code === ErrorCode.Pending || error.code === ErrorCode.DeferredPayment) {
        Alert.alert(
          t('subscription.paywall.pendingTitle'),
          t('subscription.paywall.pendingBody'),
        );
        return;
      }
      if (error.code === ErrorCode.AlreadyOwned) {
        Alert.alert(
          t('subscription.paywall.alreadyOwnedTitle'),
          t('subscription.paywall.alreadyOwnedBody'),
        );
        return;
      }
      if (error.code === ErrorCode.ItemUnavailable || error.code === ErrorCode.SkuNotFound) {
        Alert.alert(
          t('subscription.paywall.unavailableTitle'),
          t('subscription.paywall.unavailableBody'),
        );
        return;
      }
      Alert.alert(t('subscription.paywall.failedTitle'), error.message || t('subscription.paywall.failedBody'));
    },
  });

  useEffect(() => {
    if (!connected) return;
    void fetchProducts({ skus: allStoreSkus(), type: 'subs' });
  }, [connected, fetchProducts]);

  const handleSelect = async (plan: SubscriptionPlan) => {
    const sku = skuForPlan(plan, interval);
    if (!sku || plan === currentPlan) return;

    const sub = subscriptions.find((s) => s.id === sku);
    if (Platform.OS === 'android') {
      const token = androidOfferToken(sub);
      if (!token) {
        Alert.alert(
          t('subscription.paywall.unavailableTitle'),
          t('subscription.paywall.noOfferBody'),
        );
        return;
      }
      setBusySku(sku);
      try {
        await requestPurchase({
          type: 'subs',
          request: {
            google: {
              skus: [sku],
              subscriptionOffers: [{ sku, offerToken: token }],
            },
          },
        });
      } catch (err) {
        setBusySku(null);
        Alert.alert(
          t('subscription.paywall.failedTitle'),
          requestFailureMessage(err, t('subscription.paywall.startFailedBody')),
        );
      }
      return;
    }

    setBusySku(sku);
    try {
      await requestPurchase({
        type: 'subs',
        request: { apple: { sku } },
      });
    } catch (err) {
      setBusySku(null);
      Alert.alert(
        t('subscription.paywall.failedTitle'),
        requestFailureMessage(err, t('subscription.paywall.startFailedBody')),
      );
    }
  };

  const handleRestore = async () => {
    setRestoring(true);
    try {
      await restorePurchases();
      const purchases = await getAvailablePurchases();
      const ready = (Array.isArray(purchases) ? purchases : []).filter(
        (p) => !isPendingPurchase(p),
      );
      if (ready.length === 0) {
        Alert.alert(t('subscription.paywall.nothingToRestoreTitle'), t('subscription.paywall.nothingToRestoreBody'));
        return;
      }
      ready.sort((a, b) => b.transactionDate - a.transactionDate);
      const latest = ready[0];
      const key = latest.transactionId ?? latest.id;
      if (key) processed.current.add(key);
      await verifyMobilePurchase(verifyBody(latest));
      for (const purchase of ready) {
        try {
          await finishTransaction({ purchase, isConsumable: false });
        } catch {
          /* still finish the rest */
        }
      }
      onChangedRef.current();
      Alert.alert(t('subscription.paywall.restoredTitle'), t('subscription.paywall.restoredBody'));
    } catch (err) {
      Alert.alert(
        t('subscription.paywall.restoreFailedTitle'),
        requestFailureMessage(err, t('subscription.paywall.restoreFailedBody')),
      );
    } finally {
      setRestoring(false);
    }
  };

  // Omit plans with no sellable SKU for this interval (e.g. Enterprise yearly on Android).
  const paidPlans = [SubscriptionPlan.PRO, SubscriptionPlan.ENTERPRISE].filter(
    (p) => skuForPlan(p, interval) != null,
  );

  return (
    <View>
      {paidPlans.map((p) => {
        const sku = skuForPlan(p, interval)!;
        const storeProduct = subscriptions.find((s) => s.id === sku);
        return (
          <PlanCard
            key={p}
            config={PLAN_CONFIGS[p]}
            interval={interval}
            isCurrentPlan={currentPlan === p}
            isLoading={busySku === sku || restoring}
            priceOverride={storeProduct?.displayPrice}
            onSelect={() => void handleSelect(p)}
          />
        );
      })}

      <TouchableOpacity
        onPress={() => void handleRestore()}
        disabled={restoring || !!busySku}
        className="mt-1 border border-stone-200 rounded-xl py-3 items-center"
      >
        <Text className="text-stone-700 font-semibold">
          {restoring ? tp('restoring') : tp('restore')}
        </Text>
      </TouchableOpacity>

      <Text className="text-stone-400 text-xs text-center mt-4 leading-4">
        {tp('storeNote')}
      </Text>
    </View>
  );
}
