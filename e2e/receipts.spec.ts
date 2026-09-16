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
 *   matches → reminds Hana about a charge with no receipt, then marks it as needing none →
 *   deletes the receipt that was snapped twice → the month agrees → exports for QuickBooks, and
 *   the downloaded file is byte-for-byte the golden file.
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
  await mapper.locator('#st-total').fill('126.29');
  await shot(p, 'finance-mapper');
  await mapper.getByRole('button', { name: /Import 7 lines/ }).click();

  const suggestions = p.getByTestId('suggestions');
  await expect(suggestions).toBeVisible();
  await expect(p.getByTestId('month-disagrees')).toBeVisible();
  await shot(p, 'finance-suggestions');
  await p.getByRole('button', { name: /Accept all 5/ }).click();
  await expect(suggestions).toHaveCount(0);
  await expect(p.getByTestId('matched').locator('li')).toHaveCount(5);

  // The fuel charge has no receipt: remind Hana, then accept it has none.
  const fuel = p.getByTestId('missing').locator('li').filter({ hasText: 'MUSKOKA FUEL' });
  await fuel.getByRole('button', { name: /Remind/ }).click();
  await expect(fuel.getByTestId('reminded')).toContainText('Receipt needed: $62.00');
  await shot(p, 'finance-reminded');
  await fuel.getByRole('button', { name: 'No receipt needed' }).click();
  const note = p.getByRole('dialog', { name: 'No receipt needed' });
  await note.getByPlaceholder('Note (optional)').fill('Pump receipt lost, camp truck fuel');
  await note.getByRole('button', { name: 'Save' }).click();
  await expect(p.getByTestId('missing')).toHaveCount(0);

  // The emailed copy of the Blue Heron invoice was snapped twice.
  const orphan = p.getByTestId('orphans').locator('li').filter({ hasText: 'Blue Heron Marine Ltd.' });
  await orphan.getByRole('button', { name: 'Possible duplicate' }).click();
  const compare = p.getByRole('dialog', { name: 'Compare receipts' });
  await expect(compare.locator('[data-compare="original"]')).toContainText('Matched to a statement charge');
  await shot(p, 'finance-compare-duplicate');
  await compare.locator('[data-compare="duplicate"]').getByRole('button', { name: 'Delete this copy' }).click();
  await expect(compare).toHaveCount(0);

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
  await shot(p, 'finance-summary');

  await p.locator('[data-tab="export"]').click();
  const exp = p.getByTestId('export');
  await expect(exp.getByTestId('export-preview')).toBeVisible();
  await expect(exp.getByRole('radio', { name: /3 columns/ })).toBeChecked();
  await shot(p, 'finance-export-preview');
  const [download] = await Promise.all([
    p.waitForEvent('download'),
    exp.getByRole('button', { name: /Download and mark exported/ }).click(),
  ]);
  expect(download.suggestedFilename()).toBe('quickbooks-3col-2026-08.csv');
  const file = fs.readFileSync((await download.path())!, 'utf8');
  expect(file).toBe(fs.readFileSync(path.join(root, 'e2e/fixtures/receipts-aug-2026-qbo-3col.golden.csv'), 'utf8'));
  await expect(exp.getByText(/They are marked exported/)).toBeVisible();
  // Nothing is exported twice without asking.
  await expect(exp.getByText(/that have not already been exported/)).toBeVisible();
  await shot(p, 'finance-exported');

  await p.locator('[data-tab="settings"]').click();
  await expect(p.getByText('Confirm these with your finance director.')).toBeVisible();
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
