import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

/**
 * Keep non-production deploys out of search results.
 *
 * This can't be a checked-in `public/robots.txt` — that file would ship to production too and
 * deindex the marketing site. So the disallow-all is emitted only when building a non-production
 * mode; production emits nothing and stays crawlable exactly as before.
 */
function noindexNonProduction(mode: string): Plugin {
  return {
    name: 'noindex-non-production',
    apply: 'build',
    generateBundle() {
      if (mode === 'production') return;
      this.emitFile({
        type: 'asset',
        fileName: 'robots.txt',
        source: 'User-agent: *\nDisallow: /\n',
      });
    },
  };
}

export default defineConfig(({ mode }) => ({
  plugins: [react(), noindexNonProduction(mode)],
  server: {
    host: true,
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
}));
