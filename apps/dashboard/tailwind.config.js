/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        bg:       'var(--bg)',
        surface:  'var(--surface)',
        surface2: 'var(--surface2)',
        overlay:  'var(--overlay)',
        border:   'var(--border)',
        'border-lit': 'var(--border-lit)',
        text:     'var(--text)',
        'text-dim': 'var(--text-dim)',
        'text-mute': 'var(--text-mute)',
        purple:   'var(--purple)',
        'purple-hi': 'var(--purple-hi)',
        teal:     'var(--teal)',
        'teal-hi':'var(--teal-hi)',
        red:      'var(--red)',
        amber:    'var(--amber)',
        cyan:     'var(--cyan)',
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'Fira Code', 'monospace'],
      },
    },
  },
  plugins: [],
};
