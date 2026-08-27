import React, { useEffect, useRef } from 'react';
import { Animated, View, ViewProps } from 'react-native';

interface SkeletonProps extends ViewProps {
  width?: number | `${number}%`;
  height?: number;
  rounded?: boolean;
  className?: string;
}

export function Skeleton({ width, height = 16, rounded = false, className, style, ...props }: SkeletonProps) {
  const opacity = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    const animation = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, { toValue: 0.3, duration: 800, useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 1, duration: 800, useNativeDriver: true }),
      ]),
    );
    animation.start();
    return () => animation.stop();
  }, [opacity]);

  return (
    <Animated.View
      {...props}
      style={[
        {
          opacity,
          height,
          width: width ?? '100%',
          backgroundColor: '#e7e5e4',
          borderRadius: rounded ? 9999 : 8,
        },
        style,
      ]}
    />
  );
}

export function SkeletonCard() {
  return (
    <View className="bg-white rounded-2xl border border-stone-100 p-4 mb-3">
      <Skeleton height={20} width="60%" className="mb-2" />
      <Skeleton height={14} width="80%" className="mb-1" />
      <Skeleton height={14} width="50%" />
    </View>
  );
}
