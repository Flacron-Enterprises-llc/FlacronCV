import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Platform, Text, TouchableOpacity, View } from 'react-native';
import {
  ErrorCode,
  deepLinkToSubscriptions,
  finishTransaction,
  getAvailablePurchases,
  useIAP,
  type Purchase,
} from 'expo-iap';
import { IAP_ANDROID_PACKAGE, IAP_PRODUCT_IDS } from '../../config/iap-products';
import { STORE_PRODUCTS } from '../../config/paid-upgrades';
import { verifyMobilePurchase } from '../../hooks/usePayment';
import { requestFailureMessage } from '../../lib/api-errors';
import { allSkus, planForSku, readStoreProduct, skuFor, type StoreProductView } from '../../lib/iap';
import { PRICING_PLANS, planName, type BillingInterval, type PlanId } from '../../lib/plan-catalog';
import { t, useT } from '../../i18n';
import { PlanCard, PlanTermsNote, type PlanCardAction } from './PlanCatalog';

export type StorePaywallProps = {
  interval: BillingInterval;
  /** The account's effective plan id (five-plan or legacy). */
  currentPlan: string;
  /** False when another live subscription bills the account (no purchase on top of it). */
  canPurchase: boolean;
  careerEnabled: boolean;
  onContactSales: () => void;
  onEntitlementChanged: () => void;
};

function isPendingPurchase(purchase: Purchase): boolean {
  return purchase.purchaseState === 'pending';
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

/**
 * Opens the store's own subscription settings (App Store / Google Play), where
 * a store subscriber changes plan or cancels. `skuAndroid` should be the
 * subscribed product when known; Play then opens that subscription's page.
 */
export async function openStoreSubscriptionManagement(skuAndroid?: string | null) {
  const fallback = allSkus(STORE_PRODUCTS)[0] ?? IAP_PRODUCT_IDS.google.proMonthly;
  await deepLinkToSubscriptions({
    skuAndroid: skuAndroid ?? fallback,
    packageNameAndroid: IAP_ANDROID_PACKAGE,
  });
}

/**
 * Native in-app purchase of the five-plan catalog. Import only when
 * PAID_UPGRADES_ENABLED (billing screens lazy-require this file) so Expo Go
 * and builds without store products never load expo-iap.
 *
 * Purchase → POST /billing/mobile/verify (the server maps the store product
 * to a plan from its own env; the app never names a plan) → finish the
 * transaction → refresh the account. Pending and deferred purchases wait for
 * the store. Restore re-verifies the newest active purchase, which also
 * restores a legacy Pro / Enterprise store subscription.
 */
export function StorePaywall({
  interval,
  currentPlan,
  canPurchase,
  careerEnabled,
  onContactSales,
  onEntitlementChanged,
}: StorePaywallProps) {
  const tp = useT('subscription.paywall');
  const [busySku, setBusySku] = useState<string | null>(null);
  const [restoring, setRestoring] = useState(false);
  const processed = useRef(new Set<string>());
  const onChangedRef = useRef(onEntitlementChanged);
  onChangedRef.current = onEntitlementChanged;

  const { connected, subscriptions, fetchProducts, requestPurchase, restorePurchases } = useIAP({
    onPurchaseSuccess: (purchase) => {
      void (async () => {
        const key = purchase.transactionId ?? purchase.id;
        if (key && processed.current.has(key)) return;
        if (key) processed.current.add(key);

        if (isPendingPurchase(purchase)) {
          setBusySku(null);
          Alert.alert(t('subscription.paywall.pendingTitle'), t('subscription.paywall.pendingBody'));
          return;
        }

        try {
          const result = await verifyMobilePurchase(verifyBody(purchase));
          await finishTransaction({ purchase, isConsumable: false });
          onChangedRef.current();
          Alert.alert(t('plans.purchasedTitle'), t('plans.purchased', { plan: planName(result.plan) }));
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
        Alert.alert(t('subscription.paywall.pendingTitle'), t('subscription.paywall.pendingBody'));
        return;
      }
      if (error.code === ErrorCode.AlreadyOwned) {
        Alert.alert(t('subscription.paywall.alreadyOwnedTitle'), t('subscription.paywall.alreadyOwnedBody'));
        return;
      }
      if (error.code === ErrorCode.ItemUnavailable || error.code === ErrorCode.SkuNotFound) {
        Alert.alert(t('subscription.paywall.unavailableTitle'), t('subscription.paywall.unavailableBody'));
        return;
      }
      Alert.alert(t('subscription.paywall.failedTitle'), error.message || t('subscription.paywall.failedBody'));
    },
  });

  const skus = useMemo(() => allSkus(STORE_PRODUCTS), []);
  useEffect(() => {
    if (!connected || skus.length === 0) return;
    void fetchProducts({ skus, type: 'subs' });
  }, [connected, fetchProducts, skus]);

  const products = useMemo(() => {
    const map = new Map<string, StoreProductView>();
    for (const raw of subscriptions) {
      const view = readStoreProduct(raw);
      if (view && planForSku(STORE_PRODUCTS, view.id)) map.set(view.id, view);
    }
    return map;
  }, [subscriptions]);

  const handleBuy = async (sku: string) => {
    if (busySku || restoring || !canPurchase) return;
    const product = products.get(sku);
    if (Platform.OS === 'android') {
      const token = product?.offerToken;
      if (!token) {
        Alert.alert(t('subscription.paywall.unavailableTitle'), t('subscription.paywall.noOfferBody'));
        return;
      }
      setBusySku(sku);
      try {
        await requestPurchase({
          type: 'subs',
          request: { google: { skus: [sku], subscriptionOffers: [{ sku, offerToken: token }] } },
        });
      } catch (err) {
        setBusySku(null);
        Alert.alert(t('subscription.paywall.failedTitle'), requestFailureMessage(err, t('subscription.paywall.startFailedBody')));
      }
      return;
    }
    setBusySku(sku);
    try {
      await requestPurchase({ type: 'subs', request: { apple: { sku } } });
    } catch (err) {
      setBusySku(null);
      Alert.alert(t('subscription.paywall.failedTitle'), requestFailureMessage(err, t('subscription.paywall.startFailedBody')));
    }
  };

  const handleRestore = async () => {
    setRestoring(true);
    try {
      await restorePurchases();
      const purchases = await getAvailablePurchases();
      const ready = (Array.isArray(purchases) ? purchases : []).filter((p) => !isPendingPurchase(p));
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
      Alert.alert(t('subscription.paywall.restoreFailedTitle'), requestFailureMessage(err, t('subscription.paywall.restoreFailedBody')));
    } finally {
      setRestoring(false);
    }
  };

  const actionFor = (plan: PlanId): PlanCardAction => {
    if (plan === currentPlan) return { kind: 'current' };
    if (plan === 'business') return { kind: 'contact_sales', onPress: onContactSales };
    if (plan === 'free' || !canPurchase) return { kind: 'none' };
    const sku = skuFor(STORE_PRODUCTS, plan, interval);
    // Configured but not (yet) returned by the store for this account: not buyable, say so.
    if (!sku || (connected && subscriptions.length > 0 && !products.has(sku))) return { kind: 'coming_soon' };
    return { kind: 'buy', busy: busySku === sku, disabled: !connected || restoring || (!!busySku && busySku !== sku), onPress: () => void handleBuy(sku) };
  };

  const anyStorePrice = products.size > 0;

  return (
    <View>
      {PRICING_PLANS.map((plan) => {
        const sku = skuFor(STORE_PRODUCTS, plan, interval);
        const product = sku ? products.get(sku) : undefined;
        return (
          <PlanCard
            key={plan}
            plan={plan}
            interval={interval}
            isCurrent={plan === currentPlan}
            careerEnabled={careerEnabled}
            action={actionFor(plan)}
            storePrice={product?.displayPrice}
            hasFreeTrial={!!product?.hasFreeTrial && canPurchase}
          />
        );
      })}

      <TouchableOpacity
        onPress={() => void handleRestore()}
        disabled={restoring || !!busySku}
        className="mt-1 border border-stone-200 rounded-xl min-h-[48px] items-center justify-center bg-surface"
        accessibilityRole="button"
        accessibilityState={{ disabled: restoring || !!busySku, busy: restoring }}
      >
        <Text className="text-stone-700 font-semibold">{restoring ? tp('restoring') : tp('restore')}</Text>
      </TouchableOpacity>
      <PlanTermsNote storePrices={anyStorePrice} />
    </View>
  );
}
