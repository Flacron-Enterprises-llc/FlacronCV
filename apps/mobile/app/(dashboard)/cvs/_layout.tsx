import { Stack } from 'expo-router';
import { usePalette } from '../../../src/theme/palette';
import React from 'react';

export default function CVsLayout() {
  const palette = usePalette();
  return <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: palette.page } }} />;
}
