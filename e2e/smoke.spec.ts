import { test, expect } from '@playwright/test';
import { signIn, stepper, watchConsole } from './support/qa';

// Proves the harness: every QA role can sign in to the staging QA camp and reach its dashboard.
for (const role of ['admin', 'kitchen', 'viewer'] as const) {
  test(`smoke: ${role} signs in to the QA camp`, async ({ page }, info) => {
    const shot = stepper('smoke', `${info.project.name}-${role}`);
    const errors = watchConsole(page);
    await signIn(page, role);
    await page.waitForURL(/\/home/);
    await expect(page.getByText('Prospect QA').first()).toBeVisible({ timeout: 20_000 });
    await shot(page, 'home');
    // Nothing was changed, so nothing may claim a change failed to save. Staff used to get this
    // banner on every page from an admin-only roster call.
    await page.waitForTimeout(2500);
    await expect(page.getByRole('alert').filter({ hasText: /didn.t save/ })).toHaveCount(0);
    expect(errors.filter((e) => !/favicon|ResizeObserver/.test(e))).toEqual([]);
  });
}
