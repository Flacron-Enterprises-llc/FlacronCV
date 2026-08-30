import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { Text, TouchableOpacity, View } from 'react-native';
import { PlanConfig } from '../../types/subscription.types';
import { BillingInterval } from '../../types/enums';
import { colors } from '../../theme/colors';

interface PlanCardProps {
  config: PlanConfig;
  interval: BillingInterval;
  isCurrentPlan?: boolean;
  isLoading?: boolean;
  onSelect: () => void;
}

/** Mobile-only branding; shared-types / web feature lines stay unchanged. */
function displayPlanFeature(feature: string): string {
  return feature
    .replace(/\bAI Credits\b/g, 'Engine Credits')
    .replace(/\bAll AI career tools\b/g, 'All Flacron Engine career tools');
}

export function PlanCard({
  config,
  interval,
  isCurrentPlan = false,
  isLoading = false,
  onSelect,
}: PlanCardProps) {
  const price =
    interval === BillingInterval.MONTH ? config.priceMonthly : config.priceYearly / 12;
  const isPro = config.plan === 'pro';
  const isEnterprise = config.plan === 'enterprise';

  return (
    <TouchableOpacity
      onPress={!isCurrentPlan ? onSelect : undefined}
      activeOpacity={0.85}
      className={[
        'rounded-2xl border-2 p-5 mb-4',
        isPro ? 'border-brand-500 bg-brand-50' : 'border-stone-200 bg-white',
      ].join(' ')}
    >
      {isPro && (
        <View className="absolute -top-3 left-0 right-0 items-center">
          <View className="bg-brand-500 px-4 py-1 rounded-full">
            <Text className="text-white text-xs font-bold">MOST POPULAR</Text>
          </View>
        </View>
      )}

      <View className="flex-row items-center justify-between mb-3">
        <Text className="text-xl font-bold text-stone-900 capitalize">{config.plan}</Text>
        {isCurrentPlan && (
          <View className="bg-success-bg px-3 py-1 rounded-full">
            <Text className="text-success text-xs font-semibold">Current Plan</Text>
          </View>
        )}
      </View>

      <View className="flex-row items-end mb-4">
        {config.priceMonthly === 0 ? (
          <Text className="text-3xl font-black text-stone-900">Free</Text>
        ) : (
          <>
            <Text className="text-3xl font-black text-stone-900">
              ${price.toFixed(2)}
            </Text>
            <Text className="text-stone-500 ml-1 mb-1">/mo</Text>
          </>
        )}
      </View>

      {interval === BillingInterval.YEAR && config.priceYearly > 0 && (
        <Text className="text-xs text-stone-500 -mt-2 mb-3">
          Billed ${config.priceYearly.toFixed(2)}/year
        </Text>
      )}

      <View className="mb-4">
        {config.features.map((feature, i) => (
          <View key={i} className="flex-row items-center mb-2">
            <Ionicons
              name="checkmark-circle"
              size={16}
              color={
                isPro
                  ? colors.brand[600]
                  : isEnterprise
                    ? colors.chrome
                    : colors.success.DEFAULT
              }
            />
            <Text className="text-stone-700 ml-2 text-sm">{displayPlanFeature(feature)}</Text>
          </View>
        ))}
      </View>

      {!isCurrentPlan && config.priceMonthly > 0 && (
        <TouchableOpacity
          onPress={onSelect}
          disabled={isLoading}
          className={[
            'rounded-xl py-3 items-center',
            isPro ? 'bg-brand-600' : isEnterprise ? 'bg-chrome' : 'bg-stone-800',
            isLoading ? 'opacity-50' : '',
          ].join(' ')}
        >
          <Text className="text-white font-bold">
            {isLoading ? 'Loading...' : `Choose ${config.plan.charAt(0).toUpperCase() + config.plan.slice(1)}`}
          </Text>
        </TouchableOpacity>
      )}
    </TouchableOpacity>
  );
}
