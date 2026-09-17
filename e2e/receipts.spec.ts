import { test, expect, type Page, type BrowserContextOptions, type TestInfo } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';
import { execFileSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { asUser, qaPassword, stepper, watchConsole, QA_USERS } from './support/qa';

/**
 * J4 — Receipts, end to end, against staging.
 *
 *   Hana (card holder, phone or laptop) snaps a coffee-stained receipt → the AI fills it in and
 *   leaves the hidden date amber → she types the date → saves.
 *   Omar (another holder) cannot see Hana's receipts, in the app or through a signed URL.
 *   Teddy (finance) imports August's Visa CSV → checks the guessed columns → accepts the suggested
 *   matches → searches for the fuel receipt, reminds Hana by email, then marks the charge as
 *   needing none → removes the copy snapped twice (asked first, undone once, then for real) → the
 *   month agrees → downloads for review (nothing marked) → exports the QuickBooks bills file, and
 *   the download is byte-for-byte the golden file.
 */

const CARD_HANA = 'ec000000-0000-4000-8000-000000004821';
const root = process.cwd();
const fixture = (p: string) => path.join(root, 'test-fixtures/receipts', p);

function env(): Record<string, string> {
  return Object.fromEntries(fs.readFileSync(path.join(root, '.env.staging'), 'utf8').split('\n')
    .filter((l) => /^[A-Z0-9_]+=/.test(l)).map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1).trim()]));
}

async function clientAs(role: 'holder' | 'holder2' | 'admin') {
  const e = env();
  const c = createClient(e.VITE_SUPABASE_URL, e.VITE_SUPABASE_ANON_KEY, { auth: { persistSession: false } });
  const { error } = await c.auth.signInWithPassword({ email: QA_USERS[role].email, password: qaPassword() });
  if (error) throw error;
  return c;
}

function sql(query: string): string {
  return execFileSync('scripts/staging-sql.sh', ['-c', query], { encoding: 'utf8', env: { ...process.env, OUT: 'json' } });
}

function contextOptions(info: TestInfo): BrowserContextOptions {
  const u = info.project.use;
  return { viewport: u.viewport, userAgent: u.userAgent, deviceScaleFactor: u.deviceScaleFactor, isMobile: u.isMobile, hasTouch: u.hasTouch, acceptDownloads: true, baseURL: u.baseURL };
}

/**
 * A pre-existing bug outside Receipts: every staff page load calls get_camp_staff_personal, which
 * is admin-only, and the fetch layer reports the refusal as "2 changes didn't save", in a banner
 * that covers the bottom-right of the screen. Dismissed here ONLY when that is the RPC it names,
 * so a real failed save from this module still fails the journey.
 */
async function dismissForeignWriteBanner(page: Page) {
  const banner = page.getByRole('alert').filter({ hasText: 'get_camp_staff_personal' });
  await page.addLocatorHandler(banner, async () => {
    await banner.getByText('Dismiss', { exact: true }).click();
  });
}

/** Every HTTP failure the page saw, by URL, so a console "400" can be traced to what failed. */
function watchHttp(page: Page) {
  const failures: string[] = [];
  page.on('response', (r) => { if (r.status() >= 400) failures.push(`${r.status()} ${r.url().split('?')[0]}`); });
  return () => failures.filter((f) => !/get_camp_staff_personal/.test(f));
}

// Console "Failed to load resource" lines carry no URL; watchHttp is what checks those.
const ignorable = (e: string) => /favicon|ResizeObserver|Failed to load resource|realtime|websocket/i.test(e);

test('J4: snap a receipt, reconcile the month, export for QuickBooks', async ({ browser }, info) => {
  test.setTimeout(360_000);
  const rawShot = stepper('j4-receipts', info.project.name);
  // Tabs animate their underline; a screenshot taken mid-transition shows the previous tab lit.
  const shot = async (page: Page, label: string) => { await page.waitForTimeout(400); return rawShot(page, label); };

  // ── Reset the QA camp's receipts and give two seeded receipts their photos ──────────────
  execFileSync('scripts/staging-sql.sh', ['e2e/receipts-reset.sql'], { encoding: 'utf8' });
  const hanaApi = await clientAs('holder');
  const omarApi = await clientAs('holder2');
  const campRow = await hanaApi.from('camps').select('id').eq('slug', 'prospect-qa').single();
  const campId = campRow.data!.id as string;
  for (const [api, id, file] of [[hanaApi, 'ae000000-0000-4000-8000-000000000001', '02-on-hst.jpg'], [omarApi, 'ae000000-0000-4000-8000-000000000006', '09-crumpled.jpg']] as const) {
    const up = await api.storage.from('receipts').upload(`${campId}/${id}.jpg`, fs.readFileSync(fixture(file)), { contentType: 'image/jpeg', upsert: true });
    expect(up.error, `seed photo ${file}`).toBeNull();
  }

  // ── 1. Hana snaps the receipt ────────────────────────────────────────────────────────────
  const hana = await asUser(browser, 'holder', contextOptions(info));
  const hanaErrors = watchConsole(hana.page);
  const hanaHttp = watchHttp(hana.page);
  await dismissForeignWriteBanner(hana.page);
  await hana.page.goto('/receipts');
  await expect(hana.page.getByRole('heading', { name: 'Receipts' })).toBeVisible();
  await expect(hana.page.getByText('Northwind Hardware').filter({ visible: true }).first()).toBeVisible();
  await expect(hana.page.getByText('Harbourview')).toHaveCount(0);
  await shot(hana.page, 'holder-list');

  // The AI read is live with E2E_REAL_AI=1. By default it is the response the deployed function
  // gave for this fixture (vendor, amounts and card read; the stained date returned empty at
  // confidence 0), so the journey does not spend model credit or fail when staging has none.
  // scripts/eval-receipts.mjs is what holds the live function to account.
  if (!process.env.E2E_REAL_AI) {
    await hana.page.route('**/functions/v1/read-receipt', async (route) => {
      const body = route.request().postDataJSON() as { campId: string; path: string };
      expect(body.path).toMatch(new RegExp(`^${campId}/[0-9a-f-]{36}\\.jpg$`));
      await new Promise((r) => setTimeout(r, 1500));
      await route.fulfill({ status: 200, contentType: 'application/json', headers: { 'Access-Control-Allow-Origin': '*' },
        body: fs.readFileSync(path.join(root, 'e2e/fixtures/read-receipt-12-stained-date.json'), 'utf8') });
    });
  }
  await hana.page.locator('[data-testid="snap-input"]').setInputFiles(fixture('12-stained-date.jpg'));
  const dialog = hana.page.getByRole('dialog', { name: 'Check the receipt' });
  await expect(dialog.getByText(/Reading the receipt|Uploading|Preparing/)).toBeVisible();
  await shot(hana.page, 'holder-reading');

  const vendor = dialog.locator('#rc-vendor');
  await expect(vendor).toBeVisible({ timeout: 120_000 });
  await expect(vendor).toHaveValue(/trillium craft supply/i);
  await expect(dialog.locator('#rc-total')).toHaveValue('87.53');
  await expect(dialog.locator('#rc-subtotal')).toHaveValue('77.46');
  await expect(dialog.getByLabel('HST amount')).toHaveValue('10.07');
  await expect(dialog.locator('#rc-card')).toHaveValue(CARD_HANA);
  // The slip prints ····4821 and the card chosen is ··4821: said, so a mismatch would stand out.
  await expect(dialog.getByTestId('card-matches-slip')).toContainText('4821');
  // The coffee stain hides the date: the reader must not guess it, and the form must say so.
  await expect(dialog.locator('[data-amber="date"]')).toBeVisible();
  await shot(hana.page, 'holder-prefilled-date-amber');

  await dialog.locator('#rc-date').fill('2026-08-14');
  await expect(dialog.locator('[data-amber="date"]')).toHaveCount(0);
  if ((await vendor.inputValue()) !== 'Trillium Craft Supply') await vendor.fill('Trillium Craft Supply');
  await dialog.locator('#rc-code').selectOption({ label: 'PRG · Programs' });
  await dialog.locator('#rc-purpose').fill('Paint for craft week');
  await shot(hana.page, 'holder-corrected');
  await dialog.getByRole('button', { name: 'Save receipt' }).click();
  await expect(dialog).toHaveCount(0);
  const row = hana.page.locator('[data-receipt]').filter({ hasText: 'Trillium Craft Supply' }).filter({ visible: true });
  await expect(row).toBeVisible();
  await expect(row.getByText('Ready')).toBeVisible();
  await shot(hana.page, 'holder-saved');

  const saved = await hanaApi.from('receipts').select('id, file_path, status, purchase_date, total, ai_result').eq('vendor', 'Trillium Craft Supply').single();
  expect(saved.data).toMatchObject({ status: 'ready', purchase_date: '2026-08-14', total: 87.53 });
  expect(saved.data!.ai_result.readable).toBe(true);
  expect(hanaErrors.filter((e) => !ignorable(e))).toEqual([]);
  expect(hanaHttp()).toEqual([]);

  // ── 2. Omar cannot see Hana's receipts, in the app or by URL ─────────────────────────────
  const omar = await asUser(browser, 'holder2', contextOptions(info));
  await dismissForeignWriteBanner(omar.page);
  await omar.page.goto('/receipts');
  await expect(omar.page.getByText('Harbourview Books & Gifts').filter({ visible: true }).first()).toBeVisible();
  await expect(omar.page.getByText('Trillium')).toHaveCount(0);
  await expect(omar.page.getByText('Northwind')).toHaveCount(0);
  await expect(omar.page.locator('[data-tab="reconcile"]')).toHaveCount(0);
  await shot(omar.page, 'other-holder-sees-only-own');
  const peek = await omarApi.from('receipts').select('id').eq('id', saved.data!.id);
  expect(peek.data).toEqual([]);
  const signedUrl = await omarApi.storage.from('receipts').createSignedUrl(saved.data!.file_path, 60);
  expect(signedUrl.data?.signedUrl ?? null, 'Omar must not get a signed URL for Hana’s receipt').toBeNull();
  // A deep link to it opens nothing.
  await omar.page.goto(`/receipts?receipt=${saved.data!.id}`);
  await expect(omar.page.getByRole('dialog')).toHaveCount(0);
  await omar.context.close();

  // ── 3. Teddy reconciles August ───────────────────────────────────────────────────────────
  const teddy = await asUser(browser, 'admin', contextOptions(info));
  const teddyErrors = watchConsole(teddy.page);
  const teddyHttp = watchHttp(teddy.page);
  const p: Page = teddy.page;
  await p.goto(`/receipts/reconcile?card=${CARD_HANA}&month=2026-08`);
  await expect(p.getByTestId('statement-import')).toBeVisible();
  await shot(p, 'finance-no-statement');

  await p.getByTestId('statement-file').setInputFiles(fixture('statements/qa-august-2026-rbc-style.csv'));
  const mapper = p.getByTestId('statement-mapper');
  await expect(mapper).toBeVisible();
  await expect(mapper.locator('select[data-column="2"]')).toHaveValue('date');
  await expect(mapper.locator('select[data-column="4"]')).toHaveValue('description');
  await expect(mapper.locator('select[data-column="6"]')).toHaveValue('amount');
  // The location column is description too; Teddy decides he does not want it in the text.
  await mapper.locator('select[data-column="5"]').selectOption('skip');
  await expect(mapper.getByText(/Preview · 7 lines/)).toBeVisible();
  // A typo in the bill's total is caught at once, not discovered later as a month that won't agree.
  await mapper.locator('#st-total').fill('162.29');
  await expect(mapper.getByTestId('total-mismatch')).toContainText('$162.29');
  await expect(mapper.getByRole('button', { name: /Import 7 lines/ })).toBeDisabled();
  await shot(p, 'finance-total-typo');
  await mapper.locator('#st-total').fill('126.29');
  await expect(mapper.getByTestId('total-mismatch')).toHaveCount(0);
  await shot(p, 'finance-mapper');
  await mapper.getByRole('button', { name: /Import 7 lines/ }).click();

  const suggestions = p.getByTestId('suggestions');
  await expect(suggestions).toBeVisible();
  await expect(p.getByTestId('month-disagrees')).toBeVisible();
  // Importing again is visible, not hidden in a menu, and says what it would replace.
  await expect(p.getByTestId('statement-imported')).toContainText('6 charges');
  await shot(p, 'finance-suggestions');
  await p.getByRole('button', { name: /Accept all 5/ }).click();
  await expect(suggestions).toHaveCount(0);
  await expect(p.getByTestId('matched').locator('li')).toHaveCount(5);
  // Every charge but one is matched, yet the month does not agree: the fuel charge, and a receipt
  // on the card with no charge. Both are listed, not just the first.
  const blockers = p.getByTestId('blockers');
  await expect(blockers.locator('[data-blocker="unexplained"]')).toBeVisible();
  await expect(blockers.locator('[data-blocker="no_charge"]')).toBeVisible();

  // The fuel charge has no receipt. Searching every receipt for it finds nothing, so Teddy
  // reminds Hana (by email), then accepts it has none.
  const fuel = p.getByTestId('missing').locator('li').filter({ hasText: 'MUSKOKA FUEL' });
  await fuel.getByRole('button', { name: 'Attach receipt' }).click();
  const attach = p.getByRole('dialog', { name: 'Attach a receipt' });
  await attach.getByPlaceholder(/Search vendor/).fill('fuel');
  await expect(attach.getByTestId('attach-results')).toContainText('No open receipt matches');
  await expect(attach.getByRole('button', { name: 'Upload the receipt' })).toBeVisible();
  await shot(p, 'finance-attach-search');
  await p.keyboard.press('Escape');
  await expect(attach).toHaveCount(0);
  await fuel.getByRole('button', { name: /Email Hana a reminder/ }).click();
  await expect(fuel.getByTestId('reminded')).toContainText('Reminder emailed to qa-holder@example.com');
  await expect(fuel.getByTestId('reminded')).toContainText('If texts were on, it would say: “Receipt needed: $62.00');
  await shot(p, 'finance-reminded');
  await fuel.getByRole('button', { name: 'No receipt needed' }).click();
  const note = p.getByRole('dialog', { name: 'No receipt needed' });
  await note.getByPlaceholder('Note (optional)').fill('Pump receipt lost + camp truck fuel');
  await note.getByRole('button', { name: 'Save' }).click();
  await expect(p.getByTestId('missing')).toHaveCount(0);

  // The emailed copy of the Blue Heron invoice was snapped twice. Removing a copy asks first and
  // can be undone.
  const orphan = p.getByTestId('orphans').locator('li').filter({ hasText: 'Blue Heron Marine Ltd.' });
  await expect(orphan.getByRole('button', { name: 'Wrong card' })).toBeVisible();
  await expect(orphan.getByRole('button', { name: 'Posts next month' })).toBeVisible();
  await shot(p, 'finance-orphan-actions');
  await orphan.getByRole('button', { name: 'It’s a duplicate' }).click();
  const compare = p.getByRole('dialog', { name: 'Compare receipts' });
  await expect(compare.locator('[data-compare="original"]')).toContainText('Matched to the');
  await shot(p, 'finance-compare-duplicate');
  await compare.locator('[data-compare="duplicate"]').getByRole('button', { name: 'Remove this copy' }).click();
  const confirm = p.getByRole('dialog', { name: 'Remove this copy?' });
  await expect(confirm).toContainText('Blue Heron Marine Ltd.');
  await shot(p, 'finance-confirm-remove');
  await confirm.getByRole('button', { name: 'Remove copy' }).click();
  await expect(compare).toHaveCount(0);
  const toast = p.getByTestId('receipts-toast');
  await expect(toast).toContainText('Removed the copy');
  await expect(p.getByTestId('month-agrees')).toBeVisible();
  await shot(p, 'finance-removed-with-undo');
  await toast.getByRole('button', { name: 'Undo' }).click();
  await expect(p.getByTestId('orphans').locator('li').filter({ hasText: 'Blue Heron Marine Ltd.' })).toBeVisible();
  await expect(p.getByTestId('month-disagrees')).toBeVisible();
  // For real this time, and wait for the removal to be sent once the Undo window closes.
  await p.getByTestId('orphans').locator('li').filter({ hasText: 'Blue Heron Marine Ltd.' }).getByRole('button', { name: 'It’s a duplicate' }).click();
  await compare.locator('[data-compare="duplicate"]').getByRole('button', { name: 'Remove this copy' }).click();
  await p.getByRole('dialog', { name: 'Remove this copy?' }).getByRole('button', { name: 'Remove copy' }).click();
  await expect.poll(() => JSON.parse(sql(`select count(*)::int as n from receipts where id = 'ae000000-0000-4000-8000-000000000005'`).replace(/^[^[]*/, ''))[0].n, { timeout: 20_000 }).toBe(0);

  await expect(p.getByTestId('month-agrees')).toBeVisible();
  await expect(p.getByTestId('month-agrees')).toContainText('This month agrees');
  await shot(p, 'finance-month-agrees');

  const queued = JSON.parse(sql(`select body_text, recipient_kind, to_email from scheduled_messages where camp_id = '${campId}' and subject_type = 'statement_line'`).replace(/^[^[]*/, ''));
  expect(queued).toHaveLength(1);
  expect(queued[0]).toMatchObject({ recipient_kind: 'card_holder', to_email: 'qa-holder@example.com' });
  expect(queued[0].body_text).toMatch(/^Receipt needed: \$62\.00 at MUSKOKA FUEL/);

  // ── 4. Summary and export ────────────────────────────────────────────────────────────────
  await p.locator('[data-tab="summary"]').click();
  await expect(p.getByTestId('summary')).toBeVisible();
  await expect(p.getByTestId('summary').getByText('Recoverable (estimate)')).toBeVisible();
  await expect(p.getByTestId('hst-split')).toContainText('federal part');
  await shot(p, 'finance-summary');

  await p.locator('[data-tab="export"]').click();
  const exp = p.getByTestId('export');
  await expect(exp.getByTestId('export-preview')).toBeVisible();
  await expect(exp.getByRole('radio', { name: /bills import/ })).toBeChecked();
  // The file adds up to the bill before anything downloads: $626.29 of charges, less the $500
  // payment that a bill import cannot carry, is the $126.29 statement.
  await expect(exp.getByTestId('export-reconciles')).toContainText('$626.29 in 6 bills');
  await expect(exp.getByTestId('export-reconciles')).toContainText('the statement total ✓');
  await shot(p, 'finance-export-preview');

  // Downloading for review marks nothing.
  const [review] = await Promise.all([p.waitForEvent('download'), exp.getByTestId('download-review').click()]);
  expect(review.suggestedFilename()).toBe('receipts-review-visa-4821-2026-08.csv');
  const reviewText = fs.readFileSync((await review.path())!, 'utf8');
  expect(reviewText).toContain('Pump receipt lost + camp truck fuel');
  expect(reviewText).toContain('PAYMENT - THANK YOU');
  const stillReady = JSON.parse(sql(`select count(*)::int as n from receipts where camp_id = '${campId}' and status = 'exported'`).replace(/^[^[]*/, ''));
  expect(stillReady[0].n).toBe(0);

  const [download] = await Promise.all([
    p.waitForEvent('download'),
    exp.getByTestId('export-qbo').click(),
  ]);
  expect(download.suggestedFilename()).toBe('quickbooks-bills-visa-4821-2026-08.csv');
  const file = fs.readFileSync((await download.path())!, 'utf8');
  // Golden file replaced 2026-09-16, deliberately: the export now follows the statement. It is one
  // bill per August charge on Hana's card at its POSTED date (not Omar's receipt, which is on a card
  // with no statement), with the fuel charge that needed no receipt under the card's default
  // account and its note intact ("+" included), each line's account and HST in their own columns,
  // and the $500 payment left out because QuickBooks' bill import has no credits.
  expect(file).toBe(fs.readFileSync(path.join(root, 'e2e/fixtures/receipts-aug-2026-qbo-bills.golden.csv'), 'utf8'));
  await expect(exp.getByText(/marked exported/)).toBeVisible();
  // Nothing is exported twice without asking.
  await expect(exp.getByTestId('export-qbo')).toBeDisabled();
  await expect(exp.getByText(/Export it again/)).toBeVisible();
  await shot(p, 'finance-exported');

  await p.locator('[data-tab="settings"]').click();
  await expect(p.getByText('Check these match how your camp claims sales tax back.')).toBeVisible();
  await expect(p.locator('[data-basis="psb"]')).toBeChecked();
  await shot(p, 'finance-settings');

  // Hana's receipt is now locked to her.
  await hana.page.goto(`/receipts?receipt=${saved.data!.id}`);
  await expect(hana.page.getByText(/Exported to the books/)).toBeVisible();
  await shot(hana.page, 'holder-exported-locked');

  expect(teddyErrors.filter((e) => !ignorable(e))).toEqual([]);
  expect(teddyHttp()).toEqual([]);
  await hana.context.close();
  await teddy.context.close();
});

/**
 * J4b — the paths J4 does not walk: the reader switched off, a card number that disagrees, and the
 * other ways a receipt with no charge is resolved (posts next month, wrong card), an undated
 * receipt, a typo in the statement total fixed in place, and a replacement that says what it replaces.
 */
test('J4b: typing a receipt in by hand, and every other way a month is made to agree', async ({ browser }, info) => {
  test.setTimeout(300_000);
  const rawShot = stepper('j4b-receipts-edges', info.project.name);
  const shot = async (page: Page, label: string) => { await page.waitForTimeout(400); return rawShot(page, label); };
  execFileSync('scripts/staging-sql.sh', ['e2e/receipts-reset.sql'], { encoding: 'utf8' });

  // ── Hana: the reader is out of credit ────────────────────────────────────────────────────
  const hana = await asUser(browser, 'holder', contextOptions(info));
  await dismissForeignWriteBanner(hana.page);
  await hana.page.goto('/receipts');
  await expect(hana.page.getByRole('heading', { name: 'Receipts' })).toBeVisible();
  await hana.page.route('**/functions/v1/read-receipt', (route) => route.fulfill({
    status: 503, contentType: 'application/json', headers: { 'Access-Control-Allow-Origin': '*' },
    body: JSON.stringify({ readable: false, error: 'Receipt reading is unavailable right now. Enter the details by hand.' }),
  }));
  await hana.page.locator('[data-testid="snap-input"]').setInputFiles(fixture('02-on-hst.jpg'));
  const dialog = hana.page.getByRole('dialog', { name: 'Check the receipt' });
  await expect(dialog.getByText('Not read automatically.')).toBeVisible({ timeout: 60_000 });
  await expect(dialog.getByText(/Automatic reading is switched off right now/)).toBeVisible();
  await dialog.locator('#rc-vendor').fill('Lakeside Hardware');
  await dialog.locator('#rc-date').fill('2026-08-27');
  await dialog.locator('#rc-subtotal').fill('100');
  await dialog.getByRole('button', { name: 'Add a tax line' }).click();
  await dialog.getByLabel('Rate percent').fill('13');
  // The arithmetic a calculator would do: the tax from the rate, the total from the parts.
  await expect(dialog.getByLabel('HST amount')).toHaveValue('13.00');
  await expect(dialog.locator('#rc-total')).toHaveValue('113.00');
  await expect(dialog.getByText('Not read automatically.')).toHaveCount(0);
  await shot(hana.page, 'hand-entry-calculated');
  await dialog.getByRole('button', { name: 'Save receipt' }).click();
  await expect(dialog).toHaveCount(0);

  // ── Hana: the slip names a card that is not the one chosen ───────────────────────────────
  await hana.page.unroute('**/functions/v1/read-receipt');
  await hana.page.route('**/functions/v1/read-receipt', async (route) => {
    const body = JSON.parse(fs.readFileSync(path.join(root, 'e2e/fixtures/read-receipt-12-stained-date.json'), 'utf8'));
    await route.fulfill({ status: 200, contentType: 'application/json', headers: { 'Access-Control-Allow-Origin': '*' }, body: JSON.stringify({ ...body, cardLast4: '9999' }) });
  });
  await hana.page.locator('[data-testid="snap-input"]').setInputFiles(fixture('12-stained-date.jpg'));
  await expect(dialog.locator('#rc-vendor')).toBeVisible({ timeout: 60_000 });
  await expect(dialog.getByTestId('card-mismatch')).toContainText('Receipt shows ····9999; saving to ····4821');
  await shot(hana.page, 'card-mismatch');
  // Escape closes it, leaving the undated receipt waiting for review.
  await hana.page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  await hana.context.close();

  // ── Teddy: August on Hana's card ─────────────────────────────────────────────────────────
  const teddy = await asUser(browser, 'admin', contextOptions(info));
  const p = teddy.page;
  await p.goto(`/receipts/reconcile?card=${CARD_HANA}&month=2026-08`);
  await p.getByTestId('statement-file').setInputFiles(fixture('statements/qa-august-2026-rbc-style.csv'));
  const mapper = p.getByTestId('statement-mapper');
  await mapper.locator('#st-total').fill('126.29');
  await mapper.getByRole('button', { name: /Import 7 lines/ }).click();
  // Four: this journey has no Trillium receipt, so that charge stays unexplained with the fuel.
  await p.getByRole('button', { name: /Accept all 4/ }).click();
  await expect(p.getByTestId('suggestions')).toHaveCount(0);

  const blockers = p.getByTestId('blockers');
  await expect(blockers.locator('[data-blocker="undated"]')).toBeVisible();
  await expect(blockers.locator('[data-blocker="no_charge"]')).toContainText('2 receipts');
  await expect(p.getByTestId('undated').locator('li')).toHaveCount(1);
  await shot(p, 'blockers-undated-and-orphans');

  // Posts next month, with a note.
  const lakeside = p.getByTestId('orphans').locator('li').filter({ hasText: 'Lakeside Hardware' });
  await lakeside.getByRole('button', { name: 'Posts next month' }).click();
  const aside = p.getByRole('dialog', { name: 'Posts next month' });
  await aside.getByPlaceholder(/Note/).fill('Bought on the 27th, posts in September');
  await aside.getByRole('button', { name: 'Set aside' }).click();
  await expect(p.getByTestId('set-aside')).toContainText('Lakeside Hardware');

  // Wrong card: the copy goes to Omar's card.
  const copy = p.getByTestId('orphans').locator('li').filter({ hasText: 'Blue Heron Marine Ltd.' });
  await copy.getByRole('button', { name: 'Wrong card' }).click();
  const move = p.getByRole('dialog', { name: 'Move to another card' });
  await expect(move).toContainText('Visa ··7390');
  await shot(p, 'wrong-card');
  await move.getByRole('button', { name: 'Move receipt' }).click();
  await expect(p.getByTestId('orphans')).toHaveCount(0);

  // A typo in the total, fixed without importing again.
  await p.getByTestId('edit-total').click();
  await p.getByLabel('Statement total').fill('126.30');
  await p.getByLabel('Statement total').press('Enter');
  await expect(blockers.locator('[data-blocker="total_mismatch"]')).toBeVisible();
  await p.getByTestId('edit-total').click();
  await p.getByLabel('Statement total').fill('126.29');
  await p.getByLabel('Statement total').press('Enter');
  await expect(blockers.locator('[data-blocker="total_mismatch"]')).toHaveCount(0);
  await shot(p, 'resolved-except-undated-and-fuel');

  // Replacing says what it replaces.
  await p.getByTestId('replace-statement').click();
  await expect(p.getByTestId('statement-import')).toContainText('already imported, with 6 charges');
  await p.getByTestId('statement-file').setInputFiles(fixture('statements/qa-august-2026-rbc-style.csv'));
  await expect(p.getByTestId('replace-warning')).toContainText('This replaces 6 charges with 6');
  await shot(p, 'replace-warning');
  await p.getByRole('button', { name: 'Start over' }).click();
  await expect(p.getByTestId('statement-imported')).toBeVisible();

  // Tax presets.
  await p.locator('[data-tab="settings"]').click();
  await p.locator('[data-basis="itc"]').check();
  await expect(p.getByLabel('HST provincial part recoverable percent')).toHaveValue('100');
  await p.locator('[data-basis="psb"]').check();
  await expect(p.getByLabel('HST provincial part recoverable percent')).toHaveValue('82');
  await shot(p, 'tax-presets');
  await teddy.context.close();
});
