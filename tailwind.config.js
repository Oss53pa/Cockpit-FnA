/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        // primary est désormais piloté par des CSS custom properties
        // injectées dynamiquement par src/store/theme.ts
        primary: {
          50:  'rgb(var(--p-50)  / <alpha-value>)',
          100: 'rgb(var(--p-100) / <alpha-value>)',
          200: 'rgb(var(--p-200) / <alpha-value>)',
          300: 'rgb(var(--p-300) / <alpha-value>)',
          400: 'rgb(var(--p-400) / <alpha-value>)',
          500: 'rgb(var(--p-500) / <alpha-value>)',
          600: 'rgb(var(--p-600) / <alpha-value>)',
          700: 'rgb(var(--p-700) / <alpha-value>)',
          800: 'rgb(var(--p-800) / <alpha-value>)',
          900: 'rgb(var(--p-900) / <alpha-value>)',
          950: 'rgb(var(--p-950) / <alpha-value>)',
        },
        // Tokens layout Twisty (page / shell / surface / accent)
        bgpage:  'rgb(var(--bg-page) / <alpha-value>)',
        shell:   'rgb(var(--bg-shell) / <alpha-value>)',
        surface: 'rgb(var(--bg-surface) / <alpha-value>)',
        accent: {
          DEFAULT: 'rgb(var(--accent) / <alpha-value>)',
          soft:    'rgb(var(--accent-soft) / <alpha-value>)',
        },
        // Couleurs de statut fonctionnelles (fixes)
        success: '#22c55e',
        warning: '#f59e0b',
        error: '#ef4444',
        info: '#3b82f6',
        severity: {
          low: '#6b7280',
          medium: '#f59e0b',
          high: '#ef4444',
          critical: '#7f1d1d',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'sans-serif'],
        display: ['"Grand Hotel"', 'cursive'],
        mono: ['"JetBrains Mono"', 'monospace'],
      },
      fontSize: {
        // Echelle typographique stricte (international standard)
        'xs':   ['11px', { lineHeight: '16px', letterSpacing: '0' }],
        'sm':   ['13px', { lineHeight: '18px', letterSpacing: '-0.005em' }],
        'base': ['14px', { lineHeight: '20px', letterSpacing: '-0.005em' }],
        'lg':   ['16px', { lineHeight: '22px', letterSpacing: '-0.01em' }],
        'xl':   ['18px', { lineHeight: '24px', letterSpacing: '-0.015em' }],
        '2xl':  ['22px', { lineHeight: '28px', letterSpacing: '-0.02em' }],
        '3xl':  ['28px', { lineHeight: '34px', letterSpacing: '-0.025em' }],
        '4xl':  ['36px', { lineHeight: '42px', letterSpacing: '-0.03em' }],
        '5xl':  ['48px', { lineHeight: '54px', letterSpacing: '-0.035em' }],
      },
      borderRadius: {
        'shell': '28px',
      },
      animation: {
        // forwards : conserve l'état final après l'animation (opacity 1) — sinon le
        // modal et autres overlays repartent en opacity:0 et deviennent invisibles.
        'fade-in':      'fadeIn 200ms ease-out forwards',
        'fade-in-up':   'fadeInUp 300ms cubic-bezier(0.16, 1, 0.3, 1) forwards',
        'scale-in':     'scaleIn 200ms cubic-bezier(0.16, 1, 0.3, 1) forwards',
        'slide-in-right': 'slideInRight 250ms cubic-bezier(0.16, 1, 0.3, 1) forwards',
        'shimmer':      'shimmer 1.4s ease-in-out infinite',
        'pulse-soft':   'pulseSoft 2s ease-in-out infinite',
      },
      keyframes: {
        fadeIn:        { '0%': { opacity: '0' }, '100%': { opacity: '1' } },
        fadeInUp:      { '0%': { opacity: '0', transform: 'translateY(8px)' }, '100%': { opacity: '1', transform: 'translateY(0)' } },
        scaleIn:       { '0%': { opacity: '0', transform: 'scale(0.97)' }, '100%': { opacity: '1', transform: 'scale(1)' } },
        slideInRight:  { '0%': { opacity: '0', transform: 'translateX(8px)' }, '100%': { opacity: '1', transform: 'translateX(0)' } },
        shimmer:       { '0%': { backgroundPosition: '-200% 0' }, '100%': { backgroundPosition: '200% 0' } },
        pulseSoft:     { '0%, 100%': { opacity: '1' }, '50%': { opacity: '0.7' } },
      },
      transitionTimingFunction: {
        'spring': 'cubic-bezier(0.16, 1, 0.3, 1)',
      },
      boxShadow: {
        // Echelle premium ultra-subtile (Linear/Vercel/Stripe Dashboard)
        'sm':       '0 1px 2px 0 rgb(0 0 0 / 0.03)',
        'DEFAULT':  '0 1px 3px 0 rgb(0 0 0 / 0.04), 0 1px 2px -1px rgb(0 0 0 / 0.03)',
        'md':       '0 2px 6px -1px rgb(0 0 0 / 0.05), 0 1px 3px -1px rgb(0 0 0 / 0.03)',
        'lg':       '0 8px 24px -6px rgb(0 0 0 / 0.07), 0 4px 8px -4px rgb(0 0 0 / 0.04)',
        'xl':       '0 16px 40px -8px rgb(0 0 0 / 0.09), 0 8px 16px -6px rgb(0 0 0 / 0.05)',
        '2xl':      '0 24px 60px -12px rgb(0 0 0 / 0.12), 0 12px 24px -8px rgb(0 0 0 / 0.06)',
        // Cards : 1px ring + ombre légère (signature premium)
        'card':       '0 1px 2px 0 rgb(0 0 0 / 0.03), 0 0 0 1px rgb(0 0 0 / 0.04)',
        'card-hover': '0 4px 12px -2px rgb(0 0 0 / 0.07), 0 0 0 1px rgb(0 0 0 / 0.06)',
        'card-elevated': '0 8px 28px -6px rgb(0 0 0 / 0.10), 0 0 0 1px rgb(0 0 0 / 0.05)',
        // Bouton accent (avec lueur subtile)
        'accent':       '0 1px 2px 0 rgb(218 77 40 / 0.12), 0 0 0 1px rgb(218 77 40 / 0.20)',
        'accent-hover': '0 4px 12px -2px rgb(218 77 40 / 0.25), 0 0 0 1px rgb(218 77 40 / 0.30)',
        // Inset utile pour les inputs focus
        'inset-accent': 'inset 0 0 0 1px rgb(var(--accent))',
        // Glow doux pour hero / important elements
        'glow-soft': '0 0 0 1px rgb(var(--accent) / 0.15), 0 8px 32px -8px rgb(var(--accent) / 0.20)',
      },
      backgroundImage: {
        'gradient-radial': 'radial-gradient(var(--tw-gradient-stops))',
        'gradient-conic':  'conic-gradient(from 180deg at 50% 50%, var(--tw-gradient-stops))',
        // Gradient hero subtil (utilise pour cards-hero et headers)
        'gradient-hero':   'linear-gradient(135deg, rgb(var(--p-900)) 0%, rgb(var(--p-800)) 50%, rgb(var(--p-900)) 100%)',
        // Surface premium avec micro-grain
        'gradient-surface': 'linear-gradient(180deg, rgb(var(--bg-surface)) 0%, rgb(var(--p-50)) 100%)',
      },
      backdropBlur: {
        xs: '2px',
      },
    },
  },
  plugins: [],
};
