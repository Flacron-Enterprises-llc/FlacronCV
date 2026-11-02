/**
 * Canonical hex values. Data only: no React, no CSS import, no Tailwind.
 * Mobile imports this file as `@flacroncv/ui/tokens`.
 * `tokens.css` must use the same figures.
 * See docs/DESIGN_SYSTEM.md.
 * `orangeText` (#D63D00) is approved for small text and links (Rodrigue, 16 October 2026).
 * Navy hover, muted, and dark surfaces are ASSUMED.
 */

export const color = {
  navy: '#002B62',
  navyHover: '#001F48',
  orange: '#FF4A00',
  orangeText: '#D63D00',
  orangeTint: '#FFF1EB',
  white: '#FFFFFF',
  muted: '#3E5270',
  border: '#D5DDE8',
  wash: '#F4F7FB',
  danger: '#B91C1C',
  success: '#15803D',
  warning: '#B45309',
  dark: {
    background: '#07111F',
    surface: '#0E1C33',
    text: '#F4F7FB',
    muted: '#C5D0DE',
    border: '#24344C',
  },
} as const;

export const fontFamily = {
  sans: 'Inter, system-ui, sans-serif',
  arabic: 'Noto Sans Arabic, sans-serif',
  urdu: 'Noto Nastaliq Urdu, sans-serif',
} as const;

export const fontSize = {
  xs: { size: '0.75rem', lineHeight: '1rem' },
  sm: { size: '0.875rem', lineHeight: '1.25rem' },
  base: { size: '1rem', lineHeight: '1.5rem' },
  lg: { size: '1.125rem', lineHeight: '1.75rem' },
  xl: { size: '1.25rem', lineHeight: '1.75rem' },
  '2xl': { size: '1.5rem', lineHeight: '2rem' },
  '3xl': { size: '1.875rem', lineHeight: '2.25rem' },
  '4xl': { size: '2.25rem', lineHeight: '2.75rem' },
} as const;

export const space = {
  1: '0.25rem',
  2: '0.5rem',
  3: '0.75rem',
  4: '1rem',
  6: '1.5rem',
  8: '2rem',
  12: '3rem',
  16: '4rem',
} as const;

export const radius = {
  sm: '0.375rem',
  md: '0.5rem',
  lg: '0.75rem',
} as const;

/** Copied from V1 `apps/web/tailwind.config.ts`. */
export const shadow = {
  xs: '0 1px 2px 0 rgb(17 24 39 / 0.05)',
  sm: '0 1px 2px 0 rgb(17 24 39 / 0.04), 0 1px 3px 0 rgb(17 24 39 / 0.06)',
  md: '0 2px 4px -2px rgb(17 24 39 / 0.06), 0 6px 12px -3px rgb(17 24 39 / 0.08)',
  lg: '0 4px 8px -4px rgb(17 24 39 / 0.06), 0 14px 28px -6px rgb(17 24 39 / 0.10)',
  xl: '0 8px 16px -6px rgb(17 24 39 / 0.08), 0 28px 48px -12px rgb(17 24 39 / 0.14)',
} as const;

export const touchTargetMin = '2.75rem';

export type RecordState = 'draft' | 'confirmed' | 'submitted';
