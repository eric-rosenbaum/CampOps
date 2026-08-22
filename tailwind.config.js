/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        // ── Field Guide palette ──────────────────────────────────────────────
        // Values come from style-redesign.html. Token NAMES are unchanged so the ~5,000
        // existing utility classes re-skin without being touched; only what they resolve to
        // moved. Where a name no longer describes its value (sage is now a muted moss, cream
        // is now paper) the name is kept anyway — renaming would mean editing every call site
        // for no visual gain.
        //
        // `forest` carries two jobs in this codebase: dark fills (buttons, sidebar) and body
        // ink. The new design separates those — pine for fills and headings, a warm near-black
        // for running text — so `forest` takes the pine value and `ink` is added below for
        // text. Call sites migrate to `text-ink` as each page is reworked.
        forest: { DEFAULT: '#1D3A2E', mid: '#2C5342', light: '#5E7A61' },
        ink: { DEFAULT: '#23201B', soft: '#6B6357', faint: '#9AA98F' },
        sage: { DEFAULT: '#5E7A61', light: '#9AA98F', pale: '#E6E9D8' },
        cream: { DEFAULT: '#F6F1E4', dark: '#EFE9D9' },
        paper: { DEFAULT: '#F6F1E4', raised: '#FCF9F1', card: '#FFFDF7' },
        amber: { DEFAULT: '#D08C1B', bg: '#FBF1DC', text: '#8A5A0C' },
        red: { DEFAULT: '#B4552F', bg: '#F8E9E2', text: '#8A3D1E' },
        'green-muted': { bg: '#E6ECE2', text: '#3F5D45' },
        blue: { DEFAULT: '#185fa5', bg: '#e6f1fb', text: '#0c447c' },
        purple: { DEFAULT: '#6b3fa0', bg: '#f0ebfc', text: '#3d1f6b' },
        border: '#DED3BB',
        // Overriding Tailwind's own `white`. 393 surfaces in this codebase are `bg-white`, and
        // in the Field Guide a card is warm paper rather than paper-white — remapping the token
        // warms all of them at once. It reads correctly for the 52 `text-white` uses too, which
        // all sit on pine and want the same warm off-white.
        white: '#FFFDF7',
        // Sidebar ink, which sits on pine rather than paper.
        side: { DEFAULT: '#C7D6C8', dim: '#7E9C86', strong: '#FCF9F1' },
      },
      fontFamily: {
        sans: ['"Karla"', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        mono: ['"DM Mono"', 'ui-monospace', 'monospace'],
        display: ['"Bitter"', 'Georgia', 'serif'],
      },
      // Field Guide is a squarer design — the softness now comes from paper tones and
      // hairline rules rather than from rounded corners.
      borderRadius: {
        card: '5px',
        btn: '5px',
        modal: '8px',
        pill: '999px',
        tag: '3px',
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
        sidebar: '228px',
        rail: '66px',
        detail: '310px',
      },
      minWidth: {
        sidebar: '228px',
        rail: '66px',
        detail: '310px',
      },
    },
  },
  plugins: [],
};
