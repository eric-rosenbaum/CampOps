import { test, expect } from '@playwright/test';
import { execFileSync } from 'child_process';
import { asUser, stepper, watchConsole } from './support/qa';
import { todayInZone } from '../src/lib/foodRequests';

/**
 * J5 — the whole sales motion, end to end.
 *
 * The founder spins up a demo from /admin in one step (clone, sell the modules, write the guide,
 * seed sample data), writes the intro in the prospect's words, and copies the link. A visitor
 * who belongs to no camp opens that link and lands on the guide; every spotlight's first screen
 * shows the sample week the seeds wrote; sending a request from the counselor link ticks the
 * guide's step by itself; the Open buttons land where they say.
 *
 * Staging has anonymous sign-ins switched off, and /try/ reuses an existing session, so the
 * visitor is a signed-in account that belongs to no camp — the same join-and-land path a
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
  test.setTimeout(240_000);
  const tag = `${info.project.name}-${Date.now().toString(36)}`;
  const campName = `J5 demo ${tag}`;
  const viewport = info.project.use.viewport ?? undefined;

  // ── The founder ───────────────────────────────────────────────────────────────────────────
  const founder = await asUser(browser, 'founder', { viewport: { width: 1280, height: 800 } });
  const fshot = stepper('J5-demo', `${info.project.name}-founder`);
  await founder.page.goto('/admin');
  await expect(founder.page.getByRole('button', { name: 'Spin up demo' })).toBeVisible({ timeout: 30_000 });
  await founder.page.getByRole('button', { name: 'Spin up demo' }).click();
  await founder.page.getByPlaceholder('e.g. Maplewood (demo)').fill(campName);
  const source = founder.page.locator('select').filter({ has: founder.page.locator('option', { hasText: 'Prospect QA' }) }).first();
  await source.selectOption({ label: 'Prospect QA' });
  await founder.page.getByPlaceholder('e.g. Teddy').fill('Teddy');
  for (const t of ['Food requests from programs', 'Town trips', 'Company-card receipts']) {
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
  // Switched on for the camp too, even though the source camp had Kitchen Manager off for itself.
  expect(camp.modules.commissary).toBe(true);
  // Focused on what the guide is about: nothing else is sold to this demo by default.
  expect(camp.platform_modules.pool).toBe(false);
  expect(camp.platform_modules.safety).toBe(false);

  // Write the intro in the prospect's words.
  const row = founder.page.locator('tr', { hasText: campName });
  await row.getByRole('button', { name: 'Guide' }).click();
  const panel = founder.page.getByTestId('demo-guide-panel');
  await expect(panel).toBeVisible();
  await panel.getByPlaceholder(/Thanks for walking us through/).fill(
    'Thanks for showing us how the kitchen and the ops team really work. Here is what you asked for, working.');
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
  await expect(page.getByRole('heading', { name: 'Built for Teddy, after our conversation' })).toBeVisible();
  await expect(page.getByText('Here is what you asked for, working.')).toBeVisible();
  for (const k of ['food_requests', 'town_trips', 'receipts']) {
    await expect(page.getByTestId(`spotlight-${k}`)).toBeVisible();
  }
  await expect(page.getByTestId('guide-progress')).toHaveText('0 of 12 steps tried');
  await shot(page, 'guide-landing');
  // The sidebar holds only what the guide points at.
  if ((viewport?.width ?? 1280) >= 1024) {
    await expect(page.getByRole('link', { name: 'Pool Manager' })).toHaveCount(0);
    await expect(page.getByRole('link', { name: 'Town Trips' })).toBeVisible();
  }

  // A shared demo: the visitor can use their own name, and put the sample data back.
  const bar = page.getByTestId('shared-demo-bar');
  await expect(bar).toContainText('You appear as');
  await bar.getByRole('button', { name: 'Use your name' }).click();
  await bar.getByLabel('Your name').fill('Teddy');
  await bar.getByRole('button', { name: 'Save' }).click();
  await expect(bar).toContainText('You appear as Teddy');

  // Spotlight 1: the kitchen inbox has the sample week in it, including a late request.
  const food = page.getByTestId('spotlight-food_requests');
  await food.getByRole('button', { name: /Open/ }).first().click();
  await page.waitForURL(/\/commissary\?tab=requests/);
  await expect(page.getByText(/S.mores for tomorrow night.s campfire/)).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText(/Late · \d+h notice/).first()).toBeVisible();
  await shot(page, 'kitchen-inbox-seeded');

  // The counselor link, as the prospect would open it in a new tab.
  await page.goto('/demo-guide');
  const counselorHref = await page.getByTestId('spotlight-food_requests').locator('a[target="_blank"]').first().getAttribute('href');
  expect(counselorHref).toMatch(/\/food\/[A-Za-z0-9_-]+$/);
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

  // Back on the guide: the step ticked itself from the real row.
  await page.bringToFront();
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  await expect(page.getByTestId('guide-progress')).toHaveText('1 of 12 steps tried', { timeout: 30_000 });
  await shot(page, 'guide-first-step-ticked');

  // Spotlight 2: the week board already shows someone with no ride back.
  await page.getByTestId('spotlight-town_trips').getByRole('button', { name: /Open/ }).first().click();
  await page.waitForURL(/\/trips/);
  await expect(page.locator('[data-testid="stranded-chip"]:visible').first()).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText('Day-off shuttle into town').first()).toBeVisible();
  await shot(page, 'trips-board-seeded');

  // Spotlight 3: last month's reconciliation with its missing receipt and its duplicate.
  await page.goto('/demo-guide');
  // Step links that depend on the demo's own cards appear once the guide has read them.
  await expect(page.getByTestId('spotlight-receipts').getByRole('button', { name: /Open/ })).toHaveCount(4);
  await page.getByTestId('spotlight-receipts').getByRole('button', { name: /Open/ }).nth(1).click();
  await page.waitForURL(/\/receipts\/reconcile/);
  await expect(page.locator(':text-matches("MAPLE RIDGE GAS BAR", "i"):visible').first()).toBeVisible({ timeout: 30_000 });
  await shot(page, 'receipts-reconcile-seeded');

  // The receipts waiting for review carry their sample photos.
  await page.goto('/receipts');
  await expect(page.locator(':text("Northwind Hardware"):visible').first()).toBeVisible({ timeout: 30_000 });
  // The six photographed receipts show their photos (signed URLs, loaded after the list).
  await page.waitForFunction(() => {
    // Only the copies on screen: the list renders a hidden phone layout too, whose lazy images
    // never load at desktop width.
    const imgs = [...document.images].filter((i) => i.src.includes('/receipts/') && i.getBoundingClientRect().height > 0);
    return imgs.length >= 6 && imgs.every((i) => i.complete && i.naturalWidth > 0);
  }, undefined, { timeout: 30_000 });
  await shot(page, 'receipts-list-seeded');

  // The sample statement downloads and is a real CSV of the third card's charges.
  await page.goto('/demo-guide');
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByTestId('sample-statement').click(),
  ]);
  const csvPath = await download.path();
  const csv = (await import('fs')).readFileSync(csvPath!, 'utf8');
  expect(csv.split('\r\n')[0]).toBe('Transaction Date,Description,Debit,Credit');
  expect(csv).toContain('TRILLIUM CRAFT SUPPLY');
  expect(csv).toContain('CEDAR PARK PARKING');

  // …and it imports: the column mapper reads the bank-style file on its own, every sample
  // receipt on the card matches, and only the parking charge is left without one.
  await expect(page.getByTestId('spotlight-receipts').getByRole('button', { name: /Open/ })).toHaveCount(4);
  await page.getByTestId('spotlight-receipts').getByRole('button', { name: /Open/ }).nth(2).click();
  await page.waitForURL(/\/receipts\/reconcile\?card=/);
  await expect(page.getByTestId('statement-import')).toBeVisible({ timeout: 30_000 });
  await page.getByTestId('statement-file').setInputFiles(csvPath!);
  const mapper = page.getByTestId('statement-mapper');
  await expect(mapper).toBeVisible();
  await shot(page, 'sample-statement-mapper');
  await mapper.getByRole('button', { name: /Import \d+ lines/ }).click();
  await expect(page.getByTestId('suggestions')).toBeVisible({ timeout: 30_000 });
  await page.getByRole('button', { name: /Accept all \d+/ }).click();
  await expect(page.getByTestId('suggestions')).toHaveCount(0);
  await expect(page.getByTestId('missing').locator('li')).toHaveCount(1);
  await expect(page.getByTestId('missing')).toContainText('CEDAR PARK PARKING');
  await shot(page, 'sample-statement-imported');

  // Someone else finished the reconciliation before this visitor got to it; reset puts it back.
  await page.goto('/demo-guide');
  const bar2 = page.getByTestId('shared-demo-bar');
  await bar2.getByRole('button', { name: 'Reset the sample data' }).click();
  await bar2.getByRole('button', { name: 'Reset it' }).click();
  await expect(bar2.getByRole('status')).toContainText('back as it started', { timeout: 60_000 });
  const [{ n }] = sql<{ n: number }>(`select count(*)::int n from card_statements where camp_id = '${camp.id}'`);
  expect(Number(n)).toBe(3); // seeds rewrote cards A and B; the statement the visitor imported for C is theirs and stays
  await shot(page, 'guide-after-reset');

  expect(errors.filter((e) => !/favicon|ResizeObserver/.test(e))).toEqual([]);

  // ── Clean up: the demo camp goes to the trash, like a founder deleting it. ──────────────────
  sql(`update camps set deleted_at = now() where id = '${camp.id}'`);
  await founder.context.close();
  await visitor.context.close();
});
