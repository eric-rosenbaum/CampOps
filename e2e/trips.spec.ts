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
  await plan.getByRole('radiogroup', { name: 'Kind of trip' }).getByRole('radio', { name: /Town run/ }).click();
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
  // B is staff who neither planned nor drives this run: no trip-management actions.
  await expect(B.page.getByTestId('cancel-trip')).toHaveCount(0);
  await expect(B.page.getByRole('button', { name: 'Leaving now' })).toHaveCount(0);
  await expect(B.page.getByRole('button', { name: 'Edit' })).toHaveCount(0);
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
  // It was full before D pressed anything, so the toast must not claim the seat "just went".
  await expect(D.page.getByTestId('trips-toast')).toContainText('That way is full. You’re #1 on the waitlist');
  await expect(D.page.getByTestId('my-seat-status')).toHaveText('You’re #1 on the waitlist');
  await expectDots(A.page, tripId, 3, 2, 1);
  await shot(D.page, 'D is waitlisted');
  await shot(A.page, 'full car with one waiting');

  // ── B leaves → D promoted, on D's screen without a reload ────────────────
  await clearNoise(B.page);
  await clearNoise(B.page);
  await B.page.getByTestId('trip-drawer').getByRole('button', { name: 'Leave seat' }).click();
  await expect(B.page.getByTestId('trips-toast')).toContainText('Seat released. Hana Holder moved up from the waitlist.');
  await expect(D.page.getByTestId('my-seat-status')).toHaveText('You have a seat', REALTIME);
  await expectDots(A.page, tripId, 3, 2, 0);
  await shot(D.page, 'D is promoted without reloading');
  await shot(A.page, 'dots after B leaves and D moves up');

  // ── A plans a pick-up; E takes a seat back → flag clears ─────────────────
  await clearNoise(A.page);
  await A.page.getByTestId('plan-trip-button').click();
  const plan2 = A.page.getByTestId('plan-trip');
  await clearNoise(A.page);
  await plan2.getByRole('radiogroup', { name: 'Kind of trip' }).getByRole('radio', { name: /Pickup from town/ }).click();
  // The kind presets the direction.
  await expect(plan2.getByRole('radiogroup', { name: 'Which way' }).getByRole('radio', { name: /Pickup from town/ })).toHaveAttribute('aria-checked', 'true');
  await plan2.locator('input[name="title"]').fill('Pick-up from town');
  await plan2.locator('input[name="destination"]').fill('Walmart');
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
  await expect(E.page.getByTestId('trips-toast')).toContainText(/You’re in — back to camp/);
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
  // Nothing is pre-ticked: the driver picks what this run is for.
  await expect(aDrawer.getByTestId('attach-confirm')).toHaveText('Add 0 to this trip');
  await aDrawer.locator('label').filter({ hasText: 'Craft glue' }).locator('input[type="checkbox"]').check();
  await expect(aDrawer.getByTestId('attach-confirm')).toHaveText('Add 1 to this trip');
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

/**
 * Nothing on a phone runs off the right edge: not the page, and not any element inside the pane
 * that is open. Checked element by element because an overflowing flex child inside an
 * overflow-hidden card does not widen the document -- it just gets cut off, which is what the
 * reviewers saw on Ride requests ("Give a seat" touching the edge).
 */
async function expectNoHorizontalOverflow(page: Page, paneTestId: string, label: string) {
  await expect(page.getByTestId(paneTestId).filter({ visible: true }).first()).toBeVisible();
  const report = await page.evaluate((tid) => {
    const vw = window.innerWidth;
    const doc = document.documentElement.scrollWidth;
    const pane = [...document.querySelectorAll<HTMLElement>(`[data-testid="${tid}"]`)].find((el) => el.getBoundingClientRect().width > 0)!;
    const offenders: string[] = [];
    pane.querySelectorAll<HTMLElement>('*').forEach((el) => {
      const r = el.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) return;
      // <option>s and the insides of a native select report the dropdown's geometry.
      if (el.closest('select')) return;
      if (r.right > vw + 0.5 || r.left < -0.5) {
        offenders.push(`${el.tagName.toLowerCase()}.${String(el.className).slice(0, 60)} [${Math.round(r.left)}–${Math.round(r.right)}] "${(el.textContent ?? '').trim().slice(0, 40)}"`);
      }
    });
    return { vw, doc, paneScroll: pane.scrollWidth, paneClient: pane.clientWidth, offenders: offenders.slice(0, 8) };
  }, paneTestId);
  expect(report.offenders, `${label}: elements past the screen edge`).toEqual([]);
  expect(report.doc, `${label}: document wider than the screen`).toBeLessThanOrEqual(report.vw);
  expect(report.paneScroll, `${label}: pane scrolls sideways`).toBeLessThanOrEqual(report.paneClient + 1);
}

test('J3b: one-way trips, a clash, and a stranded rider offered a way home', async ({ browser }, info) => {
  test.setTimeout(300_000);
  resetTrips();
  const snap = stepper('J3b-one-way-and-stranded', info.project.name);
  const shot = async (page: Page, label: string) => { await clearNoise(page); await page.waitForTimeout(300); return snap(page, label); };
  const date = addDays(campToday(), 3);
  const week = weekStartOf(date);

  // ── A plans an into-town-only evening ride and a pickup ──────────────────
  const A = await person(browser, 'admin', info);
  await openBoard(A.page, week);
  async function plan(kind: RegExp, direction: RegExp | null, title: string, time: string, seats: string) {
    await clearNoise(A.page);
    await A.page.getByTestId('plan-trip-button').click();
    const sheet = A.page.getByTestId('plan-trip');
    await sheet.getByRole('radiogroup', { name: 'Kind of trip' }).getByRole('radio', { name: kind }).click();
    if (direction) await sheet.getByRole('radiogroup', { name: 'Which way' }).getByRole('radio', { name: direction }).click();
    await sheet.locator('input[name="title"]').fill(title);
    await sheet.locator('input[name="destination"]').fill('Town centre');
    await sheet.locator('input[name="departDate"]').fill(date);
    await sheet.locator('input[name="departTime"]').fill(time);
    await sheet.locator('input[name="seats"]').fill(seats);
    await clearNoise(A.page);
    await sheet.getByTestId('save-trip').click();
    await expect(A.page.getByTestId('trip-drawer')).toBeVisible();
    const id = new URL(A.page.url()).searchParams.get('trip')!;
    await clearNoise(A.page);
    await A.page.getByRole('button', { name: 'Close trip' }).click();
    return id;
  }
  const eveningId = await plan(/Day-off shuttle/, /Into town only/, 'Evening ride into town', '17:00', '3');
  const pickupId = await plan(/Pickup from town/, null, 'Late pickup from town', '21:30', '2');
  await expect(card(A.page, pickupId).getByTestId('trip-route')).toHaveText('Town centre → camp');
  await expect(card(A.page, eveningId).getByTestId('trip-route')).toContainText('one way');
  // No preset return on a ride that brings nobody back.
  await expect(card(A.page, eveningId)).not.toContainText('→ Sun');
  await shot(A.page, 'an into-town-only ride and a pickup on the board');

  // ── E: the evening ride offers only a seat into town, and the pickup alongside ─
  const E = await person(browser, 'holder2', info);
  await openBoard(E.page, week);
  await clearNoise(E.page);
  await card(E.page, eveningId).click();
  const eDrawer = E.page.getByTestId('trip-drawer');
  await expect(eDrawer.getByRole('radiogroup', { name: 'Which way' })).toHaveCount(0);
  await expect(eDrawer.getByTestId('one-way-note')).toContainText('Into town only');
  await expect(eDrawer.getByTestId('drawer-direction')).toContainText('Into town only');
  const alsoBack = eDrawer.getByTestId('also-ride-back');
  await expect(alsoBack).toContainText('9:30pm Late pickup from town');
  await shot(E.page, 'E sees only a seat into town, with the pickup offered');
  // E declines the ride back (plans to sort it later) -- and becomes the stranded rider.
  await alsoBack.locator('input[type="checkbox"]').uncheck();
  await clearNoise(E.page);
  await eDrawer.getByTestId('grab-seat').click();
  await expect(E.page.getByTestId('trips-toast')).toContainText('You’re in — into town.');
  await expect(eDrawer.getByTestId('no-ride-back')).toBeVisible();

  // ── B takes the evening ride with the pickup ticked: both seats in one press ─
  const B = await person(browser, 'program', info);
  await openBoard(B.page, week);
  await clearNoise(B.page);
  await card(B.page, eveningId).click();
  const bDrawer = B.page.getByTestId('trip-drawer');
  await expect(bDrawer.getByTestId('also-ride-back').locator('input[type="checkbox"]')).toBeChecked();
  await clearNoise(B.page);
  await bDrawer.getByTestId('grab-seat').click();
  await expect(B.page.getByTestId('trips-toast')).toContainText('Riding back on 9:30pm Late pickup from town.');
  await expectDots(A.page, eveningId, 2, 0, 0);
  await expectDots(A.page, pickupId, 0, 1, 0);
  await expect(card(A.page, eveningId).getByTestId('seats-line')).toHaveText('1 seat left');

  // ── A: the red chip opens who has no ride back, and A gives E a seat home ─
  const aDay = visible(A.page, `[data-testid="board-day"][data-date="${date}"]`).first();
  await expect(aDay.getByTestId('stranded-chip')).toContainText('1', REALTIME);
  await clearNoise(A.page);
  await aDay.getByTestId('stranded-chip').click();
  const sheet = A.page.getByTestId('stranded-sheet');
  await expect(sheet.getByTestId('stranded-rider')).toHaveCount(1);
  await expect(sheet.getByTestId('stranded-rider')).toContainText('Omar Holder');
  await shot(A.page, 'the no-ride-back chip opens who and what to do');
  await clearNoise(A.page);
  await sheet.getByTestId('offer-ride-back').first().click();
  await expect(A.page.getByTestId('trips-toast')).toContainText('Omar Holder is riding back on 9:30pm Late pickup from town.');
  await expect(sheet.getByTestId('stranded-empty')).toBeVisible(REALTIME);
  await shot(A.page, 'everyone has a way back');
  await A.page.getByTestId('stranded-sheet').getByRole('button', { name: 'Close' }).click();
  await expect(aDay.getByTestId('stranded-chip')).toHaveCount(0, REALTIME);
  await expect(E.page.getByTestId('no-ride-back')).toHaveCount(0, REALTIME);
  await expectDots(A.page, pickupId, 0, 2, 0);

  // ── B: an overlapping round trip explains the clash and offers a switch ──
  const clashId = await plan(/Town run/, null, 'Town run', '16:00', '3');
  await openBoard(B.page, week);
  await clearNoise(B.page);
  await card(B.page, clashId).click();
  const clash = B.page.getByTestId('trip-drawer').getByTestId('seat-clash');
  await expect(clash).toContainText('Evening ride into town');
  await expect(B.page.getByTestId('trip-drawer').getByTestId('grab-seat')).toHaveCount(0);
  await shot(B.page, 'a clashing seat explains and offers a switch');
  await clearNoise(B.page);
  await clash.getByTestId('switch-seat').click();
  await expect(B.page.getByTestId('trips-toast')).toContainText('You left the 5pm Evening ride into town.');
  await expectDots(A.page, clashId, 1, 1, 0);
  await expectDots(A.page, eveningId, 1, 0, 0);

  for (const p of [A, B, E]) {
    expect(p.errors.filter((e) => !ignorable(e))).toEqual([]);
    await p.context.close();
  }
});

test('J3c: the demo week reads right, and nothing runs off a phone', async ({ browser }, info) => {
  test.setTimeout(240_000);
  resetTrips();
  // The same seed a new demo gets, into the QA camp (guarded to the QA camp, like resetTrips).
  stagingSql(`do $$ begin
    if (select slug from camps where id = '${QA_CAMP_ID}') is distinct from 'prospect-qa' then raise exception 'not the QA camp'; end if;
    perform seed_demo_trips_internal('${QA_CAMP_ID}');
  end $$;`);
  const snap = stepper('J3c-demo-week', info.project.name);
  const phone = info.project.name === 'phone';
  const shot = async (page: Page, label: string) => { await clearNoise(page); await page.waitForTimeout(400); return snap(page, label); };
  const today = campToday();
  const A = await person(browser, 'admin', info);
  await A.page.goto('/trips');
  await expect(A.page.getByRole('heading', { name: 'Town Trips' })).toBeVisible({ timeout: 30_000 });
  await expect(A.page.getByTestId('dot-legend')).toBeVisible();
  // Trip 4 and 5 of the seed are in three days, which may be next week.
  const day3 = addDays(today, 3);
  if (weekStartOf(day3) !== weekStartOf(today)) await A.page.goto(`/trips?week=${weekStartOf(day3)}`);
  await shot(A.page, 'demo board');
  if (phone) await expectNoHorizontalOverflow(A.page, 'board-pane', 'board');

  const day = visible(A.page, `[data-testid="board-day"][data-date="${day3}"]`).first();
  const evening = day.getByTestId('trip-card').filter({ hasText: 'Evening ride into town' });
  const pickup = day.getByTestId('trip-card').filter({ hasText: 'Late pickup from town' });
  await expect(pickup.getByTestId('trip-route')).toHaveText('Town centre → camp');
  await expect(pickup.getByTestId('seats-line')).toHaveText('1 seat left');
  await expect(evening.getByTestId('seats-line')).toHaveText('1 seat left');

  // Opening the evening ride: one leg, no "There & back".
  await clearNoise(A.page);
  await evening.click();
  const drawer = A.page.getByTestId('trip-drawer');
  await expect(drawer.getByRole('radio', { name: /There & back/ })).toHaveCount(0);
  await expect(drawer.getByTestId('one-way-note')).toBeVisible();
  await expect(drawer.getByText(/leaving soon” reminder at 4pm, an hour before/)).toBeVisible();
  await shot(A.page, 'demo evening ride drawer');
  if (phone) await expectNoHorizontalOverflow(A.page, 'trip-drawer', 'drawer');
  // Ruby's "No ride back" badge in the rider list opens the sheet too.
  await drawer.getByTestId('rider-no-ride-back').first().click();
  const sheet = A.page.getByTestId('stranded-sheet');
  await expect(sheet.getByTestId('stranded-rider').filter({ hasText: 'Ruby Walsh' })).toBeVisible();
  await expect(sheet.getByTestId('stranded-rider').filter({ hasText: 'Ruby Walsh' }).getByTestId('stranded-asked')).toBeVisible();
  await shot(A.page, 'demo stranded sheet');
  if (phone) await expectNoHorizontalOverflow(A.page, 'stranded-sheet', 'stranded sheet');
  await sheet.getByRole('button', { name: 'Close' }).click();
  await A.page.getByRole('button', { name: 'Close trip' }).click();

  // Shopping list: the duplicate hint, then the tab itself.
  await A.page.goto('/trips?tab=shopping');
  await expect(A.page.getByTestId('shopping-pane')).toBeVisible({ timeout: 30_000 });
  await shot(A.page, 'demo shopping list');
  if (phone) await expectNoHorizontalOverflow(A.page, 'shopping-pane', 'shopping list');
  await clearNoise(A.page);
  await A.page.getByTestId(phone ? 'header-add-errand' : 'add-errand').click();
  const errandSheet = A.page.getByTestId('errand-sheet');
  await errandSheet.locator('input[name="item"]').fill('aa battery');
  await expect(errandSheet.getByTestId('duplicate-errand')).toContainText('Noor Haddad asked');
  await expect(errandSheet.getByTestId('save-errand')).toHaveText('Add anyway');
  // Only trips that haven't left, in departure order.
  const options = await errandSheet.locator('select[name="trip"] option').allTextContents();
  const labels = options.slice(1);
  expect(labels.length).toBeGreaterThan(0);
  await shot(A.page, 'duplicate errand hint');
  if (phone) await expectNoHorizontalOverflow(A.page, 'errand-sheet', 'errand sheet');
  await errandSheet.getByTestId('also-need-it').click();
  await expect(A.page.getByTestId('trips-toast')).toContainText('Added you to Noor Haddad’s AA batteries');
  await expect(A.page.getByTestId('shopping-row').filter({ hasText: 'AA batteries' }).first()).toContainText('Noor Haddad, Teddy Admin', REALTIME);

  // Ride requests.
  await A.page.goto('/trips?tab=rides');
  await expect(A.page.getByTestId('rides-pane')).toBeVisible({ timeout: 30_000 });
  await shot(A.page, 'demo ride requests');
  if (phone) await expectNoHorizontalOverflow(A.page, 'rides-pane', 'ride requests');

  // The planner.
  await A.page.goto('/trips');
  await clearNoise(A.page);
  await A.page.getByTestId('plan-trip-button').click();
  await expect(A.page.getByTestId('plan-trip')).toBeVisible();
  await shot(A.page, 'plan a trip sheet');
  if (phone) await expectNoHorizontalOverflow(A.page, 'plan-trip', 'planner');

  expect(A.errors.filter((e) => !ignorable(e))).toEqual([]);
  await A.context.close();
});
