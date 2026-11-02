import { Redirect, Stack } from 'expo-router';
import React from 'react';
import { CAREER_ENABLED } from '../../../src/config/career';

/** Career tools stack. A build without the career integration has no career screens at all. */
export default function CareerLayout() {
  if (!CAREER_ENABLED) return <Redirect href="/(dashboard)" />;
  return <Stack screenOptions={{ headerShown: false }} />;
}
