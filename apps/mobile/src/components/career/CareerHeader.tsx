import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React from 'react';
import { Text, TouchableOpacity, View } from 'react-native';
import { useT } from '../../i18n';
import { RTL_FLIP } from '../../i18n/native';
import { colors } from '../../theme/colors';

/** Same header geometry as the Job Tracker screens: back arrow, title, optional subtitle. */
export function CareerHeader({ title, subtitle, right }: { title: string; subtitle?: string; right?: React.ReactNode }) {
  const router = useRouter();
  const t = useT('career');
  return (
    <View className="px-5 pt-4 pb-3 bg-surface border-b border-stone-100">
      <View className="flex-row items-center">
        <TouchableOpacity
          onPress={() => router.back()}
          className="me-3 h-11 w-11 -ms-2 items-center justify-center"
          accessibilityRole="button"
          accessibilityLabel={t('header.goBack')}
        >
          <Ionicons name="arrow-back" size={22} color={colors.stone[700]} style={RTL_FLIP} />
        </TouchableOpacity>
        <View className="flex-1">
          <Text className="text-xl font-black text-stone-900" accessibilityRole="header" numberOfLines={1}>
            {title}
          </Text>
          {subtitle ? (
            <Text className="text-stone-500 text-sm mt-0.5" numberOfLines={2}>
              {subtitle}
            </Text>
          ) : null}
        </View>
        {right}
      </View>
    </View>
  );
}

/** Small uppercase status pill used for "Sample", "Test entitlement", "On the website". */
export function Pill({ label, tone = 'default' }: { label: string; tone?: 'default' | 'brand' | 'warning' | 'success' }) {
  const bg = { default: 'bg-stone-100', brand: 'bg-brand-100', warning: 'bg-warning-bg', success: 'bg-success-bg' }[tone];
  const fg = { default: 'text-stone-600', brand: 'text-brand-700', warning: 'text-warning', success: 'text-success' }[tone];
  return (
    <View className={`${bg} self-start rounded-full px-2.5 py-0.5`}>
      <Text className={`${fg} text-[10px] font-bold tracking-wide`}>{label}</Text>
    </View>
  );
}
