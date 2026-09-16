import { defineConfig, devices } from '@playwright/test';

/**
 * Browser journeys against STAGING (`vite --mode staging`), in the "Prospect QA" camp only.
 *
 * Each journey saves a screenshot at every step into test-results/journeys/<journey>/ — those are
 * meant to be looked at, not just generated. Two viewports: a laptop and a phone.
 *
 * PORT lets parallel worktrees run their own dev server without colliding.
 */
const PORT = Number(process.env.E2E_PORT ?? 5190);

export default defineConfig({
  testDir: './e2e',
  timeout: 90_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [['list']],
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 800 } } },
    { name: 'phone', use: { ...devices['Pixel 7'], viewport: { width: 390, height: 844 } } },
  ],
  webServer: {
    command: `npx vite --mode staging --port ${PORT} --strictPort`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: true,
    timeout: 120_000,
  },
});
