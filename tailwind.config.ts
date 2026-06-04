import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./src/**/*.{ts,tsx,mdx}'],
  theme: {
    extend: {
      colors: {
        // Light theme, Recursiv green
        bg: '#ffffff',
        panel: '#f7f9fb',
        'panel-2': '#eef2f6',
        line: '#e5e9ef',
        'line-bright': '#d3dae3',
        ink: '#0e1726',
        muted: '#586273',
        faint: '#8a95a4',
        accent: '#0b9d76',
        'accent-dim': '#5fcfb0',
        // compliance status
        pass: '#15a34a',
        fail: '#dd2d3b',
        warn: '#c2790f',
        info: '#2563eb',
        'trust': '#7c5cff',
      },
      fontFamily: {
        sans: ['var(--font-sans)', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        mono: ['var(--font-mono)', 'ui-monospace', 'SFMono-Regular', 'monospace'],
      },
      boxShadow: {
        glow: '0 6px 24px -12px rgba(13,23,38,0.18), 0 0 0 1px rgba(11,157,118,0.16)',
      },
      backgroundImage: {
        grid: 'linear-gradient(to right, #eef2f6 1px, transparent 1px), linear-gradient(to bottom, #eef2f6 1px, transparent 1px)',
      },
    },
  },
  plugins: [],
};

export default config;
