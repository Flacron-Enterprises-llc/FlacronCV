import { describe, expect, it, vi } from 'vitest';

vi.mock('expo-network', () => ({ useNetworkState: () => ({}) }));
vi.mock('@expo/vector-icons', () => ({ Ionicons: () => null }));
vi.mock('react-native', () => ({ Text: () => null, View: () => null }));
vi.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ bottom: 0 }) }));
vi.mock('../../i18n', () => ({ useT: () => (k: string) => k }));
vi.mock('../../theme/colors', () => ({ colors: { navy: '#10294f', brand: { 300: '#fdba74' } } }));

const { isOffline } = await import('./OfflineBanner');

describe('isOffline', () => {
  it('is offline only when the OS is sure', () => {
    expect(isOffline({ isConnected: false })).toBe(true);
    expect(isOffline({ isConnected: true, isInternetReachable: false })).toBe(true);
    expect(isOffline({ isConnected: true, isInternetReachable: true })).toBe(false);
    // Still checking / unknown: do not alarm anyone.
    expect(isOffline({})).toBe(false);
    expect(isOffline({ isConnected: true, isInternetReachable: null })).toBe(false);
  });
});
