import { defineConfig } from 'vitest/config';
import path from 'path';

// Pure-logic unit tests only (src/**/__tests__). Anything that needs a database is a SQL suite in
// supabase/tests; anything that needs a browser is a Playwright journey in e2e/.
export default defineConfig({
  resolve: { alias: { '@': path.resolve(__dirname, './src') } },
  test: {
    include: ['src/**/__tests__/**/*.test.ts'],
    environment: 'node',
    // Calendar-day logic is camp-local; run in a zone that is not UTC so a UTC slip shows up.
    env: { TZ: 'America/Vancouver' },
  },
});
