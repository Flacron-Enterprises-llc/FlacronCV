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

export function EmptyState({ icon, title, description, actionLabel, onAction }: EmptyStateProps) {
  return (
    <View className="flex-1 items-center justify-center px-8 py-16">
      {icon && (
        <View className="w-20 h-20 rounded-full bg-stone-100 items-center justify-center mb-4">
          <Ionicons name={icon} size={36} color={colors.stone[400]} />
        </View>
      )}
      <Text className="text-xl font-bold text-stone-800 text-center mb-2">{title}</Text>
      {description && (
        <Text className="text-stone-500 text-center mb-6 leading-5">{description}</Text>
      )}
      {actionLabel && onAction && (
        <Button variant="primary" onPress={onAction}>
          {actionLabel}
        </Button>
      )}
    </View>
  );
}
