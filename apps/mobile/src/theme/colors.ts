/**
 * RN props (Ionicons `color`, ActivityIndicator, RefreshControl, tabBar)
 * cannot take NativeWind classes. Keep brand/semantic hexes in lockstep with
 * `apps/mobile/tailwind.config.js`. Stone/white match Tailwind defaults (not
 * re-declared in that file).
 */
export const colors = {
  chrome: '#1e3a5f',
  white: '#ffffff',
  success: { DEFAULT: '#15803d', bg: '#f0fdf4' },
  error: { DEFAULT: '#dc2626', bg: '#fef2f2' },
  warning: { DEFAULT: '#b45309', bg: '#fef3c7' },
  stone: {
    100: '#f5f5f4',
    200: '#e7e5e4',
    300: '#d6d3d1',
    400: '#a8a29e',
    500: '#78716c',
    700: '#44403c',
  },
  brand: {
    50: '#fff7ed',
    100: '#ffedd5',
    200: '#fed7aa',
    300: '#fdba74',
    400: '#fb923c',
    500: '#f97316',
    600: '#ea580c',
    700: '#c2410c',
    800: '#9a3412',
    900: '#7c2d12',
    950: '#431407',
  },
} as const;
