import React from 'react';
import { Image } from 'react-native';
import { useScheme } from '../../theme/palette';

// Same artwork as the website header (apps/web/public/logo-ink-*.png): FC mark + FLACRONCV wordmark.
const ON_LIGHT = require('../../../assets/logo-wordmark.png');
const ON_DARK = require('../../../assets/logo-wordmark-light.png');
const RATIO = 1712 / 265;

/** The FlacronCV logo lock-up; navy ink on light, white ink on dark. */
export function BrandLogo({ width = 236 }: { width?: number }) {
  const scheme = useScheme();
  return (
    <Image
      source={scheme === 'dark' ? ON_DARK : ON_LIGHT}
      style={{ width, height: width / RATIO }}
      resizeMode="contain"
      accessibilityRole="image"
      accessibilityLabel="FlacronCV"
    />
  );
}
