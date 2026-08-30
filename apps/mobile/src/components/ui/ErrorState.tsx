import React from 'react';
import { Text, View } from 'react-native';
import { Button } from './Button';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../../theme/colors';

interface ErrorStateProps {
  message?: string;
  onRetry?: () => void;
}

export function ErrorState({ message = 'Something went wrong', onRetry }: ErrorStateProps) {
  return (
    <View className="flex-1 items-center justify-center px-8 py-16">
      <View className="w-16 h-16 rounded-full bg-error-bg items-center justify-center mb-4">
        <Ionicons name="alert-circle-outline" size={32} color={colors.error.DEFAULT} />
      </View>
      <Text className="text-lg font-semibold text-stone-800 text-center mb-2">Oops!</Text>
      <Text className="text-stone-500 text-center mb-6">{message}</Text>
      {onRetry && (
        <Button variant="outline" onPress={onRetry}>
          Try Again
        </Button>
      )}
    </View>
  );
}
