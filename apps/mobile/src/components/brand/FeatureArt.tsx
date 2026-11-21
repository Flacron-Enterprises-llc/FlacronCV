import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { Text, View } from 'react-native';
import Svg, { Circle, Path } from 'react-native-svg';
import { colors } from '../../theme/colors';

type IconName = React.ComponentProps<typeof Ionicons>['name'];
type Satellite = { icon?: IconName; label?: string };

const SPOTS: Array<{ top: number; left: number }> = [
  { top: 18, left: 18 },
  { top: 28, left: 196 },
  { top: 150, left: 206 },
  { top: 160, left: 10 },
];

/**
 * Onboarding / empty-state art: a soft brand blob, a large white tile with the
 * feature icon, and small floating chips around it. Decorative only.
 */
export function FeatureArt({ icon, satellites = [], size = 260 }: { icon: IconName; satellites?: Satellite[]; size?: number }) {
  const scale = size / 260;
  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={{ width: size, height: size * 0.82, alignSelf: 'center' }}
    >
      <Svg width={size} height={size * 0.82} viewBox="0 0 260 214" style={{ position: 'absolute' }}>
        <Path
          d="M24 112C10 60 62 14 132 20C198 26 254 54 248 114C242 172 190 200 126 196C64 192 38 162 24 112Z"
          fill={colors.brand[100]}
        />
        <Circle cx={206} cy={30} r={20} fill="#fde68a" opacity={0.45} />
      </Svg>
      <View
        className="absolute items-center justify-center rounded-[28px] bg-surface"
        style={{
          width: 112 * scale,
          height: 112 * scale,
          top: 50 * scale,
          left: (size - 112 * scale) / 2,
          shadowColor: colors.navy,
          shadowOpacity: 0.14,
          shadowRadius: 18,
          shadowOffset: { width: 0, height: 10 },
          elevation: 6,
        }}
      >
        <View className="h-16 w-16 items-center justify-center rounded-2xl bg-brand-600" style={{ transform: [{ scale }] }}>
          <Ionicons name={icon} size={34} color="#ffffff" />
        </View>
      </View>
      {satellites.slice(0, SPOTS.length).map((sat, i) => {
        const spot = SPOTS[i]!;
        return (
          <View
            key={i}
            className="absolute flex-row items-center rounded-full bg-surface px-3 py-2"
            style={{
              top: spot.top * scale,
              left: spot.left * scale,
              shadowColor: colors.navy,
              shadowOpacity: 0.1,
              shadowRadius: 10,
              shadowOffset: { width: 0, height: 4 },
              elevation: 3,
            }}
          >
            {sat.icon ? <Ionicons name={sat.icon} size={16} color={i % 2 ? colors.navy : colors.brand[600]} /> : null}
            {sat.label ? (
              <Text className="text-xs font-bold text-ink" style={{ marginStart: sat.icon ? 6 : 0 }}>
                {sat.label}
              </Text>
            ) : null}
          </View>
        );
      })}
    </View>
  );
}
