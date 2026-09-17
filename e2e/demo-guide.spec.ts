import { test, expect } from '@playwright/test';
import { signIn, stepper, watchConsole } from './support/qa';

// The QA demo camp has a brief: the guide is in the nav and shows the camp, the intro, and every
// enabled feature with its module link and checklist.
test('demo guide renders for the QA demo camp', async ({ page }, info) => {
  const shot = stepper('demo-guide', info.project.name);
  const errors = watchConsole(page);
  await signIn(page, 'admin');
  await page.goto('/demo-guide');
  await expect(page.getByTestId('guide-heading')).toHaveText('Prospect QA', { timeout: 20_000 });
  await expect(page.getByText(/This is your camp’s own demo environment/)).toBeVisible();
  for (const k of ['food_requests', 'town_trips', 'receipts']) {
    await expect(page.getByTestId(`feature-${k}`)).toBeVisible();
  }
  await expect(page.getByTestId('feature-town_trips').getByRole('button', { name: 'Open town trips' })).toBeVisible();
  await shot(page, 'guide');
  expect(errors.filter((e) => !/favicon|ResizeObserver/.test(e))).toEqual([]);
});
