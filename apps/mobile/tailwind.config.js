/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './app/**/*.{js,jsx,ts,tsx}',
    './src/**/*.{js,jsx,ts,tsx}',
  ],
  presets: [require('nativewind/preset')],
  theme: {
    extend: {
      colors: {
        brand: {
          50:  '#fff7ed',
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
        chrome: '#1e3a5f',
        success: { DEFAULT: '#15803d', bg: '#f0fdf4' },
        error: { DEFAULT: '#dc2626', bg: '#fef2f2' },
        warning: { DEFAULT: '#b45309', bg: '#fef3c7' },
      },
    },
  },
  plugins: [],
};
