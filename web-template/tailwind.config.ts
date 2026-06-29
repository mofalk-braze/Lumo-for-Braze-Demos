import type { Config } from 'tailwindcss'

// Brand colors are driven by CSS variables set at runtime from the active
// brandConfig (see src/components/BrandTheme.tsx). Cloning a brand = change the
// hex values in brandConfig — no Tailwind rebuild needed.
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        brand: {
          DEFAULT: 'var(--brand)',
          dark: 'var(--brand-dark)',
          light: 'var(--brand-light)',
          accent: 'var(--brand-accent)',
        },
        ink: 'var(--ink)',
        muted: 'var(--muted)',
        line: 'var(--line)',
        surface: 'var(--surface)',
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'sans-serif'],
        heading: ['Inter', 'system-ui', 'sans-serif'],
      },
      boxShadow: {
        card: '0 1px 4px rgba(16, 24, 40, 0.08)',
        nav: '0 -1px 6px rgba(16, 24, 40, 0.06)',
        phone: '0 24px 60px rgba(16, 24, 40, 0.30)',
      },
      borderRadius: {
        card: '14px',
      },
    },
  },
  plugins: [],
} satisfies Config
