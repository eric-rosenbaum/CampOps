import { test, expect, type Browser, type BrowserContext, type Page, type TestInfo } from '@playwright/test';
import { execFileSync } from 'child_process';
import { signIn, stepper, watchConsole, type QaRole } from './support/qa';

/**
 * J3 — Town Trips, five people on five screens.
 *
 *   A (admin) plans a 3-seat town run and drives it.
 *   B (program) and C (kitchen) grab seats there and back.
 *   E (holder2) grabs a seat THERE ONLY → the board flags one rider with no ride back.
 *   D (holder) finds the car full on the way out → waitlisted.
 *   B leaves → D is promoted, and D's own screen says so without a reload.
 *   A plans a pick-up run; E takes a seat back on it → the flag clears.
 *   E adds an errand with no trip. A, on a phone, attaches it and ticks it off; E sees it done.
 *
 * Seat dots are asserted on A's board, which is never reloaded, so every step also proves the
 * realtime path. Runs at laptop and phone width (the driver's checklist is always on a phone).
 *
 * Data: only the staging "Prospect QA" camp. Trips data there is wiped at the start so reruns pass.
 */

const QA_CAMP_ID = '0d7d9bf2-0805-4bb5-aa97-16420c6eeeb2';
const REALTIME = { timeout: 20_000 };

function stagingSql(sql: string): string {
  return execFileSync('scripts/staging-sql.sh', ['-c', sql], { encoding: 'utf8' });
}

/**
 * Flip whether the QA camp is sold Town Trips. guard_platform_modules silently reverts a change
 * made by anyone who is not a platform admin -- including a bare service connection with no JWT --
 * so the update runs as the staging founder account that setup-qa-camp.sql already uses.
 */
function setTripsSold(on: boolean) {
  stagingSql(`do $$ begin
    perform set_config('request.jwt.claims', '{"sub":"bbbbbbbb-0000-4000-8000-000000000001","role":"authenticated"}', true);
    update camps set platform_modules = platform_modules || '{"trips":${on}}' where id = '${QA_CAMP_ID}' and slug = 'prospect-qa';
    if (select (platform_modules->>'trips')::boolean from camps where id = '${QA_CAMP_ID}') is distinct from ${on} then
      raise exception 'platform_modules.trips did not change';
    end if;
  end $$;`);
}

function resetTrips() {
  // Guarded on the slug as well as the id: this deletes rows.
  stagingSql(`do $$ begin
    if (select slug from camps where id = '${QA_CAMP_ID}') is distinct from 'prospect-qa' then raise exception 'not the QA camp'; end if;
    delete from trip_errands where camp_id = '${QA_CAMP_ID}';
    delete from ride_requests where camp_id = '${QA_CAMP_ID}';
    delete from trips where camp_id = '${QA_CAMP_ID}';
    update camps set modules = modules || '{"trips":true}' where id = '${QA_CAMP_ID}';
  end $$;`);
  setTripsSold(true);
}

/** Camp-local calendar arithmetic, same rules as src/lib/trips.ts. */
function campToday(): string {
  const p = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Toronto', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date());
  const g = (t: string) => p.find((x) => x.type === t)!.value;
  return `${g('year')}-${g('month')}-${g('day')}`;
}
function addDays(date: string, n: number): string {
  const [y, m, d] = date.split('-').map(Number);
  const t = new Date(Date.UTC(y, m - 1, d + n));
  return `${t.getUTCFullYear()}-${String(t.getUTCMonth() + 1).padStart(2, '0')}-${String(t.getUTCDate()).padStart(2, '0')}`;
}
function weekStartOf(date: string): string {
  const [y, m, d] = date.split('-').map(Number);
  const dow = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  return addDays(date, -((dow + 6) % 7));
}

/** A person on their own device, sized like this project unless told otherwise. */
async function person(browser: Browser, role: QaRole, info: TestInfo, size?: 'phone') {
  const use = info.project.use;
  const phone = size === 'phone';
  const context: BrowserContext = await browser.newContext({
    baseURL: use.baseURL,
    viewport: phone ? { width: 390, height: 844 } : use.viewport,
    isMobile: phone ? true : use.isMobile,
    hasTouch: phone ? true : use.hasTouch,
    userAgent: phone ? undefined : use.userAgent,
    deviceScaleFactor: phone ? 2 : use.deviceScaleFactor,
  });
  const page = await context.newPage();
  const errors = watchConsole(page);
  await signIn(page, role);
  return { context, page, errors };
}

/**
 * The "N changes didn't save" banner that staging shows staff today comes from an unrelated
 * pre-existing 400 (get_camp_staff_personal); it sits over the bottom of a phone screen, so it is
 * dismissed before tapping near there.
 */
async function clearNoise(page: Page) {
  const b = page.getByRole('button', { name: 'Dismiss', exact: true }).first();
  if (await b.isVisible().catch(() => false)) await b.click().catch(() => {});
}

const visible = (page: Page, selector: string) => page.locator(selector).filter({ visible: true });
const card = (page: Page, tripId: string) => visible(page, `[data-testid="trip-card"][data-trip-id="${tripId}"]`).first();

async function expectDots(page: Page, tripId: string, there: number, back: number, waitlist: number) {
  const dots = card(page, tripId).getByTestId('seat-dots');
  await expect(dots).toHaveAttribute('data-there', String(there), REALTIME);
  await expect(dots).toHaveAttribute('data-back', String(back), REALTIME);
  await expect(dots).toHaveAttribute('data-waitlist', String(waitlist), REALTIME);
}

async function openBoard(page: Page, week: string) {
  await page.goto(`/trips?week=${week}`);
  await expect(page.getByRole('heading', { name: 'Town Trips' })).toBeVisible({ timeout: 30_000 });
}

async function grabFromBoard(page: Page, tripId: string, leg: 'There & back' | 'There only' | 'Back only', expectText: RegExp) {
  await clearNoise(page);
  await clearNoise(page);
  await card(page, tripId).click();                                          // tap 1: the card
  const drawer = page.getByTestId('trip-drawer');
  await expect(drawer).toBeVisible();
  if (leg !== 'There & back') await drawer.getByRole('radio', { name: new RegExp(`^${leg}`) }).click();
  await clearNoise(page);
  await drawer.getByTestId('grab-seat').click();                             // tap 2: grab
  await expect(page.getByTestId('trips-toast')).toContainText(expectText);
  return drawer;
}

const ignorable = (e: string) =>
  /favicon|ResizeObserver|status of 400|get_camp_staff_personal/.test(e);

test('J3: plan a town run, fill it, waitlist, promotion, a ride back and an errand', async ({ browser }, info) => {
  test.setTimeout(300_000);
  resetTrips();
  const snap = stepper('J3-town-trips', info.project.name);
  const shot = async (page: Page, label: string) => { await clearNoise(page); await page.waitForTimeout(300); return snap(page, label); };
  const date = addDays(campToday(), 2);
  const week = weekStartOf(date);

  // ── A plans the run ──────────────────────────────────────────────────────
  const A = await person(browser, 'admin', info);
  await openBoard(A.page, week);
  await expect(A.page.locator('a[href="/trips"]')).toHaveCount(1);
  await clearNoise(A.page);
  await A.page.getByTestId('plan-trip-button').click();
  const plan = A.page.getByTestId('plan-trip');
  await clearNoise(A.page);
  await plan.getByRole('radio', { name: /Town run/ }).click();
  await plan.locator('input[name="title"]').fill('Town run');
  await plan.locator('input[name="destination"]').fill('Walmart');
  await plan.locator('input[name="departDate"]').fill(date);
  await plan.locator('input[name="departTime"]').fill('13:00');
  await plan.locator('input[name="seats"]').fill('3');
  await shot(A.page, 'A plans a town run');
  await clearNoise(A.page);
  await plan.getByTestId('save-trip').click();
  await expect(A.page.getByTestId('trip-drawer')).toBeVisible();
  const tripId = new URL(A.page.url()).searchParams.get('trip')!;
  expect(tripId).toMatch(/[0-9a-f-]{36}/);
  await expect(A.page.getByTestId('trip-drawer')).toContainText('You’re driving this one');
  await clearNoise(A.page);
  await A.page.getByRole('button', { name: 'Close trip' }).click();
  await expectDots(A.page, tripId, 0, 0, 0);
  await shot(A.page, 'the empty car on the board');

  // ── B and C grab seats ───────────────────────────────────────────────────
  const B = await person(browser, 'program', info);
  await openBoard(B.page, week);
  await grabFromBoard(B.page, tripId, 'There & back', /You’re in/);
  await expect(B.page.getByTestId('my-seat-status')).toHaveText('You have a seat');
  await expectDots(A.page, tripId, 1, 1, 0);
  await shot(B.page, 'B grabs a seat in two taps');

  const C = await person(browser, 'kitchen', info);
  await openBoard(C.page, week);
  await grabFromBoard(C.page, tripId, 'There & back', /You’re in/);
  await expectDots(A.page, tripId, 2, 2, 0);

  // ── E rides there only: stranded ─────────────────────────────────────────
  const E = await person(browser, 'holder2', info);
  await openBoard(E.page, week);
  await grabFromBoard(E.page, tripId, 'There only', /You’re in/);
  await expectDots(A.page, tripId, 3, 2, 0);
  const aDay = visible(A.page, `[data-testid="board-day"][data-date="${date}"]`).first();
  await expect(aDay.getByTestId('stranded-chip')).toBeVisible(REALTIME);
  await expect(aDay.getByTestId('stranded-chip')).toContainText('1');
  await expect(E.page.getByTestId('no-ride-back')).toBeVisible(REALTIME);
  await shot(E.page, 'E rides there only and is told there is no ride back');
  await shot(A.page, 'the board flags one rider with no ride back');

  // ── D: the way out is full → waitlist ────────────────────────────────────
  const D = await person(browser, 'holder', info);
  await openBoard(D.page, week);
  await clearNoise(D.page);
  await clearNoise(D.page);
  await card(D.page, tripId).click();
  const dDrawer = D.page.getByTestId('trip-drawer');
  await expect(dDrawer.getByTestId('grab-seat')).toHaveText('Join the waitlist');
  await clearNoise(D.page);
  await dDrawer.getByTestId('grab-seat').click();
  await expect(D.page.getByTestId('trips-toast')).toContainText(/waitlist/);
  await expect(D.page.getByTestId('my-seat-status')).toHaveText('You’re #1 on the waitlist');
  await expectDots(A.page, tripId, 3, 2, 1);
  await shot(D.page, 'D is waitlisted');
  await shot(A.page, 'full car with one waiting');

  // ── B leaves → D promoted, on D's screen without a reload ────────────────
  await clearNoise(B.page);
  await clearNoise(B.page);
  await B.page.getByTestId('trip-drawer').getByRole('button', { name: 'Leave seat' }).click();
  await expect(B.page.getByTestId('trips-toast')).toContainText('Seat released');
  await expect(D.page.getByTestId('my-seat-status')).toHaveText('You have a seat', REALTIME);
  await expectDots(A.page, tripId, 3, 2, 0);
  await shot(D.page, 'D is promoted without reloading');
  await shot(A.page, 'dots after B leaves and D moves up');

  // ── A plans a pick-up; E takes a seat back → flag clears ─────────────────
  await clearNoise(A.page);
  await A.page.getByTestId('plan-trip-button').click();
  const plan2 = A.page.getByTestId('plan-trip');
  await clearNoise(A.page);
  await plan2.getByRole('radio', { name: /Day-off shuttle/ }).click();
  await plan2.locator('input[name="title"]').fill('Pick-up from town');
  await plan2.locator('input[name="destination"]').fill('Walmart → camp');
  await plan2.locator('input[name="departDate"]').fill(date);
  await plan2.locator('input[name="departTime"]').fill('16:30');
  await plan2.locator('input[name="seats"]').fill('2');
  await clearNoise(A.page);
  await plan2.getByTestId('save-trip').click();
  await expect(A.page.getByTestId('trip-drawer')).toBeVisible();
  const pickupId = new URL(A.page.url()).searchParams.get('trip')!;
  await clearNoise(A.page);
  await A.page.getByRole('button', { name: 'Close trip' }).click();

  const rideBack = E.page.getByTestId('no-ride-back').getByRole('button', { name: 'Ride back', exact: true });
  await expect(rideBack).toBeVisible(REALTIME);
  await shot(E.page, 'a ride back is offered to E');
  await clearNoise(E.page);
  await clearNoise(E.page);
  await rideBack.click();
  await expect(E.page.getByTestId('trips-toast')).toContainText(/You’re in — back only/);
  await expect(E.page.getByTestId('no-ride-back')).toHaveCount(0, REALTIME);
  await expect(aDay.getByTestId('stranded-chip')).toHaveCount(0, REALTIME);
  await expectDots(A.page, pickupId, 0, 1, 0);
  await shot(A.page, 'the flag clears once E has a ride back');

  // ── E adds an errand with nobody going ───────────────────────────────────
  await E.page.goto('/trips?tab=shopping');
  await clearNoise(E.page);
  await clearNoise(E.page);
  await E.page.getByTestId('add-errand').click();
  const sheet = E.page.getByTestId('errand-sheet');
  await sheet.locator('input[name="item"]').fill('Craft glue');
  await sheet.locator('input[name="quantity"]').fill('6 bottles');
  await sheet.locator('input[name="store"]').fill('Dollarama');
  await expect(sheet.locator('select[name="trip"]')).toHaveValue('');
  await clearNoise(E.page);
  await sheet.getByTestId('save-errand').click();
  await expect(E.page.getByTestId('needs-trip').getByText('Craft glue')).toBeVisible();
  await shot(E.page, 'E adds an errand without knowing who drives');

  // ── A, on a phone, attaches it and ticks it off ──────────────────────────
  let driverPage = A.page;
  let driverCtx: BrowserContext | null = null;
  if (info.project.name !== 'phone') {
    const phoneA = await person(browser, 'admin', info, 'phone');
    driverPage = phoneA.page;
    driverCtx = phoneA.context;
  }
  await driverPage.goto(`/trips?trip=${tripId}`);
  const aDrawer = driverPage.getByTestId('trip-drawer');
  await expect(aDrawer).toBeVisible({ timeout: 30_000 });
  await clearNoise(driverPage);
  await aDrawer.getByTestId('attach-errands').click();
  await expect(aDrawer.getByText('Craft glue')).toBeVisible();
  await shot(driverPage, 'driver chooses open errands to attach');
  await clearNoise(driverPage);
  await aDrawer.getByTestId('attach-confirm').click();
  const row = aDrawer.getByTestId('errand-row').filter({ hasText: 'Craft glue' });
  await expect(row).toHaveAttribute('data-status', 'open');
  const gotIt = row.getByTestId('errand-bought');
  const box = await gotIt.boundingBox();
  expect(box!.height).toBeGreaterThanOrEqual(44);                             // one thumb, in a store
  await row.scrollIntoViewIfNeeded();
  await shot(driverPage, 'driver checklist on a phone');
  await clearNoise(driverPage);
  await clearNoise(driverPage);
  await gotIt.click();
  await expect(row).toHaveAttribute('data-status', 'bought');
  await shot(driverPage, 'errand ticked off');

  // E's shopping list empties on its own.
  await expect(E.page.getByTestId('needs-trip')).toContainText('Nothing waiting', REALTIME);
  await shot(E.page, 'E sees the errand handled');

  // Back on A's board (never reloaded): the run carries its errand, the dots never lied.
  if (driverCtx) {
    await expectDots(A.page, tripId, 3, 2, 0);
  }
  await openBoard(A.page, week);
  await expectDots(A.page, tripId, 3, 2, 0);
  await expect(card(A.page, tripId)).toContainText('1');                      // one errand riding along
  await shot(A.page, 'final board');

  for (const p of [A, B, C, D, E]) {
    expect(p.errors.filter((e) => !ignorable(e))).toEqual([]);
    await p.context.close();
  }
  await driverCtx?.close();
});

test('module gating: a camp not sold Town Trips has no nav item and /trips goes home', async ({ browser }, info) => {
  test.setTimeout(120_000);
  const shot = stepper('J6-trips-gating', info.project.name);
  setTripsSold(false);
  try {
    const A = await person(browser, 'admin', info);
    await A.page.goto('/home');
    await expect(A.page.getByText('Prospect QA').first()).toBeVisible({ timeout: 30_000 });
    await expect(A.page.locator('a[href="/trips"]')).toHaveCount(0);
    await A.page.goto('/trips?tab=shopping');
    await A.page.waitForURL(/\/home/, { timeout: 30_000 });
    await shot(A.page, 'trips unsold redirects home');
    await A.context.close();
  } finally {
    setTripsSold(true);
  }
  const A2 = await person(browser, 'admin', info);
  await A2.page.goto('/trips');
  await expect(A2.page.getByRole('heading', { name: 'Town Trips' })).toBeVisible({ timeout: 30_000 });
  await expect(A2.page.locator('a[href="/trips"]')).toHaveCount(1);
  await A2.context.close();
});
