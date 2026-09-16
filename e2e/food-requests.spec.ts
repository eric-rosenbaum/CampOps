import { test, expect, type Page } from '@playwright/test';
import { execFileSync } from 'child_process';
import { asUser, stepper, watchConsole } from './support/qa';
import { todayInZone } from '../src/lib/foodRequests';

/**
 * J1 — a counselor on the Cooking Club's no-login link asks for three things (one in their own
 *      words) for a pickup two days out, is warned it is short notice, and lands on a status page.
 * J2 — the kitchen, on another screen, sees it arrive without reloading, trims a quantity, links
 *      the free-text line to an item, approves; Inventory shows the food set aside and Show the
 *      math names the program; Ready; Picked up. The counselor's status page follows each step.
 *
 * Staging "Prospect QA" camp only. e2e/seed-food-requests.sql resets the kitchen before each run.
 */

const TOKEN = 'qa-cooking-club';
const CAMP_TZ = 'America/Toronto';

function sql<T = Record<string, unknown>>(query: string): T[] {
  const out = execFileSync('scripts/staging-sql.sh', ['-c', query], { env: { ...process.env, OUT: 'json' }, encoding: 'utf8' });
  const json = out.slice(out.indexOf('['));
  return JSON.parse(json) as T[];
}

function addDays(date: string, n: number) {
  const [y, m, d] = date.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + n));
  return dt.toISOString().slice(0, 10); // a UTC-constructed calendar date, so no zone shift
}

async function statusHeadline(page: Page) {
  await page.reload();
  return page.getByTestId('status-headline');
}

test.describe.configure({ mode: 'serial' });

test.beforeAll(() => {
  execFileSync('scripts/staging-sql.sh', ['e2e/seed-food-requests.sql'], { encoding: 'utf8' });
});

test('J1–J2: a counselor asks, the kitchen approves with changes, sets it aside, and hands it over', async ({ page, browser }, info) => {
  test.setTimeout(240_000);
  const shot = stepper('food-requests', info.project.name);
  const counselorErrors = watchConsole(page);
  const tag = `${info.project.name}-${Date.now().toString(36)}`;
  const purpose = `Pancake night ${tag}`;
  const viewport = info.project.use.viewport ?? { width: 1280, height: 800 };
  const isPhone = viewport.width < 640;

  // ── The kitchen is already looking at its inbox before anything is sent ─────────────────
  const kitchen = await asUser(browser, 'kitchen', { viewport, isMobile: isPhone, hasTouch: isPhone });
  const kitchenErrors = watchConsole(kitchen.page);
  // Failed requests are checked by URL rather than by console text, which does not say which call
  // failed. get_camp_staff_personal is refused for staff by design and is called by the safety
  // loader on every page for everyone; it predates food requests.
  const badResponses: string[] = [];
  for (const p of [page, kitchen.page]) {
    p.on('response', (r) => {
      if (r.status() >= 400 && !r.url().includes('/rpc/get_camp_staff_personal')) badResponses.push(`${r.status()} ${r.url()}`);
    });
  }
  // The same pre-existing refusal raises a "N changes didn't save" banner for staff, at a random
  // moment, over whatever is at the bottom of the screen. Dismiss it whenever it shows up.
  await kitchen.page.addLocatorHandler(
    kitchen.page.getByRole('alert').filter({ hasText: 'get_camp_staff_personal' }),
    async (banner) => { await banner.getByRole('button', { name: 'Dismiss' }).last().click(); },
  );
  await kitchen.page.goto('/commissary?tab=requests');
  await expect(kitchen.page.getByText('No requests waiting')).toBeVisible({ timeout: 30_000 });
  await shot(kitchen.page, 'kitchen-inbox-empty');

  // ── J1: the counselor's phone form ─────────────────────────────────────────────────────
  await page.goto(`/food/${TOKEN}`);
  await expect(page.getByRole('heading', { name: 'Food for Cooking Club' })).toBeVisible();
  await expect(page.getByText(/asks for\s+3 days’ notice/)).toBeVisible();
  await shot(page, 'counselor-form');

  const item1 = page.getByRole('combobox', { name: 'Item 1' });
  await item1.fill('flour');
  await page.getByRole('option', { name: /All-purpose flour/ }).click();
  await page.getByRole('textbox', { name: 'How much All-purpose flour' }).fill('5');

  await page.getByRole('combobox', { name: 'Item 2' }).fill('eggs');
  await page.getByRole('option', { name: /Large eggs/ }).click();
  await page.getByRole('textbox', { name: 'How much Large eggs' }).fill('2');

  await page.getByRole('combobox', { name: 'Item 3' }).fill('Big marshmallows');
  await page.getByRole('textbox', { name: 'How much Big marshmallows' }).fill('3');
  await page.getByRole('textbox', { name: 'Unit for Big marshmallows' }).fill('bags');

  const pickupDate = addDays(todayInZone(CAMP_TZ), 2);
  await page.getByLabel('Pickup day').fill(pickupDate);
  await page.getByLabel('Time').fill('14:00');
  await expect(page.getByTestId('late-warning')).toBeVisible();
  await expect(page.getByTestId('late-warning')).toContainText('Short notice');

  await page.getByLabel('What’s it for?').fill(purpose);
  await page.getByLabel('People').fill('14');
  await page.getByLabel('Your name').fill('Casey Counselor');
  await page.getByLabel('Email').fill(`j1-${tag}@example.com`);
  await page.getByLabel('Mobile phone (optional)').fill('416-555-0100');
  await page.getByRole('button', { name: 'Text message' }).click();
  await expect(page.getByRole('button', { name: 'Text message' })).toHaveAttribute('aria-pressed', 'true');
  await page.waitForTimeout(300); // let the 150ms colour transition finish before the screenshot
  await shot(page, 'counselor-form-filled-late-warning');

  await page.getByRole('button', { name: 'Send to the kitchen' }).click();
  const sentAt = Date.now();
  // A refusal (the throttle, a validation message) shows as an alert on the form; fail on it
  // instead of waiting out the test timeout for a navigation that will never happen.
  await page.waitForURL(/\/food\/status\/.+\?sent=1/, { timeout: 20_000 });
  await expect(page.getByTestId('status-headline')).toHaveText('Waiting for the kitchen');
  await expect(page.getByText('Sent to the kitchen')).toBeVisible();
  await shot(page, 'counselor-status-submitted');

  // The outbox has the receipt and the kitchen alert, each with its text-message copy.
  const [req] = sql<{ id: string; is_late: boolean; status: string }>(
    `select id, is_late, status from food_requests where purpose = '${purpose}'`);
  expect(req.is_late).toBe(true);
  const queued = sql<{ rule_key: string; body_text: string | null }>(
    `select rule_key, body_text from scheduled_messages where subject_type = 'food_request' and subject_id = '${req.id}' order by rule_key`);
  expect(queued.map((q) => q.rule_key)).toEqual(['new_request:kitchen@example.com', 'request_received']);
  for (const q of queued) expect(q.body_text?.length ?? 0).toBeGreaterThan(20);

  // ── J2: it lands in the kitchen's inbox with no reload ───────────────────────────────
  const card = kitchen.page.getByTestId('food-request-card').filter({ hasText: purpose });
  await expect(card).toBeVisible({ timeout: 10_000 });
  const arrivalMs = Date.now() - sentAt;
  console.log(`[J2] request reached the kitchen inbox ${arrivalMs}ms after submit (${info.project.name})`);
  expect(arrivalMs).toBeLessThan(6_000);
  await expect(card).toContainText('Late');
  await expect(kitchen.page.getByTestId('requests-badge')).toHaveText('1');
  await shot(kitchen.page, 'kitchen-inbox-arrived');

  await card.getByRole('button', { name: 'Edit & approve' }).click();
  const modal = kitchen.page.getByRole('heading', { name: 'Review Cooking Club' }).locator('xpath=ancestor::div[contains(@class,"rounded-modal")]');
  await expect(modal).toBeVisible();
  await modal.getByRole('textbox', { name: 'Approved quantity for All-purpose flour' }).fill('3');
  await modal.getByRole('textbox', { name: 'Link Big marshmallows to an item' }).fill('marsh');
  await modal.getByRole('option', { name: /Mini marshmallows/ }).click();
  await modal.getByRole('textbox', { name: 'Approved quantity for Big marshmallows' }).fill('2');
  await modal.getByLabel(/Note to Casey/).fill('Only 3 lb of flour until Monday.');
  await shot(kitchen.page, 'kitchen-decision-edited');
  await modal.getByRole('button', { name: 'Approve with changes' }).click();
  await expect(card).toHaveCount(0);

  await expect(await statusHeadline(page)).toHaveText('Approved, with changes');
  await expect(page.getByText('Only 3 lb of flour until Monday.')).toBeVisible();
  await shot(page, 'counselor-status-approved-with-changes');

  // What people are told, on the request itself.
  await kitchen.page.getByRole('button', { name: /^Pickups/ }).click();
  const pickupCard = kitchen.page.getByTestId('food-request-card').filter({ hasText: 'Cooking Club' }).first();
  await pickupCard.locator('button').first().click();
  const messages = kitchen.page.getByTestId('food-messages');
  await expect(messages.locator('[data-rule="request_decided"]')).toBeVisible({ timeout: 10_000 });
  await expect(messages.locator('[data-rule="pickup_reminder"]')).toContainText('Scheduled');
  await expect(messages.locator('[data-rule="request_decided"]').getByTestId('text-preview')).toContainText('asked 5');
  await shot(kitchen.page, 'kitchen-request-detail-messages');
  await kitchen.page.keyboard.press('Escape');

  // ── Inventory shows the flour set aside; no reload, no other action ─────────────────────
  await kitchen.page.getByRole('button', { name: 'Inventory', exact: true }).click();
  const flourRow = kitchen.page.getByText('All-purpose flour', { exact: true }).locator('xpath=ancestor::div[contains(@class,"grid")][1]');
  await expect(flourRow.getByTestId('set-aside')).toContainText('Set aside 3 lb');
  await expect(flourRow.getByTestId('set-aside')).toContainText('Cooking Club');
  const marshRow = kitchen.page.getByText('Mini marshmallows', { exact: true }).locator('xpath=ancestor::div[contains(@class,"grid")][1]');
  await expect(marshRow.getByTestId('set-aside')).toContainText('Set aside 2 bags');
  await flourRow.scrollIntoViewIfNeeded();
  await shot(kitchen.page, 'kitchen-inventory-set-aside');

  // ── Ordering: the math names the program ───────────────────────────────────────────────
  await kitchen.page.getByRole('button', { name: 'Ordering', exact: true }).click();
  await kitchen.page.getByRole('button', { name: /Show the math/ }).click();
  const math = kitchen.page.getByTestId('order-math');
  await expect(math).toContainText('Program requests');
  await expect(math).toContainText(/including 3 lb for Cooking Club on/);
  await math.scrollIntoViewIfNeeded();
  await shot(kitchen.page, 'kitchen-order-math');

  // ── Ready, then picked up; the counselor sees each ────────────────────────────────────
  await kitchen.page.getByRole('button', { name: /^Requests/ }).click();
  await kitchen.page.getByRole('button', { name: /^Pickups/ }).click();
  const handover = kitchen.page.getByTestId('food-request-card').filter({ hasText: 'Casey Counselor' });
  await handover.getByRole('button', { name: 'Mark ready' }).click();
  await expect(handover.getByRole('button', { name: 'Picked up' })).toBeVisible();
  await shot(kitchen.page, 'kitchen-pickups-ready');
  await expect(await statusHeadline(page)).toHaveText('Ready at the kitchen back door');
  await shot(page, 'counselor-status-ready');

  await handover.getByRole('button', { name: 'Picked up' }).click();
  await expect(handover).toHaveCount(0);
  await kitchen.page.getByRole('button', { name: /^History/ }).click();
  await expect(kitchen.page.getByTestId('food-request-card').filter({ hasText: 'Casey Counselor' })).toContainText('Picked up');
  await shot(kitchen.page, 'kitchen-history');
  await expect(await statusHeadline(page)).toHaveText('Picked up');
  await expect(page.getByRole('button', { name: 'Cancel this request' })).toHaveCount(0);
  await shot(page, 'counselor-status-picked-up');

  const after = sql<{ rule_key: string; state: string }>(
    `select rule_key, state from scheduled_messages where subject_type = 'food_request' and subject_id = '${req.id}'
      and (rule_key in ('pickup_reminder') or rule_key like 'missed_pickup%')`);
  expect(after.length).toBeGreaterThan(0);
  for (const m of after) expect(m.state).toBe('cancelled');
  const [final] = sql<{ status: string; changed_by_kitchen: boolean }>(`select status, changed_by_kitchen from food_requests where id = '${req.id}'`);
  expect(final).toEqual({ status: 'picked_up', changed_by_kitchen: true });

  const noise = (e: string) => /favicon|ResizeObserver|Multiple GoTrueClient|Failed to load resource/.test(e);
  expect(badResponses).toEqual([]);
  expect(counselorErrors.filter((e) => !noise(e))).toEqual([]);
  expect(kitchenErrors.filter((e) => !noise(e))).toEqual([]);
  await kitchen.context.close();
});

test('the other food-request screens: programs & QR, a staff request in the app, a dead link', async ({ page, browser }, info) => {
  test.setTimeout(180_000);
  const shot = stepper('food-requests-screens', info.project.name);
  const viewport = info.project.use.viewport ?? { width: 1280, height: 800 };
  const isPhone = viewport.width < 640;
  const tag = `${info.project.name}-${Date.now().toString(36)}`;

  // A dead program link says so, in words a counselor understands.
  await page.goto('/food/not-a-real-link');
  await expect(page.getByRole('heading', { name: 'This link is not active' })).toBeVisible();
  await shot(page, 'public-dead-link');

  // Settings › Food requests: programs, link, QR, kitchen rules.
  const admin = await asUser(browser, 'admin', { viewport, isMobile: isPhone, hasTouch: isPhone });
  await admin.page.addLocatorHandler(
    admin.page.getByRole('alert').filter({ hasText: 'get_camp_staff_personal' }),
    async (banner) => { await banner.getByRole('button', { name: 'Dismiss' }).last().click(); },
  );
  await admin.page.goto('/commissary?tab=settings');
  const section = admin.page.getByTestId('food-programs-settings');
  await expect(section.getByTestId('food-program-row').filter({ hasText: 'Cooking Club' })).toBeVisible({ timeout: 30_000 });
  await section.scrollIntoViewIfNeeded();
  await shot(admin.page, 'settings-programs');
  await section.getByRole('button', { name: 'QR code for Cooking Club' }).click();
  await expect(admin.page.getByTestId('food-program-link')).toHaveText(/\/food\/qa-cooking-club$/);
  await shot(admin.page, 'settings-program-qr');
  await admin.page.getByRole('button', { name: 'Done' }).click();
  await admin.context.close();

  // A staff member asks in the app and watches it in My requests.
  const program = await asUser(browser, 'program', { viewport, isMobile: isPhone, hasTouch: isPhone });
  await program.page.addLocatorHandler(
    program.page.getByRole('alert').filter({ hasText: 'get_camp_staff_personal' }),
    async (banner) => { await banner.getByRole('button', { name: 'Dismiss' }).last().click(); },
  );
  await program.page.goto('/food-requests');
  await expect(program.page.getByRole('heading', { name: 'Food requests', exact: true })).toBeVisible({ timeout: 30_000 });
  await shot(program.page, 'my-requests-empty');
  await program.page.getByRole('button', { name: '+ New request' }).filter({ visible: true }).first().click();
  await program.page.getByLabel('For which program?').selectOption({ label: 'Canoe trips' });
  await program.page.getByRole('combobox', { name: 'Item 1' }).fill('graham');
  await program.page.getByRole('option', { name: /Graham crackers/ }).click();
  await program.page.getByRole('textbox', { name: 'How much Graham crackers' }).fill('4');
  await program.page.getByLabel('Pickup day').fill(addDays(todayInZone(CAMP_TZ), 6));
  await program.page.getByLabel('Time').fill('07:30');
  await program.page.getByLabel('What’s it for?').fill(`S'mores ${tag}`);
  await expect(program.page.getByTestId('late-warning')).toHaveCount(0);
  await shot(program.page, 'my-requests-form');
  await program.page.getByRole('button', { name: 'Send to the kitchen' }).click();
  await expect(program.page.getByText('Sent to the kitchen.')).toBeVisible();
  await expect(program.page.getByTestId('my-food-requests')).toContainText('Waiting for the kitchen');
  await shot(program.page, 'my-requests-sent');
  await program.context.close();
});
