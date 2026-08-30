import React from 'react';
import { Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../../theme/colors';

interface StatsCardProps {
  label: string;
  value: string | number;
  icon: keyof typeof Ionicons.glyphMap;
  subtitle?: string;
}

export function StatsCard({ label, value, icon, subtitle }: StatsCardProps) {
  return (
    <View className="flex-1 bg-white rounded-2xl border border-stone-100 p-4 shadow-sm">
      <View
        className="mb-3 h-10 w-10 items-center justify-center rounded-xl"
        style={{ backgroundColor: colors.brand[50] }}
      >
        <Ionicons name={icon} size={20} color={colors.brand[600]} />
      </View>
      <Text className="text-xl font-bold text-stone-900">{value}</Text>
      <Text className="text-sm font-medium text-stone-600">{label}</Text>
      {subtitle && <Text className="text-xs text-stone-400 mt-0.5">{subtitle}</Text>}
    </View>
  );
}
