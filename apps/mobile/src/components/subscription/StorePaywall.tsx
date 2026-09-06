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
            'Purchase pending',
            'This purchase is waiting for payment. You will get access when it completes.',
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
            'Purchase could not be confirmed',
            requestFailureMessage(err, 'The store charge succeeded but we could not unlock your plan. Try Restore purchases.'),
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
          'Purchase pending',
          'This purchase is waiting for payment. You will get access when it completes.',
        );
        return;
      }
      if (error.code === ErrorCode.AlreadyOwned) {
        Alert.alert(
          'Already subscribed',
          'This Apple or Google account already has this plan. Use Restore purchases to unlock it here.',
        );
        return;
      }
      if (error.code === ErrorCode.ItemUnavailable || error.code === ErrorCode.SkuNotFound) {
        Alert.alert(
          'Plan not in the store yet',
          'This product is not available. Product ids are still placeholders until App Store / Play products exist.',
        );
        return;
      }
      Alert.alert('Purchase failed', error.message || 'The store could not complete this purchase.');
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
          'Plan not in the store yet',
          'Google Play has not returned an offer for this product. Product ids are still placeholders.',
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
          'Purchase failed',
          requestFailureMessage(err, 'The store could not start this purchase.'),
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
        'Purchase failed',
        requestFailureMessage(err, 'The store could not start this purchase.'),
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
        Alert.alert('No purchases to restore', 'This store account has no active FlacronCV subscription.');
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
      Alert.alert('Purchases restored', 'Your plan is now unlocked on this account.');
    } catch (err) {
      Alert.alert(
        'Restore failed',
        requestFailureMessage(err, 'Could not restore purchases. Try again.'),
      );
    } finally {
      setRestoring(false);
    }
  };

  const paidPlans = [SubscriptionPlan.PRO, SubscriptionPlan.ENTERPRISE];

  return (
    <View>
      {paidPlans.map((p) => {
        const sku = skuForPlan(p, interval);
        const storeProduct = sku ? subscriptions.find((s) => s.id === sku) : undefined;
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
          {restoring ? 'Restoring…' : 'Restore purchases'}
        </Text>
      </TouchableOpacity>

      <Text className="text-stone-400 text-xs text-center mt-4 leading-4">
        Subscriptions are billed by the App Store or Google Play. Restore purchases if you
        already paid on this store account. You can cancel in your store account, not in
        this app.
      </Text>
    </View>
  );
}
