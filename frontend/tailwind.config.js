/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // 暖灰主色调 (Warm Monochrome) — 与 Nexus 保持一致
        canvas: {
          DEFAULT: '#FBFBFA',
          deep: '#F7F6F3',
        },
        surface: {
          DEFAULT: '#FFFFFF',
          hover: '#F9F9F8',
          active: '#F3F3F2',
        },
        border: {
          DEFAULT: '#EAEAEA',
          strong: '#D4D4D4',
        },
        ink: {
          DEFAULT: '#2F3437',
          secondary: '#787774',
          tertiary: '#A3A3A0',
          inverse: '#FFFFFF',
        },
        // 柔和点缀色 (Muted Pastels)
        accent: {
          red:       { bg: '#FDEBEC', text: '#9F2F2D' },
          blue:      { bg: '#E1F3FE', text: '#1F6C9F' },
          green:     { bg: '#EDF3EC', text: '#346538' },
          yellow:    { bg: '#FBF3DB', text: '#956400' },
          purple:    { bg: '#F0EBFE', text: '#5B3E9E' },
        },
        // 主品牌色（低饱和度灰蓝）
        brand: {
          DEFAULT: '#111111',
          hover: '#333333',
          subtle: '#F5F5F5',
        },
      },
      fontFamily: {
        sans: ['"Outfit"', '"SF Pro Display"', '"Helvetica Neue"', 'system-ui', 'sans-serif'],
        serif: ['"Newsreader"', '"Instrument Serif"', '"Playfair Display"', 'serif'],
        mono: ['"Geist Mono"', '"SF Mono"', '"JetBrains Mono"', 'monospace'],
      },
      fontSize: {
        'display': ['2.5rem', { lineHeight: '1.1', letterSpacing: '-0.03em', fontWeight: '700' }],
        'heading': ['1.5rem', { lineHeight: '1.2', letterSpacing: '-0.02em', fontWeight: '600' }],
        'subheading': ['1.125rem', { lineHeight: '1.3', letterSpacing: '-0.01em', fontWeight: '500' }],
        'body': ['0.875rem', { lineHeight: '1.6', letterSpacing: '0' }],
        'caption': ['0.75rem', { lineHeight: '1.5', letterSpacing: '0.02em' }],
        'label': ['0.6875rem', { lineHeight: '1.4', letterSpacing: '0.04em' }],
      },
      borderRadius: {
        'card': '8px',
        'button': '6px',
        'input': '6px',
        'badge': '9999px',
      },
      boxShadow: {
        'card': '0 1px 3px rgba(0,0,0,0.03)',
        'card-hover': '0 2px 8px rgba(0,0,0,0.04)',
        'dropdown': '0 4px 16px rgba(0,0,0,0.06)',
        'modal': '0 16px 48px rgba(0,0,0,0.08)',
      },
      spacing: {
        'sidebar': '240px',
        'sidebar-collapsed': '72px',
        'header': '56px',
      },
      transitionTimingFunction: {
        'smooth': 'cubic-bezier(0.16, 1, 0.3, 1)',
      },
      transitionDuration: {
        'fast': '150ms',
        'normal': '200ms',
        'slow': '300ms',
      },
      animation: {
        'fade-in': 'fadeIn 0.4s cubic-bezier(0.16, 1, 0.3, 1)',
        'slide-up': 'slideUp 0.4s cubic-bezier(0.16, 1, 0.3, 1)',
        'scale-in': 'scaleIn 0.2s cubic-bezier(0.16, 1, 0.3, 1)',
      },
      keyframes: {
        fadeIn: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        slideUp: {
          '0%': { opacity: '0', transform: 'translateY(12px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        scaleIn: {
          '0%': { opacity: '0', transform: 'scale(0.95)' },
          '100%': { opacity: '1', transform: 'scale(1)' },
        },
      },
    },
  },
  plugins: [],
}
