import type { Config } from 'tailwindcss';

const config: Config = {
  content: [
    './src/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
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
        // One chrome token, not a scale. Same navy as the Classic CV / cover-
        // letter default (`#1e3a5f`). Header/footer in light mode only.
        chrome: '#1e3a5f',
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        arabic: ['Noto Sans Arabic', 'sans-serif'],
        urdu: ['Noto Nastaliq Urdu', 'sans-serif'],
      },
      // Refined, layered, low-opacity shadows (cool near-black tint) — the subtle
      // elevation you see in Stripe/Linear. Overrides Tailwind's flatter defaults
      // so every card/dropdown/modal shares one restrained elevation language.
      boxShadow: {
        xs: '0 1px 2px 0 rgb(17 24 39 / 0.05)',
        sm: '0 1px 2px 0 rgb(17 24 39 / 0.04), 0 1px 3px 0 rgb(17 24 39 / 0.06)',
        DEFAULT: '0 1px 3px -1px rgb(17 24 39 / 0.06), 0 2px 6px -1px rgb(17 24 39 / 0.06)',
        md: '0 2px 4px -2px rgb(17 24 39 / 0.06), 0 6px 12px -3px rgb(17 24 39 / 0.08)',
        lg: '0 4px 8px -4px rgb(17 24 39 / 0.06), 0 14px 28px -6px rgb(17 24 39 / 0.10)',
        xl: '0 8px 16px -6px rgb(17 24 39 / 0.08), 0 28px 48px -12px rgb(17 24 39 / 0.14)',
      },
      animation: {
        'fade-in': 'fadeIn 0.5s ease-in-out',
        'slide-up': 'slideUp 0.5s ease-out',
        'slide-in-right': 'slideInRight 0.3s ease-out',
        'shimmer': 'shimmer 1.5s infinite',
        'scale-in': 'scaleIn 0.2s ease-out',
        'bounce-subtle': 'bounceSubtle 2s infinite',
        'pulse-slow': 'pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite',
      },
      keyframes: {
        fadeIn: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        slideUp: {
          '0%': { opacity: '0', transform: 'translateY(20px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        slideInRight: {
          '0%': { opacity: '0', transform: 'translateX(20px)' },
          '100%': { opacity: '1', transform: 'translateX(0)' },
        },
        shimmer: {
          '0%': { backgroundPosition: '-200% 0' },
          '100%': { backgroundPosition: '200% 0' },
        },
        scaleIn: {
          '0%': { opacity: '0', transform: 'scale(0.95)' },
          '100%': { opacity: '1', transform: 'scale(1)' },
        },
        bounceSubtle: {
          '0%, 100%': { transform: 'translateY(0)' },
          '50%': { transform: 'translateY(-4px)' },
        },
      },
    },
  },
  plugins: [],
};

export default config;
