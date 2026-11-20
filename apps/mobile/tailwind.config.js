/** @type {import('tailwindcss').Config} */
// Colours that change with the system appearance are CSS variables; their light
// and dark values live in src/theme/palette.ts (THEME_VARS is applied at the app
// root). Light defaults below equal the previous fixed palette.
const v = (name) => `rgb(var(${name}) / <alpha-value>)`;

module.exports = {
  content: [
    './app/**/*.{js,jsx,ts,tsx}',
    './src/**/*.{js,jsx,ts,tsx}',
  ],
  presets: [require('nativewind/preset')],
  theme: {
    extend: {
      colors: {
        surface: v('--surface'),
        stone: {
          50: v('--stone-50'),
          100: v('--stone-100'),
          200: v('--stone-200'),
          300: v('--stone-300'),
          400: v('--stone-400'),
          500: v('--stone-500'),
          600: v('--stone-600'),
          700: v('--stone-700'),
          800: v('--stone-800'),
          900: v('--stone-900'),
          950: v('--stone-950'),
        },
        brand: {
          50: v('--brand-50'),
          100: v('--brand-100'),
          200: v('--brand-200'),
          300: '#fdba74',
          400: '#fb923c',
          500: '#f97316',
          600: '#ea580c',
          700: v('--brand-700'),
          800: v('--brand-800'),
          900: v('--brand-900'),
          950: v('--brand-950'),
        },
        chrome: '#1e3a5f',
        success: { DEFAULT: v('--success'), bg: v('--success-bg') },
        error: { DEFAULT: v('--error'), bg: v('--error-bg') },
        warning: { DEFAULT: v('--warning'), bg: v('--warning-bg') },
      },
    },
  },
  plugins: [
    // Light values on :root so anything rendered outside the themed root still has colours.
    ({ addBase }) =>
      addBase({
        ':root': {
          '--surface': '255 255 255',
          '--stone-50': '250 250 249', '--stone-100': '245 245 244', '--stone-200': '231 229 228',
          '--stone-300': '214 211 209', '--stone-400': '168 162 158', '--stone-500': '120 113 108',
          '--stone-600': '87 83 78', '--stone-700': '68 64 60', '--stone-800': '41 37 36',
          '--stone-900': '28 25 23', '--stone-950': '12 10 9',
          '--brand-50': '255 247 237', '--brand-100': '255 237 213', '--brand-200': '254 215 170',
          '--brand-700': '194 65 12', '--brand-800': '154 52 18', '--brand-900': '124 45 18', '--brand-950': '67 20 7',
          '--success': '21 128 61', '--success-bg': '240 253 244',
          '--error': '185 28 28', '--error-bg': '254 242 242',
          '--warning': '180 83 9', '--warning-bg': '254 243 199',
        },
      }),
  ],
};
