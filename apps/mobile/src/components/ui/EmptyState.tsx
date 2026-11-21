import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { Text, View } from 'react-native';
import { colors } from '../../theme/colors';
import { Button } from './Button';

interface EmptyStateProps {
  icon?: keyof typeof Ionicons.glyphMap;
  title: string;
  description?: string;
  actionLabel?: string;
  onAction?: () => void;
}

/** Nothing here yet: a branded icon medallion, a short title and explanation, and one clear next step. */
export function EmptyState({ icon, title, description, actionLabel, onAction }: EmptyStateProps) {
  return (
    <View className="flex-1 items-center justify-center px-8 py-16">
      {icon && (
        <View className="mb-5 h-24 w-24 items-center justify-center rounded-full bg-brand-50">
          <View className="h-16 w-16 items-center justify-center rounded-full bg-brand-100">
            <Ionicons name={icon} size={30} color={colors.brand[600]} />
          </View>
        </View>
      )}
      <Text className="mb-2 text-center text-xl font-black text-ink">{title}</Text>
      {description && (
        <Text className="mb-6 text-center leading-5 text-stone-600">{description}</Text>
      )}
      {actionLabel && onAction && (
        <Button variant="primary" pill onPress={onAction} className="px-7">
          {actionLabel}
        </Button>
      )}
    </View>
  );
}
