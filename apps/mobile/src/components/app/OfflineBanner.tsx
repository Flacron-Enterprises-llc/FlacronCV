import { Ionicons } from '@expo/vector-icons';
import { useNetworkState } from 'expo-network';
import React, { useEffect, useRef, useState } from 'react';
import { Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useT } from '../../i18n';
import { colors } from '../../theme/colors';

/** Offline only when the OS says so for sure (unknown / still checking is not offline). */
export function isOffline(state: { isConnected?: boolean; isInternetReachable?: boolean | null }): boolean {
  return state.isConnected === false || state.isInternetReachable === false;
}

/**
 * Floating pill over the app: "You're offline" while there is no connection,
 * then "Back online" for a moment. It never blocks touches, and it is
 * announced politely to screen readers.
 */
export function OfflineBanner() {
  const t = useT('common');
  const insets = useSafeAreaInsets();
  const offline = isOffline(useNetworkState());
  const [showBack, setShowBack] = useState(false);
  const wasOffline = useRef(false);

  useEffect(() => {
    if (offline) {
      wasOffline.current = true;
      setShowBack(false);
      return;
    }
    if (!wasOffline.current) return;
    wasOffline.current = false;
    setShowBack(true);
    const timer = setTimeout(() => setShowBack(false), 2500);
    return () => clearTimeout(timer);
  }, [offline]);

  if (!offline && !showBack) return null;
  return (
    <View
      pointerEvents="none"
      style={{ position: 'absolute', left: 16, right: 16, bottom: insets.bottom + 84, alignItems: 'center' }}
    >
      <View
        className="flex-row items-center rounded-full px-4 py-2.5"
        // Constant colours: white text must stay readable in light and dark appearance.
        style={{ backgroundColor: offline ? colors.navy : '#15803d', shadowColor: '#000', shadowOpacity: 0.2, shadowRadius: 12, shadowOffset: { width: 0, height: 6 }, elevation: 6 }}
        accessibilityLiveRegion="polite"
        accessibilityRole="alert"
      >
        <Ionicons name={offline ? 'cloud-offline-outline' : 'cloud-done-outline'} size={18} color={offline ? colors.brand[300] : '#ffffff'} />
        <Text className="ms-2 text-sm font-semibold text-white">{offline ? t('offlineBanner') : t('backOnline')}</Text>
      </View>
    </View>
  );
}
