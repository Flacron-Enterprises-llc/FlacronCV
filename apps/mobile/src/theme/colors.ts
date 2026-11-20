import { Appearance } from 'react-native';
import { TOKENS, type Scheme } from './palette';

/**
 * RN props (Ionicons `color`, ActivityIndicator, RefreshControl, tabBar)
 * cannot take NativeWind classes. Values come from the same tokens as the
 * classes (src/theme/palette.ts), for the appearance the app STARTED in.
 * Surfaces that must follow a live appearance switch (tab bar, navigator
 * backgrounds) use `usePalette()` instead; icon colours update on next launch.
 * `white`, brand 300–600 and `chrome` are the same in both appearances.
 */
const scheme: Scheme = Appearance.getColorScheme() === 'dark' ? 'dark' : 'light';
const hex = (name: string) => `#${TOKENS[name]![scheme].split(' ').map((n) => Number(n).toString(16).padStart(2, '0')).join('')}`;

export const colors = {
  chrome: '#1e3a5f',
  white: '#ffffff',
  success: { DEFAULT: hex('--success'), bg: hex('--success-bg') },
  error: { DEFAULT: hex('--error'), bg: hex('--error-bg') },
  warning: { DEFAULT: hex('--warning'), bg: hex('--warning-bg') },
  stone: {
    100: hex('--stone-100'),
    200: hex('--stone-200'),
    300: hex('--stone-300'),
    400: hex('--stone-400'),
    500: hex('--stone-500'),
    700: hex('--stone-700'),
  },
  brand: {
    50: hex('--brand-50'),
    100: hex('--brand-100'),
    200: hex('--brand-200'),
    300: '#fdba74',
    400: '#fb923c',
    500: '#f97316',
    600: '#ea580c',
    700: hex('--brand-700'),
    800: hex('--brand-800'),
    900: hex('--brand-900'),
    950: hex('--brand-950'),
  },
} as const;
