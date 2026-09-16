import { expect, type Browser, type BrowserContext, type Page } from '@playwright/test';
import fs from 'fs';
import path from 'path';

/** Staging QA camp, created by e2e/setup-qa-camp.sh. */
export const QA_CAMP_SLUG = 'prospect-qa';
export const STAGING_REF = 'mvxnpofopbmljzpgnycg';

export type QaRole = 'admin' | 'kitchen' | 'program' | 'holder' | 'holder2' | 'viewer';
export const QA_USERS: Record<QaRole, { email: string; name: string }> = {
  admin: { email: 'qa-admin@example.com', name: 'Teddy Admin' },
  kitchen: { email: 'qa-kitchen@example.com', name: 'Kim Kitchen' },
  program: { email: 'qa-program@example.com', name: 'Priya Program' },
  holder: { email: 'qa-holder@example.com', name: 'Hana Holder' },
  holder2: { email: 'qa-holder2@example.com', name: 'Omar Holder' },
  viewer: { email: 'qa-viewer@example.com', name: 'Val Viewer' },
};

export function qaPassword(): string {
  if (process.env.E2E_PASSWORD) return process.env.E2E_PASSWORD;
  const file = path.resolve(process.cwd(), '.env.e2e');
  const line = fs.readFileSync(file, 'utf8').split('\n').find((l) => l.startsWith('E2E_PASSWORD='));
  if (!line) throw new Error('E2E_PASSWORD missing: run e2e/setup-qa-camp.sh');
  return line.slice('E2E_PASSWORD='.length).trim();
}

/** Signs in through the real login form and waits for the app shell. */
export async function signIn(page: Page, role: QaRole) {
  await page.goto('/login');
  await page.locator('input[type="email"]').first().fill(QA_USERS[role].email);
  await page.locator('input[type="password"]').fill(qaPassword());
  await page.getByRole('button', { name: 'Sign in' }).click();
  await page.waitForURL((u) => !u.pathname.startsWith('/login'), { timeout: 30_000 });
  // Every test must be looking at staging. The env badge names the database it is reading.
  await expect(page.getByRole('status').filter({ hasText: STAGING_REF })).toBeVisible();
}

/** A fresh, isolated browser context signed in as `role` — for two people on two screens. */
export async function asUser(browser: Browser, role: QaRole, opts: Parameters<Browser['newContext']>[0] = {}): Promise<{ context: BrowserContext; page: Page }> {
  const context = await browser.newContext(opts);
  const page = await context.newPage();
  await signIn(page, role);
  return { context, page };
}

/**
 * A numbered screenshot for the journey record. Full page so nothing below the fold is missed.
 */
export function stepper(journey: string, project: string) {
  let n = 0;
  const dir = path.resolve(process.cwd(), `e2e-screens/${journey}/${project}`);
  fs.mkdirSync(dir, { recursive: true });
  return async (page: Page, label: string) => {
    n += 1;
    const file = path.join(dir, `${String(n).padStart(2, '0')}-${label.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}.png`);
    await page.screenshot({ path: file, fullPage: true });
    return file;
  };
}

/** Collects console errors so a journey can assert the page never threw. */
export function watchConsole(page: Page) {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(`console: ${m.text()}`); });
  return errors;
}
