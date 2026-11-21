import React from 'react';
import { View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Path } from 'react-native-svg';
import { colors } from '../../theme/colors';

/**
 * The FlacronCV brand curves: a navy band with an orange crescent along its
 * lower edge. The band fills the status-bar area, so screens that use it draw
 * edge to edge (status bar text stays light on navy). Both shapes stretch to
 * the screen width; heights stay fixed so text below never moves.
 */
export function BrandTopWave({ height = 92 }: { height?: number }) {
  const insets = useSafeAreaInsets();
  return (
    <View pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <View style={{ height: insets.top, backgroundColor: colors.navy }} />
      <Svg width="100%" height={height} viewBox="0 0 390 92" preserveAspectRatio="none">
        {/* Orange crescent first, navy over it: the orange shows only as a lip below the navy. */}
        <Path d="M0 74C120 40 270 26 390 34V64C292 50 150 60 0 92Z" fill={colors.brand[600]} />
        <Path d="M0 0H390V40C282 30 132 44 0 82Z" fill={colors.navy} />
      </Svg>
    </View>
  );
}

/** Closing curve for the bottom of a branded screen (sits under the last content). */
export function BrandBottomWave({ height = 72 }: { height?: number }) {
  const insets = useSafeAreaInsets();
  return (
    <View pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <Svg width="100%" height={height} viewBox="0 0 390 72" preserveAspectRatio="none">
        <Path d="M0 64C140 60 268 38 390 4V72H0Z" fill={colors.brand[600]} />
        <Path d="M0 72C150 70 282 50 390 22V72Z" fill={colors.navy} />
      </Svg>
      <View style={{ height: insets.bottom, backgroundColor: colors.navy }} />
    </View>
  );
}
