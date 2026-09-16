import { test, expect } from '@playwright/test';
import { signIn, stepper, watchConsole } from './support/qa';

// J5 (part): a demo camp with a brief shows the guide in the nav and renders every spotlight.
test('demo guide renders for the QA demo camp', async ({ page }, info) => {
  const shot = stepper('demo-guide', info.project.name);
  const errors = watchConsole(page);
  await signIn(page, 'admin');
  await page.goto('/demo-guide');
  await expect(page.getByRole('heading', { name: /Built for Teddy/ })).toBeVisible({ timeout: 20_000 });
  await expect(page.getByTestId('spotlight-food_requests')).toBeVisible();
  await shot(page, 'guide');
  expect(errors.filter((e) => !/favicon|ResizeObserver/.test(e))).toEqual([]);
});
