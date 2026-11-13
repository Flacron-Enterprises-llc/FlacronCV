import React from 'react';
import { Text, View } from 'react-native';
import { Button } from './Button';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../../theme/colors';
import { useT } from '../../i18n';

interface ErrorStateProps {
  message?: string;
  onRetry?: () => void;
}

export function ErrorState({ message, onRetry }: ErrorStateProps) {
  const t = useT('ui');
  return (
    <View className="flex-1 items-center justify-center px-8 py-16">
      <View className="w-16 h-16 rounded-full bg-error-bg items-center justify-center mb-4">
        <Ionicons name="alert-circle-outline" size={32} color={colors.error.DEFAULT} />
      </View>
      <Text className="text-lg font-semibold text-stone-800 text-center mb-2">{t('errorState.title')}</Text>
      <Text className="text-stone-500 text-center mb-6">{message ?? t('errorState.message')}</Text>
      {onRetry && (
        <Button variant="outline" onPress={onRetry}>
          {t('errorState.retry')}
        </Button>
      )}
    </View>
  );
}
