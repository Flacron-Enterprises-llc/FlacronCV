import { Ionicons } from '@expo/vector-icons';
import React, { useState } from 'react';
import { Text, TouchableOpacity, View } from 'react-native';
import { Badge } from '../ui/Badge';
import { useT } from '../../i18n';
import {
  COMPARISON_ROWS,
  DEFINED_UNITS,
  PRICING_PLANS,
  RECOMMENDED_PLAN,
  cardFacts,
  cardPrice,
  cellState,
  cellText,
  planName,
  rowLabel,
  stateLabel,
  type BillingInterval,
  type FeatureState,
  type PlanId,
} from '../../lib/plan-catalog';
import { colors } from '../../theme/colors';

/**
 * The five plans as the website's pricing page shows them (PlanCards,
 * PlanComparison, "What each unit means"), built from the shared catalog.
 * What a card's button does is decided by the screen (`action`), so the same
 * cards serve the in-app purchase and the "Coming soon" build.
 */

export function FeatureStateBadge({ state }: { state: FeatureState }) {
  const label = stateLabel(state);
  if (!label) return null;
  return (
    <View className="mt-1">
      <Badge variant={state === 'coming_soon' ? 'warning' : 'default'}>{label}</Badge>
    </View>
  );
}

export function IntervalToggle({ value, onChange }: { value: BillingInterval; onChange: (next: BillingInterval) => void }) {
  const t = useT('plans');
  return (
    <View className="bg-surface rounded-2xl border border-stone-100 p-1 flex-row" accessibilityRole="tablist" accessibilityLabel={t('intervalLabel')}>
      {(['monthly', 'annual'] as const).map((interval) => {
        const selected = value === interval;
        return (
          <TouchableOpacity
            key={interval}
            onPress={() => onChange(interval)}
            className={`flex-1 min-h-[44px] rounded-xl items-center justify-center ${selected ? 'bg-brand-600' : ''}`}
            accessibilityRole="tab"
            accessibilityState={{ selected }}
          >
            <Text className={selected ? 'text-white font-bold' : 'text-stone-600 font-medium'}>{t(interval)}</Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

/** What the card's bottom area shows. */
export type PlanCardAction =
  | { kind: 'current' }
  | { kind: 'buy'; busy: boolean; disabled?: boolean; onPress: () => void }
  | { kind: 'coming_soon' }
  | { kind: 'contact_sales'; onPress: () => void }
  | { kind: 'none' };

export function PlanCard({
  plan,
  interval,
  action,
  isCurrent,
  careerEnabled,
  storePrice,
  hasFreeTrial = false,
}: {
  plan: PlanId;
  interval: BillingInterval;
  action: PlanCardAction;
  isCurrent: boolean;
  careerEnabled: boolean;
  /** The store's localized price for the product, when loaded. */
  storePrice?: string | null;
  hasFreeTrial?: boolean;
}) {
  const t = useT('plans');
  const recommended = plan === RECOMMENDED_PLAN;
  const price = cardPrice(plan, interval, storePrice);
  const name = planName(plan);
  return (
    <View
      className={`rounded-2xl p-5 mb-4 bg-surface ${recommended ? 'border-2 border-brand-500' : isCurrent ? 'border-2 border-success' : 'border border-stone-200'}`}
      accessibilityLabel={name}
    >
      <View className="flex-row items-center flex-wrap gap-2">
        <Text className="text-xl font-bold text-stone-900 me-1" accessibilityRole="header">
          {name}
        </Text>
        {isCurrent ? <Badge variant="success">{t('currentPlan')}</Badge> : null}
      </View>
      {recommended ? (
        <View className="mt-2">
          <Badge variant="brand">{t('recommended')}</Badge>
        </View>
      ) : null}
      <Text className="text-stone-500 text-sm mt-2 leading-5">{t(`positioning.${plan}`)}</Text>

      <View className="mt-4 flex-row flex-wrap items-baseline">
        <Text className="text-3xl font-black text-stone-900 me-1">{price.headline}</Text>
        <Text className="text-stone-500 text-sm">{price.suffix}</Text>
      </View>
      {price.notes.map((note) => (
        <Text key={note} className="text-stone-500 text-xs mt-1 leading-4">
          {note}
        </Text>
      ))}
      {hasFreeTrial ? <Text className="text-success text-xs font-semibold mt-1 leading-4">{t('card.trialAvailable')}</Text> : null}

      <View className="mt-4">
        {cardFacts(plan, careerEnabled).map((fact) => (
          <View key={fact.label} className="py-1.5 border-b border-stone-100" accessible accessibilityLabel={`${fact.label}: ${fact.value}`}>
            <View className="flex-row items-start justify-between">
              <Text className="text-stone-500 text-sm flex-1 me-3 leading-5">{fact.label}</Text>
              <Text className="text-stone-900 text-sm font-semibold shrink leading-5" style={{ maxWidth: '55%' }}>
                {fact.value}
              </Text>
            </View>
            <FeatureStateBadge state={fact.state} />
          </View>
        ))}
      </View>

      <View className="mt-4 gap-2">
        <CardAction plan={plan} action={action} />
      </View>
    </View>
  );
}

function CardAction({ plan, action }: { plan: PlanId; action: PlanCardAction }) {
  const t = useT('plans');
  const name = planName(plan);
  switch (action.kind) {
    case 'buy': {
      const disabled = action.busy || !!action.disabled;
      return (
        <TouchableOpacity
          onPress={action.onPress}
          disabled={disabled}
          className={`rounded-xl min-h-[48px] items-center justify-center px-4 ${plan === RECOMMENDED_PLAN ? 'bg-brand-600' : 'bg-stone-800'} ${disabled ? 'opacity-50' : ''}`}
          accessibilityRole="button"
          accessibilityState={{ disabled, busy: action.busy }}
        >
          <Text className="text-white font-bold text-center">{action.busy ? t('card.buying') : t('card.choose', { plan: name })}</Text>
        </TouchableOpacity>
      );
    }
    case 'coming_soon':
      return (
        <View className="rounded-xl border border-dashed border-stone-300 min-h-[44px] items-center justify-center px-4">
          <Text className="text-stone-600 font-semibold text-sm text-center">{t('card.comingSoon')}</Text>
        </View>
      );
    case 'contact_sales':
      return (
        <>
          <Text className="text-stone-500 text-xs leading-4">{t('card.businessNotInApp')}</Text>
          <TouchableOpacity
            onPress={action.onPress}
            className="rounded-xl border border-brand-600 min-h-[48px] items-center justify-center px-4"
            accessibilityRole="button"
          >
            <Text className="text-brand-700 font-bold text-center">{t('card.contactSales')}</Text>
          </TouchableOpacity>
        </>
      );
    default:
      return null;
  }
}

/**
 * Compact comparison: pick a plan, read every row for it (the website's
 * comparison table, one plan at a time so a 360 px phone never scrolls sideways).
 */
export function PlanComparisonList({
  careerEnabled,
  initialPlan,
}: {
  careerEnabled: boolean;
  initialPlan?: PlanId | null;
}) {
  const t = useT('plans');
  const [shown, setShown] = useState<PlanId>(initialPlan ?? RECOMMENDED_PLAN);
  return (
    <View className="bg-surface rounded-2xl border border-stone-100 p-4">
      <Text className="font-bold text-stone-900 text-lg" accessibilityRole="header">
        {t('compareTitle')}
      </Text>
      <Text className="text-stone-500 text-sm mt-1 leading-5">{t('compareIntro')}</Text>
      <View className="flex-row flex-wrap gap-2 mt-3" accessibilityRole="tablist" accessibilityLabel={t('pickPlan')}>
        {PRICING_PLANS.map((plan) => {
          const selected = plan === shown;
          return (
            <TouchableOpacity
              key={plan}
              onPress={() => setShown(plan)}
              className={`rounded-full px-4 min-h-[44px] items-center justify-center border ${selected ? 'bg-brand-600 border-brand-600' : 'bg-surface border-stone-200'}`}
              accessibilityRole="tab"
              accessibilityState={{ selected }}
            >
              <Text className={`text-sm font-semibold ${selected ? 'text-white' : 'text-stone-800'}`}>{planName(plan)}</Text>
            </TouchableOpacity>
          );
        })}
      </View>
      <View className="mt-3">
        {COMPARISON_ROWS.map((row) => {
          const value = cellText(row, shown);
          const state = cellState(row, shown, careerEnabled);
          return (
            <View key={row} className="py-2 border-b border-stone-100" accessible accessibilityLabel={`${rowLabel(row)}: ${value.text}`}>
              <View className="flex-row items-start">
                <Ionicons
                  name={value.included ? 'checkmark-circle' : 'remove-circle-outline'}
                  size={16}
                  color={value.included ? colors.brand[600] : colors.stone[300]}
                  style={{ marginEnd: 8, marginTop: 2 }}
                />
                <Text className="flex-1 text-stone-700 text-sm leading-5 me-2">{rowLabel(row)}</Text>
                <Text
                  className={`text-sm leading-5 font-semibold shrink ${value.included ? 'text-stone-900' : 'text-stone-400'}`}
                  style={{ maxWidth: '45%' }}
                >
                  {value.text}
                </Text>
              </View>
              {value.included ? (
                <View style={{ marginStart: 24 }}>
                  <FeatureStateBadge state={state} />
                </View>
              ) : null}
            </View>
          );
        })}
      </View>
      {shown === 'business' ? <Text className="text-stone-500 text-xs mt-3 leading-4">{t('pooledNote')}</Text> : null}
      <Text className="text-stone-500 text-xs mt-3 leading-4">{t('usageVsCapacity')}</Text>
      <Text className="text-stone-500 text-xs mt-2 leading-4">{t('everyPlanNote')}</Text>
      <View className="mt-3">
        <Text className="text-stone-700 text-xs font-semibold">{t('stateLegend')}</Text>
        <Text className="text-stone-500 text-xs mt-1 leading-4">
          {[t('state.comingSoon'), t('stateComingSoonDesc')].join(': ')}
        </Text>
        <Text className="text-stone-500 text-xs mt-1 leading-4">
          {[t('state.providerDependent'), t('stateProviderDesc')].join(': ')}
        </Text>
      </View>
    </View>
  );
}

/** "What each unit means" (website DEFINED_UNITS), collapsed by default. */
export function PlanDefinitions() {
  const t = useT('plans');
  const [open, setOpen] = useState(false);
  return (
    <View className="bg-surface rounded-2xl border border-stone-100 p-4">
      <TouchableOpacity
        onPress={() => setOpen((v) => !v)}
        className="flex-row items-center justify-between min-h-[44px]"
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
      >
        <Text className="font-bold text-stone-900 text-lg flex-1 me-2" accessibilityRole="header">
          {t('definitionsTitle')}
        </Text>
        <Ionicons name={open ? 'chevron-up' : 'chevron-down'} size={20} color={colors.stone[500]} />
      </TouchableOpacity>
      {open ? (
        <View className="mt-2">
          {DEFINED_UNITS.map((unit) => (
            <View key={unit} className="py-2 border-b border-stone-100">
              <Text className="text-stone-900 text-sm font-semibold">{t(`units.${unit}`)}</Text>
              <Text className="text-stone-600 text-sm leading-5 mt-0.5">{t(`definitions.${unit}`)}</Text>
            </View>
          ))}
          <Text className="text-stone-500 text-xs mt-3 leading-4">{t('chargingRules')}</Text>
        </View>
      ) : null}
    </View>
  );
}

/** Terms shown beneath every set of plan cards, before any purchase. */
export function PlanTermsNote({ storePrices }: { storePrices: boolean }) {
  const t = useT('plans');
  const tp = useT('subscription.paywall');
  return (
    <View className="mt-2 gap-1">
      <Text className="text-stone-500 text-xs leading-4">{t('autoRenewNote')}</Text>
      <Text className="text-stone-500 text-xs leading-4">{t('annualTermsNote')}</Text>
      <Text className="text-stone-500 text-xs leading-4">{storePrices ? t('storePricesNote') : t('taxesNote')}</Text>
      {storePrices ? <Text className="text-stone-500 text-xs leading-4">{tp('storeNote')}</Text> : null}
    </View>
  );
}
