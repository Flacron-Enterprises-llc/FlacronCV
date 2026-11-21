import { useFocusEffect } from 'expo-router';
import { useCallback } from 'react';
import { StatusBar } from 'react-native';
import { useScheme } from '../theme/palette';

/**
 * Light status-bar icons while a screen with a navy brand header is focused;
 * the appearance default (dark icons in light mode) comes back when it loses
 * focus. Tabs stay mounted, so a mounted <StatusBar> would leak onto them.
 */
export function useLightStatusBar(): void {
  const scheme = useScheme();
  useFocusEffect(
    useCallback(() => {
      StatusBar.setBarStyle('light-content', true);
      return () => StatusBar.setBarStyle(scheme === 'dark' ? 'light-content' : 'dark-content', true);
    }, [scheme]),
  );
}
