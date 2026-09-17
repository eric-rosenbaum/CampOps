import { test, expect } from '@playwright/test';
import { execFileSync } from 'child_process';
import fs from 'fs';
import { asUser, stepper, watchConsole } from './support/qa';
import { todayInZone } from '../src/lib/foodRequests';

/**
 * J5 — the whole sales motion, end to end.
 *
 * The founder spins up a demo from /admin in one step (clone, sell only the modules the guide
 * uses, write the guide, seed sample data) and copies the link. A visitor who belongs to no camp
 * opens it and lands on the guide: the camp's name, what this environment is, the three core
 * features each with a short description, a link to the module and a checklist whose buttons open
 * specific screens. The sample week is where the buttons say; a request sent from the counselor
 * link ticks its step by itself; the sample statement downloads and imports.
 *
 * Staging has anonymous sign-ins switched off, and /try/ reuses an existing session, so the
 * visitor is a signed-in account that belongs to no camp -- the same join-and-land path a
 * prospect's anonymous session takes. The demo camp is soft-deleted at the end.
 */

const CAMP_TZ = 'America/Toronto';

function sql<T = Record<string, unknown>>(query: string): T[] {
  const out = execFileSync('scripts/staging-sql.sh', ['-c', query], { env: { ...process.env, OUT: 'json' }, encoding: 'utf8' });
  return JSON.parse(out.slice(out.indexOf('['))) as T[];
}

function addDays(date: string, n: number) {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10); // UTC-built calendar date
}

test('J5: a founder spins up a demo, a prospect opens the link and follows the guide', async ({ browser }, info) => {
  test.setTimeout(300_000);
  const tag = `${info.project.name}-${Date.now().toString(36)}`;
  const campName = `J5 demo ${tag}`;
  const viewport = info.project.use.viewport ?? undefined;
  const desktop = (viewport?.width ?? 1280) >= 1024;

  // ── The founder ───────────────────────────────────────────────────────────────────────────
  const founder = await asUser(browser, 'founder', { viewport: { width: 1280, height: 800 } });
  const fshot = stepper('J5-demo', `${info.project.name}-founder`);
  await founder.page.goto('/admin');
  await expect(founder.page.getByRole('button', { name: 'Spin up demo' })).toBeVisible({ timeout: 30_000 });
  await founder.page.getByRole('button', { name: 'Spin up demo' }).click();
  await founder.page.getByPlaceholder('e.g. Maplewood (demo)').fill(campName);
  await founder.page.locator('select').filter({ has: founder.page.locator('option', { hasText: 'Prospect QA' }) }).first()
    .selectOption({ label: 'Prospect QA' });
  for (const t of ['Food requests from programs', 'Town trips', 'Company card receipts']) {
    await expect(founder.page.getByLabel(t)).toBeChecked();
  }
  await fshot(founder.page, 'spin-up-form');
  await founder.page.getByRole('button', { name: 'Spin up demo' }).last().click();
  const link = founder.page.locator('input[readonly][value*="/try/"]');
  await expect(link).toBeVisible({ timeout: 90_000 });
  const tryUrl = await link.inputValue();
  await fshot(founder.page, 'demo-ready');
  await founder.page.getByRole('button', { name: 'Done' }).click();

  const [camp] = sql<{ id: string; platform_modules: Record<string, boolean>; modules: Record<string, boolean> }>(
    `select id, platform_modules, modules from camps where name = '${campName}' and deleted_at is null`);
  expect(camp.platform_modules.trips).toBe(true);
  expect(camp.platform_modules.receipts).toBe(true);
  expect(camp.modules.commissary).toBe(true); // on for the camp too, whatever the source had
  // Focused: only what the guide uses, so no dashboard, tasks, pool or compliance.
  for (const k of ['dashboard', 'tasks', 'pool', 'safety']) expect(camp.platform_modules[k]).toBe(false);

  // Write the contact details the footer uses.
  const row = founder.page.locator('tr', { hasText: campName });
  await row.getByRole('button', { name: 'Guide' }).click();
  const panel = founder.page.getByTestId('demo-guide-panel');
  await expect(panel).toBeVisible();
  await panel.getByPlaceholder('Eric Rosenbaum').fill('Eric Rosenbaum');
  await panel.getByRole('button', { name: 'Save guide' }).click();
  await expect(panel.getByRole('button', { name: 'Saved' })).toBeVisible();
  await fshot(founder.page, 'guide-written');

  // ── The prospect ──────────────────────────────────────────────────────────────────────────
  const visitor = await asUser(browser, 'visitor', { viewport });
  const page = visitor.page;
  const errors = watchConsole(page);
  const shot = stepper('J5-demo', `${info.project.name}-visitor`);
  await page.goto(new URL(tryUrl).pathname);
  await page.waitForURL(/\/demo-guide/, { timeout: 60_000 });
  await expect(page.getByTestId('guide-heading')).toHaveText(campName);
  await expect(page.getByText(/This is your camp’s own demo environment/)).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Your camp’s core features' })).toBeVisible();
  for (const k of ['food_requests', 'town_trips', 'receipts']) {
    await expect(page.getByTestId(`feature-${k}`)).toBeVisible();
  }
  await expect(page.getByText('What you told us')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Share with your team' })).toBeVisible();
  await shot(page, 'guide-landing');

  // No dashboard in this demo: /home forwards to the guide, and the sidebar has no Dashboard.
  await page.goto('/home');
  await page.waitForURL(/\/demo-guide/);
  if (desktop) {
    await expect(page.getByRole('link', { name: 'Dashboard' })).toHaveCount(0);
    await expect(page.getByRole('link', { name: 'My Tasks' })).toHaveCount(0);
    await expect(page.getByRole('link', { name: 'Pool Manager' })).toHaveCount(0);
    await expect(page.getByRole('link', { name: 'Town Trips' })).toBeVisible();
  }

  // Feature link: straight to the module.
  await page.getByTestId('feature-food_requests').getByRole('button', { name: 'Open food requests' }).click();
  await page.waitForURL(/\/commissary\?tab=requests/);
  await expect(page.getByText(/S.mores for tomorrow night.s campfire/).first()).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText(/Short notice · \d+h/).first()).toBeVisible();
  await shot(page, 'kitchen-inbox-seeded');

  // Checklist: the counselor link opens in a new tab, and sending a request ticks the step.
  await page.goto('/demo-guide');
  const counselorHref = await page.getByTestId('feature-food_requests').locator('a[target="_blank"]').first().getAttribute('href');
  expect(counselorHref).toMatch(/\/food\/[A-Za-z0-9_-]+$/);
  const firstStep = page.getByTestId('feature-food_requests').getByRole('button', { name: /Mark as/ }).first();
  await expect(firstStep).toHaveAttribute('aria-pressed', 'false');
  const phone = await visitor.context.newPage();
  await phone.goto(new URL(counselorHref!).pathname);
  await expect(phone.getByRole('heading', { name: /Food for Cooking Club/ })).toBeVisible();
  await phone.getByRole('combobox', { name: 'Item 1' }).fill('marsh');
  await phone.getByRole('option', { name: /Mini marshmallows/ }).click();
  await phone.getByRole('textbox', { name: 'How much Mini marshmallows' }).fill('2');
  await phone.getByLabel('Pickup day').fill(addDays(todayInZone(CAMP_TZ), 2));
  await phone.getByLabel('Time').fill('15:00');
  await phone.getByLabel('What’s it for?').fill(`Prospect tries it ${tag}`);
  await phone.getByLabel('Your name').fill('Teddy');
  await phone.getByLabel('Email').fill(`teddy-${tag}@example.com`);
  await phone.getByRole('button', { name: 'Send to the kitchen' }).click();
  await phone.waitForURL(/\/food\/status\//, { timeout: 20_000 });
  await phone.close();
  await page.bringToFront();
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  await expect(firstStep).toHaveAttribute('aria-pressed', 'true', { timeout: 30_000 });
  await shot(page, 'guide-first-step-ticked');

  // A step link into a specific view: Pickups.
  await page.getByTestId('feature-food_requests').getByRole('button', { name: 'Open', exact: true }).nth(2).click();
  await page.waitForURL(/view=pickups/);

  // Town trips: the board already shows someone with no ride back.
  await page.goto('/demo-guide');
  await page.getByTestId('feature-town_trips').getByRole('button', { name: 'Open town trips' }).click();
  await page.waitForURL(/\/trips/);
  await expect(page.locator('[data-testid="stranded-chip"]:visible').first()).toBeVisible({ timeout: 30_000 });
  await shot(page, 'trips-board-seeded');

  // Receipts: last month's reconciliation for the card with the missing receipt and duplicate.
  await page.goto('/demo-guide');
  const receipts = page.getByTestId('feature-receipts');
  await expect(receipts.getByRole('button', { name: 'Open', exact: true })).toHaveCount(4); // appear once the guide has read the cards
  await receipts.getByRole('button', { name: 'Open', exact: true }).nth(1).click();
  await page.waitForURL(/\/receipts\/reconcile\?card=/);
  await expect(page.locator(':text-matches("MAPLE RIDGE GAS BAR", "i"):visible').first()).toBeVisible({ timeout: 30_000 });
  await shot(page, 'receipts-reconcile-seeded');

  // The receipts waiting for review carry their sample photos.
  await page.goto('/receipts');
  await page.waitForFunction(() => {
    const imgs = [...document.images].filter((i) => i.src.includes('/receipts/') && i.getBoundingClientRect().height > 0);
    return imgs.length >= 6 && imgs.every((i) => i.complete && i.naturalWidth > 0);
  }, undefined, { timeout: 30_000 });
  await shot(page, 'receipts-list-seeded');

  // The sample statement downloads from its step, and imports through the real screen.
  await page.goto('/demo-guide');
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByTestId('sample-statement').click(),
  ]);
  const csvPath = await download.path();
  const csv = fs.readFileSync(csvPath!, 'utf8');
  expect(csv.split('\r\n')[0]).toBe('Transaction Date,Description,Debit,Credit');
  expect(csv).toContain('CEDAR PARK PARKING');
  await expect(page.getByTestId('feature-receipts').getByRole('button', { name: 'Open', exact: true })).toHaveCount(4);
  await page.getByTestId('feature-receipts').getByRole('button', { name: 'Open', exact: true }).nth(2).click();
  await page.waitForURL(/\/receipts\/reconcile\?card=/);
  await expect(page.getByTestId('statement-import')).toBeVisible({ timeout: 30_000 });
  await page.getByTestId('statement-file').setInputFiles(csvPath!);
  const mapper = page.getByTestId('statement-mapper');
  await expect(mapper).toBeVisible();
  await mapper.getByRole('button', { name: /Import \d+ lines/ }).click();
  await expect(page.getByTestId('suggestions')).toBeVisible({ timeout: 30_000 });
  await shot(page, 'sample-statement-imported');

  expect(errors.filter((e) => !/favicon|ResizeObserver/.test(e))).toEqual([]);

  // ── Clean up: the demo camp goes to the trash, like a founder deleting it. ──────────────────
  sql(`update camps set deleted_at = now() where id = '${camp.id}'`);
  await founder.context.close();
  await visitor.context.close();
});
