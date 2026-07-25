/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        forest: { DEFAULT: '#1a2e1a', mid: '#2d4a2d', light: '#3d6b3d' },
        sage: { DEFAULT: '#7aab6e', light: '#a8c99f', pale: '#e1f0dc' },
        cream: { DEFAULT: '#f5f2eb', dark: '#ede9df' },
        amber: { DEFAULT: '#c47d08', bg: '#fef5e4', text: '#7d4e00' },
        red: { DEFAULT: '#c0392b', bg: '#fdecea', text: '#7a1a1a' },
        'green-muted': { bg: '#eaf3e8', text: '#1e6b1e' },
        blue: { DEFAULT: '#185fa5', bg: '#e6f1fb', text: '#0c447c' },
        purple: { DEFAULT: '#6b3fa0', bg: '#f0ebfc', text: '#3d1f6b' },
        border: '#d4cfc4',
      },
      fontFamily: {
        sans: ['"DM Sans"', 'sans-serif'],
        mono: ['"DM Mono"', 'monospace'],
        display: ['"Fraunces"', 'Georgia', 'serif'],
      },
      borderRadius: {
        card: '10px',
        btn: '7px',
        modal: '14px',
        pill: '20px',
        tag: '4px',
      },
      fontSize: {
        label: '10px',
        meta: '11px',
        secondary: '12px',
        body: '13px',
        'card-title': '14px',
        'panel-title': '15px',
        'page-title': '18px',
        stat: '28px',
      },
      width: {
        sidebar: '224px',
        detail: '310px',
      },
      minWidth: {
        sidebar: '224px',
        detail: '310px',
      },
    },
  },
  plugins: [],
};
