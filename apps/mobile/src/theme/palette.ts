import { useColorScheme, vars } from 'nativewind';

/**
 * Light and dark values for every colour token that changes with the system
 * appearance. Values are "R G B" so Tailwind can apply opacity
 * (`rgb(var(--x) / <alpha-value>)`, see tailwind.config.js).
 *
 * Constant on purpose (not here): `white` (text on orange buttons), brand
 * 300–600 (buttons, accents) and `chrome`. Light values equal the previous
 * fixed palette, except error text: #b91c1c (was #dc2626, only 4.41:1 on its
 * tint, below WCAG AA).
 */
export type Scheme = 'light' | 'dark';

export const TOKENS: Readonly<Record<string, Readonly<Record<Scheme, string>>>> = {
  // Cards, sheets, inputs (formerly the white background class).
  '--surface': { light: '255 255 255', dark: '28 25 23' },
  // Neutral scale: inverted for dark (page background near-black, text light).
  '--stone-50': { light: '250 250 249', dark: '12 10 9' },
  '--stone-100': { light: '245 245 244', dark: '41 37 36' },
  '--stone-200': { light: '231 229 228', dark: '68 64 60' },
  '--stone-300': { light: '214 211 209', dark: '87 83 78' },
  '--stone-400': { light: '168 162 158', dark: '120 113 108' },
  '--stone-500': { light: '120 113 108', dark: '168 162 158' },
  '--stone-600': { light: '87 83 78', dark: '214 211 209' },
  '--stone-700': { light: '68 64 60', dark: '231 229 228' },
  '--stone-800': { light: '41 37 36', dark: '245 245 244' },
  '--stone-900': { light: '28 25 23', dark: '250 250 249' },
  '--stone-950': { light: '12 10 9', dark: '255 255 255' },
  // Brand tints (backgrounds) and brand text tones.
  '--brand-50': { light: '255 247 237', dark: '43 20 8' },
  '--brand-100': { light: '255 237 213', dark: '67 20 7' },
  '--brand-200': { light: '254 215 170', dark: '124 45 18' },
  '--brand-700': { light: '194 65 12', dark: '253 186 116' },
  '--brand-800': { light: '154 52 18', dark: '254 215 170' },
  '--brand-900': { light: '124 45 18', dark: '255 237 213' },
  '--brand-950': { light: '67 20 7', dark: '255 247 237' },
  // Semantic text and tinted backgrounds.
  '--success': { light: '21 128 61', dark: '74 222 128' },
  '--success-bg': { light: '240 253 244', dark: '5 46 22' },
  '--error': { light: '185 28 28', dark: '248 113 113' },
  '--error-bg': { light: '254 242 242', dark: '69 10 10' },
  '--warning': { light: '180 83 9', dark: '251 191 36' },
  '--warning-bg': { light: '254 243 199', dark: '69 26 3' },
};

function tokenValues(scheme: Scheme): Record<string, string> {
  return Object.fromEntries(Object.entries(TOKENS).map(([name, v]) => [name, v[scheme]]));
}

/** `:root` defaults (light) for tailwind.config.js. */
export const LIGHT_VALUES = tokenValues('light');

/** Style objects that set every token for a scheme; applied once at the app root. */
export const THEME_VARS = { light: vars(tokenValues('light')), dark: vars(tokenValues('dark')) } as const;

const hex = (rgb: string) => `#${rgb.split(' ').map((n) => Number(n).toString(16).padStart(2, '0')).join('')}`;
const pick = (scheme: Scheme, name: string) => hex(TOKENS[name]![scheme]);

/** Hex values for React Native props that cannot take classes (tab bar, spinners, navigator backgrounds). */
export function paletteFor(scheme: Scheme) {
  return {
    scheme,
    surface: pick(scheme, '--surface'),
    page: pick(scheme, '--stone-50'),
    border: pick(scheme, '--stone-100'),
    skeleton: pick(scheme, '--stone-200'),
    muted: pick(scheme, '--stone-400'),
    text: pick(scheme, '--stone-900'),
  };
}
export type Palette = ReturnType<typeof paletteFor>;

/** The current system appearance (NativeWind follows the device setting). */
export function useScheme(): Scheme {
  return useColorScheme().colorScheme === 'dark' ? 'dark' : 'light';
}

export function usePalette(): Palette {
  return paletteFor(useScheme());
}
