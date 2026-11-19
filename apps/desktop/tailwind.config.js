/** @type {import('tailwindcss').Config} */

// PRIVIA design tokens.
//
// The foundation is near-black, charcoal and graphite. Red is an accent, used
// only for the active item, the primary action, selection and focus. Status
// colours are never red-on-success: "ok" is a muted green.
//
// `graphite` is the neutral scale every screen uses. Its stops are mapped onto
// the PRIVIA surfaces and text colours so the whole interface stays consistent:
//   950 main background   900 sidebar   850 card   800 elevated surface
//   700 border            500 muted text 400 secondary text 100 primary text
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        graphite: {
          950: '#08090B',
          900: '#0D0E10',
          850: '#151619',
          800: '#1C1D21',
          750: '#26272B',
          700: '#303034',
          600: '#52525B',
          500: '#71717A',
          400: '#A1A1AA',
          300: '#C4C4C8',
          200: '#E4E4E7',
          100: '#F4F4F5',
        },
        brand: {
          DEFAULT: '#A83236',
          muted: '#702629',
          hover: '#C4474C',
          soft: 'rgba(168, 50, 54, 0.12)',
          line: 'rgba(168, 50, 54, 0.45)',
        },
        // Kept as an alias so focus rings and selection read "brand" everywhere.
        accent: {
          DEFAULT: '#A83236',
          soft: 'rgba(168, 50, 54, 0.12)',
          line: 'rgba(168, 50, 54, 0.45)',
        },
        ok: { DEFAULT: '#70A88A', soft: 'rgba(112, 168, 138, 0.12)' },
        caution: { DEFAULT: '#D4A45F', soft: 'rgba(212, 164, 95, 0.12)' },
        danger: { DEFAULT: '#D9686C', soft: 'rgba(217, 104, 108, 0.12)' },
      },
      fontFamily: {
        sans: [
          'Inter Variable',
          'Inter',
          'SF Pro Text',
          '-apple-system',
          'Segoe UI',
          'system-ui',
          'sans-serif',
        ],
        mono: ['JetBrains Mono', 'SF Mono', 'Menlo', 'Consolas', 'monospace'],
      },
      fontSize: {
        '2xs': ['0.6875rem', { lineHeight: '1rem' }],
        xs: ['0.75rem', { lineHeight: '1.125rem' }],
        sm: ['0.8125rem', { lineHeight: '1.25rem' }],
        base: ['0.875rem', { lineHeight: '1.375rem' }],
      },
      borderRadius: { lg: '0.5rem', xl: '0.75rem', '2xl': '1rem' },
      boxShadow: {
        panel: '0 1px 0 0 rgba(255,255,255,0.02) inset',
        lift: '0 16px 48px -20px rgba(0,0,0,0.85)',
      },
      keyframes: {
        'fade-in': {
          from: { opacity: '0', transform: 'translateY(2px)' },
          to: { opacity: '1', transform: 'none' },
        },
        'slide-up': {
          from: { opacity: '0', transform: 'translateY(8px)' },
          to: { opacity: '1', transform: 'none' },
        },
        shimmer: { '100%': { transform: 'translateX(100%)' } },
        'pulse-soft': { '0%,100%': { opacity: '0.45' }, '50%': { opacity: '1' } },
        caret: { '0%,100%': { opacity: '1' }, '50%': { opacity: '0' } },
      },
      animation: {
        'fade-in': 'fade-in 140ms ease-out',
        'slide-up': 'slide-up 180ms cubic-bezier(0.22,1,0.36,1)',
        shimmer: 'shimmer 1.6s infinite',
        'pulse-soft': 'pulse-soft 1.6s ease-in-out infinite',
        caret: 'caret 1s step-end infinite',
      },
    },
  },
  plugins: [],
};
