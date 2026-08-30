import React from 'react';
import { Text, View } from 'react-native';

type BadgeVariant = 'default' | 'success' | 'warning' | 'danger' | 'info' | 'brand';

interface BadgeProps {
  children: React.ReactNode;
  variant?: BadgeVariant;
  size?: 'sm' | 'md';
}

const variantBg: Record<BadgeVariant, string> = {
  default: 'bg-stone-100',
  success: 'bg-green-100',
  warning: 'bg-amber-100',
  danger: 'bg-red-100',
  info: 'bg-blue-100',
  brand: 'bg-brand-100',
};

const variantText: Record<BadgeVariant, string> = {
  default: 'text-stone-700',
  success: 'text-green-700',
  warning: 'text-amber-700',
  danger: 'text-red-700',
  info: 'text-blue-700',
  brand: 'text-brand-700',
};

export function Badge({ children, variant = 'default', size = 'sm' }: BadgeProps) {
  return (
    <View
      className={[
        'rounded-full items-center justify-center self-start',
        variantBg[variant],
        size === 'sm' ? 'px-2 py-0.5' : 'px-3 py-1',
      ].join(' ')}
    >
      <Text
        className={[
          variantText[variant],
          size === 'sm' ? 'text-xs font-medium' : 'text-sm font-medium',
        ].join(' ')}
      >
        {children}
      </Text>
    </View>
  );
}
