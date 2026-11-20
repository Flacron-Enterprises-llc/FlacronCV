import React from 'react';
import { View, ViewProps } from 'react-native';

interface CardProps extends ViewProps {
  children: React.ReactNode;
  className?: string;
}

export function Card({ children, className, ...props }: CardProps) {
  return (
    <View
      {...props}
      className={[
        'rounded-2xl bg-surface border border-stone-100 shadow-sm p-4',
        className ?? '',
      ].join(' ')}
    >
      {children}
    </View>
  );
}
