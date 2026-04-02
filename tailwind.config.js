/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        forest: { DEFAULT: '#1a2e1a', mid: '#2d4a2d', light: '#3d6b3d' },
        sage: { DEFAULT: '#7aab6e', light: '#a8c99f' },
        cream: { DEFAULT: '#f5f2eb', dark: '#ede9df' },
        amber: { DEFAULT: '#c47d08', bg: '#fef5e4', text: '#7d4e00' },
        red: { DEFAULT: '#c0392b', bg: '#fdecea' },
        'green-muted': { bg: '#eaf3e8', text: '#1e6b1e' },
        border: '#d4cfc4',
      },
      fontFamily: {
        sans: ['"DM Sans"', 'sans-serif'],
        mono: ['"DM Mono"', 'monospace'],
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
