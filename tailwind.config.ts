import type { Config } from 'tailwindcss'

/**
 * Palette and type scale come from the Fate Collab recruitment design system:
 * neutral executive, borders not shadows, classic serif headings.
 */
const config: Config = {
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}', './lib/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        bg: { primary: '#F8F7F4', secondary: '#EFEDE8', panel: '#FFFFFF' },
        line: '#DDD9D1',
        ink: { DEFAULT: '#1A1A18', soft: '#5C5850', muted: '#9A9590' },
        accent: { DEFAULT: '#2C3E50', light: '#EBF0F5' },
        state: { success: '#3D7A5F', warning: '#8C6D2F', danger: '#8B3A3A' },
        gold: '#B8963E',
      },
      fontFamily: {
        display: ['var(--font-display)', 'Georgia', 'serif'],
        sans: ['var(--font-body)', 'Gill Sans', 'system-ui', 'sans-serif'],
        mono: ['var(--font-mono)', 'Courier New', 'monospace'],
      },
      borderRadius: { panel: '2px' },
    },
  },
  plugins: [],
}
export default config
