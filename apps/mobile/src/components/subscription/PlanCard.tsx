import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { Text, TouchableOpacity, View } from 'react-native';
import { PlanConfig } from '../../types/subscription.types';
import { BillingInterval } from '../../types/enums';
import { colors } from '../../theme/colors';
import { formatCurrency, hasKey, useT } from '../../i18n';

type Translate = (key: string, params?: Record<string, string | number>) => string;

/**
 * Plan feature lines come from shared-types as English text. Map the known
 * shapes to `subscription.features.*` so they follow the app language; an
 * unknown line is shown as received.
 */
export function planFeatureLabel(feature: string, t: Translate): string {
  const counted: [RegExp, string][] = [
    [/^(\d+) CVs$/, 'features.cvs'],
    [/^(\d+) CVs\/month$/, 'features.cvsMonthly'],
    [/^(\d+) Cover Letters?$/, 'features.letters'],
    [/^(\d+) Cover Letters\/month$/, 'features.lettersMonthly'],
    [/^(\d+) Engine Credits$/, 'features.credits'],
    [/^(\d+) Engine Credits\/month$/, 'features.creditsMonthly'],
    [/^(\d+) exports$/, 'features.exports'],
  ];
  for (const [pattern, key] of counted) {
    const match = pattern.exec(feature);
    if (match) return t(key, { count: Number(match[1]) });
  }
  const fixed: Record<string, string> = {
    'Unlimited CVs': t('features.cvsUnlimited'),
    'Unlimited Cover Letters': t('features.lettersUnlimited'),
    'Unlimited exports': t('features.exportsUnlimited'),
    'PDF export': t('features.pdf'),
    'PDF & DOCX export': t('features.pdfDocx'),
    'Priority support': t('features.prioritySupport'),
    'All Flacron Engine career tools (ATS, Interview Prep, LinkedIn)': t('features.engineTools'),
    'Free templates only': t('features.templatesFree'),
    'Pro templates': t('features.templatesPro'),
    'All Pro templates': t('features.templatesAllPro'),
    'All templates': t('features.templatesAll'),
  };
  return fixed[feature] ?? feature;
}

interface PlanCardProps {
  config: PlanConfig;
  interval: BillingInterval;
  isCurrentPlan?: boolean;
  isLoading?: boolean;
  onSelect: () => void;
  /** Store-formatted price when IAP products are loaded; catalog price otherwise. */
  priceOverride?: string;
}

export function PlanCard({
  config,
  interval,
  isCurrentPlan = false,
  isLoading = false,
  onSelect,
  priceOverride,
}: PlanCardProps) {
  const t = useT('subscription');
  const ts = useT('settings');
  const planName = hasKey(`settings.plans.${config.plan}`)
    ? ts(`plans.${config.plan}`)
    : config.plan;
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
        <View className="absolute -top-3 start-0 end-0 items-center">
          <View className="bg-brand-500 px-4 py-1 rounded-full">
            <Text className="text-white text-xs font-bold">{t('planCard.mostPopular')}</Text>
          </View>
        </View>
      )}

      <View className="flex-row items-center justify-between mb-3">
        <Text className="text-xl font-bold text-stone-900 capitalize">{planName}</Text>
        {isCurrentPlan && (
          <View className="bg-success-bg px-3 py-1 rounded-full">
            <Text className="text-success text-xs font-semibold">{t('planCard.currentPlan')}</Text>
          </View>
        )}
      </View>

      <View className="flex-row items-end mb-4">
        {config.priceMonthly === 0 ? (
          <Text className="text-3xl font-black text-stone-900">{ts('plans.free')}</Text>
        ) : priceOverride ? (
          <Text className="text-3xl font-black text-stone-900">{priceOverride}</Text>
        ) : (
          <>
            <Text className="text-3xl font-black text-stone-900">
              {formatCurrency(price, 'usd')}
            </Text>
            <Text className="text-stone-500 ms-1 mb-1">{t('planCard.perMonth')}</Text>
          </>
        )}
      </View>

      {interval === BillingInterval.YEAR && config.priceYearly > 0 && !priceOverride && (
        <Text className="text-xs text-stone-500 -mt-2 mb-3">
          {t('planCard.billedYearly', { price: formatCurrency(config.priceYearly, 'usd') })}
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
            <Text className="text-stone-700 ms-2 text-sm">{planFeatureLabel(feature, t)}</Text>
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
            {isLoading ? t('planCard.loading') : t('planCard.choose', { plan: config.plan })}
          </Text>
        </TouchableOpacity>
      )}
    </TouchableOpacity>
  );
}
