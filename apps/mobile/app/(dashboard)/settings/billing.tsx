import { Ionicons } from '@expo/vector-icons';
import axios from 'axios';
import { useRouter } from 'expo-router';
import React, { useEffect, useMemo, useRef } from 'react';
import { Alert, Linking, Platform, RefreshControl, ScrollView, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ErrorState } from '../../../src/components/ui/ErrorState';
import { Badge } from '../../../src/components/ui/Badge';
import { Skeleton } from '../../../src/components/ui/Skeleton';
import { CareerAddonCard } from '../../../src/components/career/CareerAddonCard';
import { CAREER_ENABLED } from '../../../src/config/career';
import { LEGACY_STRIPE_PORTAL_ENABLED, PAID_UPGRADES_ENABLED } from '../../../src/config/paid-upgrades';
import { useCareerUsage } from '../../../src/hooks/useCareer';
import { useInvoices } from '../../../src/hooks/useInvoices';
import { useCreatePortalSession, useMarkUsageWarningsSeen, useV1Usage } from '../../../src/hooks/usePayment';
import { useCurrentUser } from '../../../src/hooks/useUser';
import { requestFailureMessage } from '../../../src/lib/api-errors';
import {
  activePacks,
  billingOwner,
  billingStore,
  canPurchaseInApp,
  careerAllowanceRows,
  expiresSoon,
  storageGrace,
  unseenWarningIds,
  usageWarnings,
  v1AllowanceRows,
  type AllowanceRow,
  type UsageWarning,
} from '../../../src/lib/billing';
import {
  invoiceAccessibilityLabel,
  invoiceAmount,
  invoiceStatusLabel,
  invoiceStatusVariant,
  invoiceSubtitle,
} from '../../../src/lib/billing-history';
import { planForDisplay } from '../../../src/lib/entitlements';
import { equivalentPlan, isLegacyPlan, planLabel, planName, storageLabel } from '../../../src/lib/plan-catalog';
import { toDate } from '../../../src/lib/utils';
import { useAuthStore } from '../../../src/store/auth-store';
import { colors } from '../../../src/theme/colors';
import { formatDate, formatNumber, hasKey, t as tNow, useT } from '../../../src/i18n';
import { RTL_FLIP } from '../../../src/i18n/native';

/** A stored date (ISO string, Firestore timestamp, …) in the app language; "—" when absent. */
function formatStoredDate(value: unknown): string {
  return formatDate(toDate(value));
}

/** Name of a V1 counter or career usage unit; an unknown unit is shown as sent. */
function unitLabel(key: string): string {
  const path = `plans.usageUnits.${key}`;
  return hasKey(path) ? tNow(path) : key;
}

const STATUS_VARIANT: Record<string, 'success' | 'warning' | 'danger' | 'info' | 'default'> = {
  active: 'success',
  trialing: 'info',
  past_due: 'warning',
  canceled: 'danger',
  incomplete: 'warning',
  incomplete_expired: 'danger',
  unpaid: 'danger',
  paused: 'warning',
};

async function openNativeStoreSubscriptions() {
  // Lazy so builds without in-app purchase never evaluate expo-iap.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { openStoreSubscriptionManagement } = require('../../../src/components/subscription/StorePaywall') as typeof import('../../../src/components/subscription/StorePaywall');
  await openStoreSubscriptionManagement();
}

/**
 * Settings → Billing & usage (website Settings → Billing): current plan and
 * renewal, who bills it, allowance per unit (V1 counters incl. stored CVs /
 * letters and analyses, plus the career ledger when career tools are on),
 * 80/95/100 % warnings, packs with expiry (read-only — packs are not sold in
 * the app), the storage grace notice and the invoice list. Plans are bought
 * on the Plans screen through the App Store / Google Play only.
 */
export default function BillingScreen() {
  const t = useT('plans');
  const ts = useT('settings');
  const tc = useT('common');
  const router = useRouter();
  const { user: authUser, syncUser, userSyncError } = useAuthStore();
  const { data: userData, error: userError, refetch: refetchUser, isRefetching } = useCurrentUser();
  const v1Usage = useV1Usage();
  const careerUsage = useCareerUsage();
  const markSeen = useMarkUsageWarningsSeen();
  const createPortal = useCreatePortalSession();

  const user = userData ?? authUser;
  const subscription = user?.subscription;
  const accountFailed = !user && !!(userError || userSyncError);
  const plan: string = user ? planForDisplay(subscription) : 'free';
  const isFree = plan === 'free';
  const owner = billingOwner(subscription);
  const store = billingStore(subscription);
  const legacy = isLegacyPlan(plan);
  const status = subscription?.status;
  const periodEnd = subscription?.currentPeriodEnd;
  const renewal = !isFree && toDate(periodEnd) ? formatStoredDate(periodEnd) : null;

  const careerRows = useMemo(() => careerAllowanceRows(careerUsage.data), [careerUsage.data]);
  const v1Rows = useMemo(
    () => v1AllowanceRows(plan, v1Usage.data ?? user?.usage, new Set(careerRows.map((row) => row.key))),
    [careerRows, plan, user?.usage, v1Usage.data],
  );
  const rows = useMemo(() => [...v1Rows, ...careerRows], [careerRows, v1Rows]);
  const warnings = useMemo(() => usageWarnings(rows), [rows]);
  const packs = useMemo(() => activePacks(careerUsage.data), [careerUsage.data]);
  const grace = storageGrace(careerUsage.data);
  const allowanceRenewal = careerUsage.data?.renewalDate ? formatStoredDate(careerUsage.data.renewalDate) : renewal;

  // The career ledger's own 80/95/100 % notices: mark them seen once this screen has shown the banner.
  const marked = useRef(false);
  useEffect(() => {
    if (marked.current || warnings.length === 0) return;
    const ids = unseenWarningIds(careerUsage.data);
    if (ids.length === 0) return;
    marked.current = true;
    markSeen.mutate(ids);
  }, [careerUsage.data, markSeen, warnings.length]);

  const refresh = () => {
    void syncUser();
    void refetchUser();
    void v1Usage.refetch();
    if (CAREER_ENABLED) void careerUsage.refetch();
  };

  const manageInStore = async () => {
    try {
      await openNativeStoreSubscriptions();
    } catch (err) {
      Alert.alert(ts('billing.storeErrorTitle'), requestFailureMessage(err, ts('billing.storeError')));
    }
  };

  const openLegacyPortal = async () => {
    try {
      const portal = await createPortal.mutateAsync();
      await Linking.openURL(portal.url);
    } catch (err) {
      Alert.alert(ts('billing.portalUnavailable'), requestFailureMessage(err, ts('billing.portalError')));
    }
  };

  // The store that bills the plan can only be managed from a device of that store.
  const storeHere = owner === 'store' && ((store === 'apple' && Platform.OS === 'ios') || (store === 'google' && Platform.OS === 'android'));
  const legacyStripePortal = owner === 'website' && legacy && LEGACY_STRIPE_PORTAL_ENABLED && !!subscription?.stripeCustomerId;

  return (
    <SafeAreaView className="flex-1 bg-stone-50" edges={['top', 'bottom']}>
      <View className="flex-row items-center px-5 pt-4 pb-3 bg-white border-b border-stone-100">
        <TouchableOpacity
          onPress={() => router.back()}
          className="me-3 h-11 w-11 -ms-2 items-center justify-center"
          accessibilityRole="button"
          accessibilityLabel={tc('back')}
        >
          <Ionicons name="arrow-back" size={22} color={colors.stone[700]} style={RTL_FLIP} />
        </TouchableOpacity>
        <Text className="text-xl font-black text-stone-900 flex-1" accessibilityRole="header" numberOfLines={1}>
          {t('billingTitle')}
        </Text>
      </View>

      <ScrollView
        className="flex-1"
        contentContainerStyle={{ paddingBottom: 32 }}
        refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={refresh} tintColor={colors.brand[600]} />}
      >
        {accountFailed ? (
          <View className="mx-4 my-4 bg-white rounded-2xl border border-stone-100">
            <ErrorState
              message={userError && axios.isAxiosError(userError) && !userError.response ? tc('noConnection') : (userSyncError ?? ts('usage.loadError'))}
              onRetry={refresh}
            />
          </View>
        ) : !user ? (
          <View className="mx-4 my-4">
            <Skeleton height={140} className="rounded-2xl" />
          </View>
        ) : (
          <>
            <WarningsBanner
              warnings={warnings}
              renewal={allowanceRenewal}
              canUpgrade={PAID_UPGRADES_ENABLED && canPurchaseInApp(subscription)}
            />

            {grace ? (
              <View className="mx-4 mt-4 rounded-2xl border p-4 flex-row" style={{ borderColor: colors.warning.DEFAULT, backgroundColor: colors.warning.bg }} accessibilityRole="alert">
                <Ionicons name="alert-circle" size={20} color={colors.warning.DEFAULT} style={{ marginEnd: 8 }} />
                <Text className="flex-1 text-stone-800 text-sm leading-5">
                  {t('storageGrace', { excess: storageLabel(grace.excessBytes), date: formatStoredDate(grace.graceUntil) })}
                </Text>
              </View>
            ) : null}

            {/* Current plan */}
            <View className="mx-4 mt-4 bg-white rounded-2xl border border-stone-100 p-4">
              <View className="flex-row items-center flex-wrap gap-2">
                <Ionicons name="ribbon-outline" size={20} color={colors.brand[600]} />
                <Text className="text-lg font-bold text-stone-900 me-1 shrink" accessibilityRole="header">
                  {planLabel(plan)}
                </Text>
                {!isFree && status && hasKey(`plans.status.${status}`) ? (
                  <Badge variant={STATUS_VARIANT[status] ?? 'default'}>{t(`status.${status}`)}</Badge>
                ) : null}
              </View>
              {renewal ? (
                <Text className="text-stone-500 text-sm mt-2">
                  {status === 'trialing'
                    ? t('trialEnds', { date: renewal })
                    : subscription?.cancelAtPeriodEnd
                      ? t('canceledAt', { date: renewal })
                      : t('renewsAt', { date: renewal })}
                </Text>
              ) : null}
              {isFree ? <Text className="text-stone-500 text-sm mt-2 leading-5">{t('freeRenewalNote')}</Text> : null}
              {legacy ? (
                <Text className="text-stone-600 text-sm mt-2 leading-5">{t('legacyNote', { tier: planName(equivalentPlan(plan)) })}</Text>
              ) : null}

              {owner === 'store' ? (
                <>
                  <Text className="text-stone-600 text-sm mt-3 leading-5">{store === 'google' ? t('owner.google') : t('owner.apple')}</Text>
                  {storeHere ? (
                    <OutlineButton
                      label={store === 'google' ? t('manageGoogle') : t('manageApple')}
                      onPress={() => void manageInStore()}
                    />
                  ) : null}
                </>
              ) : owner === 'website' ? (
                <>
                  <Text className="text-stone-600 text-sm mt-3 leading-5">{t('owner.website')}</Text>
                  {legacyStripePortal ? (
                    <OutlineButton
                      label={createPortal.isPending ? ts('billing.opening') : ts('billing.manageBilling')}
                      onPress={() => void openLegacyPortal()}
                      disabled={createPortal.isPending}
                    />
                  ) : null}
                </>
              ) : owner === 'support' ? (
                <>
                  <Text className="text-stone-600 text-sm mt-3 leading-5">{t('owner.support')}</Text>
                  <OutlineButton label={t('openSupport')} onPress={() => router.push('/(dashboard)/support/new')} />
                </>
              ) : null}

              <TouchableOpacity
                onPress={() => router.push('/(dashboard)/settings/plans')}
                className="mt-3 rounded-xl bg-brand-600 min-h-[48px] items-center justify-center px-4"
                accessibilityRole="button"
              >
                <Text className="text-white font-bold">{PAID_UPGRADES_ENABLED && owner === 'none' ? t('seePlans') : t('comparePlans')}</Text>
              </TouchableOpacity>
            </View>

            <AllowanceList rows={rows} title={isFree ? t('usageTitleFree') : t('usageTitle')} loading={v1Usage.isPending && !user.usage} />
            {CAREER_ENABLED && careerUsage.isError ? (
              <Text className="mx-4 mt-2 text-stone-500 text-sm leading-5">{t('careerUsageUnavailable')}</Text>
            ) : null}

            <PackList packs={packs} />

            <BillingHistory storeBilled={owner === 'store'} />
          </>
        )}
        <CareerAddonCard />
      </ScrollView>
    </SafeAreaView>
  );
}

function OutlineButton({ label, onPress, disabled = false }: { label: string; onPress: () => void; disabled?: boolean }) {
  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={disabled}
      className="mt-3 border border-stone-200 rounded-xl min-h-[48px] items-center justify-center px-4"
      accessibilityRole="button"
      accessibilityState={{ disabled }}
    >
      <Text className="text-stone-700 font-semibold text-center">{label}</Text>
    </TouchableOpacity>
  );
}

/** 80 / 95 / 100 % warnings as one banner above the allowances. */
function WarningsBanner({ warnings, renewal, canUpgrade }: { warnings: readonly UsageWarning[]; renewal: string | null; canUpgrade: boolean }) {
  const t = useT('plans.warnings');
  if (warnings.length === 0) return null;
  const exhausted = warnings.some((w) => w.level === 100);
  const tone = exhausted ? colors.error : colors.warning;
  return (
    <View
      className="mx-4 mt-4 rounded-2xl border p-4"
      style={{ borderColor: tone.DEFAULT, backgroundColor: tone.bg }}
      accessibilityRole={exhausted ? 'alert' : 'summary'}
    >
      <Text className="font-bold text-stone-900">{exhausted ? t('titleExhausted') : t('title')}</Text>
      {warnings.map((warning) => (
        <Text key={`${warning.source}-${warning.key}`} className="text-stone-700 text-sm mt-1 leading-5">
          {warning.level === 100
            ? t('level100', { unit: unitLabel(warning.key) })
            : warning.level === 95
              ? t('level95', { unit: unitLabel(warning.key), percent: warning.percent })
              : t('level80', { unit: unitLabel(warning.key), percent: warning.percent })}
        </Text>
      ))}
      <Text className="text-stone-600 text-sm mt-2 leading-5">
        {[exhausted ? t('exhaustedHelp') : null, renewal ? t('renews', { date: renewal }) : null, canUpgrade ? t('optionsUpgrade') : null]
          .filter(Boolean)
          .join(' ')}
      </Text>
    </View>
  );
}

/** Allowance by unit: included (or limit), used and left, for the V1 counters and the career units. */
function AllowanceList({ rows, title, loading }: { rows: readonly AllowanceRow[]; title: string; loading: boolean }) {
  const t = useT('plans.allowanceTable');
  const value = (v: number | null, unknown: 'unlimited' | 'unknown') =>
    v === null ? (unknown === 'unlimited' ? t('unlimited') : '—') : formatNumber(v);
  return (
    <View className="mx-4 mt-4 bg-white rounded-2xl border border-stone-100 p-4">
      <Text className="font-bold text-stone-900 text-lg" accessibilityRole="header">
        {title}
      </Text>
      {loading ? (
        <View className="mt-3">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} height={56} className="mb-2 rounded-xl" />
          ))}
        </View>
      ) : (
        rows.map((row) => {
          const notIncluded = row.granted === 0 && row.packRemaining === 0;
          const percent = row.granted && row.used !== null ? Math.min(100, Math.round((row.used / row.granted) * 100)) : 0;
          const label = unitLabel(row.key);
          return (
            <View key={`${row.source}-${row.key}`} className="py-3 border-b border-stone-100">
              <Text className="text-stone-800 font-semibold text-sm">{label}</Text>
              {notIncluded ? (
                <Text className="text-stone-500 text-sm mt-1">{t('notInPlan')}</Text>
              ) : row.granted === null ? (
                <Text className="text-stone-700 text-sm mt-1">
                  {[t('unlimited'), row.used !== null ? `${t('used')}: ${formatNumber(row.used)}` : null].filter(Boolean).join(' · ')}
                </Text>
              ) : (
                <>
                  <View
                    className="flex-row mt-2"
                    accessible
                    accessibilityLabel={`${label}: ${t(row.capacity ? 'capacity' : 'granted')} ${value(row.granted, 'unlimited')}, ${t('used')} ${value(row.used, 'unknown')}, ${t('remaining')} ${value(row.remaining, 'unknown')}`}
                  >
                    {[
                      [t(row.capacity ? 'capacity' : 'granted'), value(row.granted, 'unlimited')],
                      [t('used'), value(row.used, 'unknown')],
                      [t('remaining'), value(row.remaining, 'unknown')],
                    ].map(([caption, figure]) => (
                      <View key={caption} className="flex-1 items-center">
                        <Text className="text-stone-500 text-xs text-center">{caption}</Text>
                        <Text className="text-stone-900 font-bold text-base">{figure}</Text>
                      </View>
                    ))}
                  </View>
                  {row.used !== null ? (
                    <View className="h-1.5 bg-stone-100 rounded-full overflow-hidden mt-2">
                      <View
                        className="h-full rounded-full"
                        style={{
                          width: `${percent}%`,
                          backgroundColor: percent >= 95 ? colors.error.DEFAULT : percent >= 80 ? colors.warning.DEFAULT : colors.brand[600],
                        }}
                      />
                    </View>
                  ) : null}
                  {row.packRemaining > 0 ? (
                    <Text className="text-stone-500 text-xs mt-1.5">{t('packUnits', { count: row.packRemaining, amount: formatNumber(row.packRemaining) })}</Text>
                  ) : null}
                  {row.capacity ? <Text className="text-stone-500 text-xs mt-1.5">{t('capacityNote')}</Text> : null}
                </>
              )}
            </View>
          );
        })
      )}
    </View>
  );
}

/** Purchased packs still holding units, with expiry. Read-only: packs are not sold in the app. */
function PackList({ packs }: { packs: ReturnType<typeof activePacks> }) {
  const t = useT('plans');
  if (packs.length === 0) return null;
  return (
    <View className="mx-4 mt-4 bg-white rounded-2xl border border-stone-100 p-4">
      <Text className="font-bold text-stone-900 text-lg" accessibilityRole="header">
        {t('packsTitle')}
      </Text>
      <Text className="text-stone-500 text-sm mt-1 leading-5">{t('packsOrderNote')}</Text>
      {packs.map((pack) => (
        <View key={pack.id} className="py-3 border-b border-stone-100">
          <Text className="text-stone-900 font-semibold text-sm">
            {hasKey(`plans.addons.${pack.addonId}`) ? t(`addons.${pack.addonId}`) : pack.addonId}
          </Text>
          <Text className="text-stone-500 text-xs mt-0.5">
            {t('packRemaining', {
              remaining: formatNumber(pack.remainingUnits),
              purchased: formatNumber(pack.purchasedUnits),
              unit: unitLabel(pack.unit),
            })}
          </Text>
          <View className="mt-1.5">
            <Badge variant={expiresSoon(pack) ? 'warning' : 'default'}>{t('packExpires', { date: formatStoredDate(pack.expiresAt) })}</Badge>
          </View>
        </View>
      ))}
      <Text className="text-stone-500 text-xs mt-3">{t('packsNotInApp')}</Text>
    </View>
  );
}

/**
 * Website "Billing History", read-only: amount, date, invoice number, status.
 * No invoice / PDF / portal links — store rules forbid sending users to an
 * external payment page from the app.
 */
function BillingHistory({ storeBilled }: { storeBilled: boolean }) {
  const t = useT('settings.billing.history');
  const tc = useT('common');
  const { data: invoices, isLoading, isError, refetch, isRefetching } = useInvoices();

  return (
    <View className="mx-4 mt-4 mb-4 bg-white rounded-2xl border border-stone-100 p-4">
      <View className="flex-row items-center mb-1">
        <Ionicons name="receipt-outline" size={18} color={colors.stone[400]} />
        <Text className="font-bold text-stone-800 ms-2" accessibilityRole="header">
          {t('title')}
        </Text>
      </View>
      {isLoading ? (
        <View className="mt-3" accessibilityLabel={t('loading')}>
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} height={44} className="mb-2 rounded-xl" />
          ))}
        </View>
      ) : isError ? (
        <View className="items-center py-6">
          <Ionicons name="alert-circle-outline" size={28} color={colors.error.DEFAULT} />
          <Text className="text-stone-500 text-sm mt-2 text-center">{t('loadError')}</Text>
          <TouchableOpacity
            onPress={() => void refetch()}
            disabled={isRefetching}
            className="mt-2 px-4 py-3"
            accessibilityRole="button"
            accessibilityState={{ disabled: isRefetching }}
          >
            <Text className="text-brand-600 font-semibold">{isRefetching ? tc('loading') : t('retry')}</Text>
          </TouchableOpacity>
        </View>
      ) : invoices && invoices.length > 0 ? (
        <View className="mt-2">
          {invoices.map((inv, index) => (
            <View
              key={inv.id}
              className={['flex-row items-center justify-between py-3', index > 0 ? 'border-t border-stone-100' : ''].join(' ')}
              accessible
              accessibilityLabel={invoiceAccessibilityLabel(inv, formatStoredDate)}
            >
              <View className="flex-1 me-3">
                <Text className="text-stone-900 font-semibold text-sm">{invoiceAmount(inv)}</Text>
                <Text className="text-stone-500 text-xs mt-0.5" numberOfLines={1}>
                  {invoiceSubtitle(inv, formatStoredDate)}
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
          <Text className="text-stone-500 text-sm text-center">{t('empty')}</Text>
          {storeBilled ? <Text className="text-stone-400 text-xs text-center mt-1">{t('storeNote')}</Text> : null}
        </View>
      )}
    </View>
  );
}
