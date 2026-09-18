import { test, expect, type Page } from '@playwright/test';
import { execFileSync } from 'child_process';
import { signIn, stepper, watchConsole } from './support/qa';

// The interface in three languages, and a work order typed in Spanish read in each of them.
//
// Uses a work order whose title contains "(prueba i18n)" in Prospect QA. It is created here
// through staging SQL — the same insert a phone makes — and the server translates it; the journey
// waits for those rows rather than assuming them.

const TITLE = 'Fuga de agua en la cabaña 3 (prueba i18n)';

function sql(q: string): string {
  return execFileSync('scripts/staging-sql.sh', ['-c', q], { encoding: 'utf8' });
}

/** The language select, by value — its visible label is itself translated. */
async function pickLanguage(page: Page, lang: 'en' | 'es' | 'he') {
  await page.locator('select:has(option[value="he"])').first().selectOption(lang);
  await expect(page.locator('html')).toHaveAttribute('lang', lang);
}

test.beforeAll(() => {
  const exists = sql(`select count(*) from issues i join camps c on c.id=i.camp_id
    where c.slug='prospect-qa' and i.title='${TITLE}'`);
  if (!/│\s+[1-9]/.test(exists)) {
    sql(`insert into issues (camp_id, title, description) select id, '${TITLE}',
      'El agua sale por debajo de la puerta del baño y moja todo el piso. Hay que cerrar la llave de paso antes de las 7:00 y cambiar el sello antes del sábado.'
      from camps where slug='prospect-qa'`);
  }
});

test('the login page speaks the language chosen on it, and Hebrew mirrors', async ({ page }, info) => {
  const shot = stepper('multilingual-login', info.project.name);
  const errors = watchConsole(page);
  await page.goto('/login');
  await expect(page.getByRole('button', { name: 'Sign in' })).toBeVisible();
  await shot(page, 'english');

  await pickLanguage(page, 'es');
  await expect(page.getByRole('button', { name: 'Entrar', exact: true })).toBeVisible();
  await shot(page, 'spanish');

  await pickLanguage(page, 'he');
  await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
  await shot(page, 'hebrew');

  await pickLanguage(page, 'en');
  expect(errors.filter((e) => !/favicon|ResizeObserver/.test(e))).toEqual([]);
});

test('a Spanish work order reads in English, Spanish and Hebrew', async ({ page }, info) => {
  test.setTimeout(180_000);
  const shot = stepper('multilingual-board', info.project.name);
  const errors = watchConsole(page);
  await signIn(page, 'admin');
  await pickLanguage(page, 'en');

  await page.goto('/campground');
  // Translated on the server; wait for the English row to arrive over realtime.
  const english = page.getByText('Water leak in cabin 3', { exact: false }).first();
  await expect(english).toBeVisible({ timeout: 90_000 });
  await shot(page, 'board-english');

  await english.click();
  await expect(page.getByRole('button', { name: 'Show original' }).first()).toBeVisible();
  await shot(page, 'detail-english');
  await page.getByRole('button', { name: 'Show original' }).first().click();
  await expect(page.getByText('El agua sale por debajo', { exact: false }).first()).toBeVisible();
  await shot(page, 'detail-english-showing-original');

  // Spanish: the original, with no "translated" marker, and the chrome in Spanish.
  await pickLanguage(page, 'es');
  await page.goto('/campground');
  await expect(page.getByText(TITLE).first()).toBeVisible({ timeout: 30_000 });
  await shot(page, 'board-spanish');

  // Hebrew: mirrored, and the work order in Hebrew.
  await pickLanguage(page, 'he');
  await page.goto('/campground');
  await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
  const hebrew = page.getByText('נזילת מים', { exact: false }).first();
  await expect(hebrew).toBeVisible({ timeout: 90_000 });
  await shot(page, 'board-hebrew');
  await hebrew.click();
  await expect(page.getByRole('button', { name: 'הצגת המקור' }).first()).toBeVisible();
  await shot(page, 'detail-hebrew');

  if (info.project.name === 'desktop') {
    // The sidebar sits on the right in Hebrew.
    const nav = await page.locator('aside, nav').first().boundingBox();
    expect(nav && nav.x).toBeGreaterThan(640);
  }

  // A module that has not been translated is held English and left-to-right.
  await page.goto('/pool');
  await expect(page.locator('[dir="ltr"][lang="en"]').first()).toBeAttached();
  await shot(page, 'pool-under-hebrew');

  await pickLanguage(page, 'en');
  expect(errors.filter((e) => !/favicon|ResizeObserver|GoTrueClient/.test(e))).toEqual([]);
});

test.afterAll(() => {
  // Leave the camp as it was: the test work order goes, and its translations cascade with it.
  sql(`delete from issues where title='${TITLE}' and camp_id=(select id from camps where slug='prospect-qa')`);
});
