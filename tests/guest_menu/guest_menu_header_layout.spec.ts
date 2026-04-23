import { test, expect, Page } from '@playwright/test';
import {
  loginToK12Catering,
  navigateK12CateringMenu,
} from '../../utils/helpers';

test.use({ storageState: { cookies: [], origins: [] } });

test.describe('Guest Menu - Header Layout', () => {
  let catering: Page;

  test.beforeAll(async ({ browser }) => {
    const context = await browser.newContext();
    const page = await context.newPage();
    catering = await loginToK12Catering(page);
  });

  test.beforeEach(async () => {
    await catering.getByRole('button', { name: 'Go to home page' }).click();
    await catering.waitForLoadState('domcontentloaded');
    await navigateK12CateringMenu(catering, 'Guest Menu');
    await catering.waitForLoadState('domcontentloaded');
  });

  test('Guest Menu - Page loads with district name and item count in header', async () => {
    await expect(
      catering.getByRole('heading', { name: /Mercer County School District/i }),
    ).toBeVisible({ timeout: 10000 });
    await expect(catering.getByText(/\d+ menu items available/i)).toBeVisible();
  });

  test('Guest Menu - Back to Menu and Back to Dashboard buttons are visible in header', async () => {
    const header = catering.locator('header').first();
    await expect(
      header.getByRole('button', { name: 'Return to menu page' }),
    ).toBeVisible({ timeout: 10000 });
    await expect(
      header.getByRole('button', { name: 'Return to dashboard' }),
    ).toBeVisible();
  });

  test('Guest Menu - Back to Menu button navigates to the Menu page', async () => {
    await catering
      .locator('header')
      .first()
      .getByRole('button', { name: 'Return to menu page' })
      .click();
    await catering.waitForLoadState('networkidle');
    await expect(catering).toHaveURL(/\/menu/);
    await expect(
      catering.getByRole('heading', { name: /^menu$/i }),
    ).toBeVisible({ timeout: 10000 });
  });

  test('Guest Menu - Back to Dashboard button navigates to the Dashboard page', async () => {
    await catering
      .locator('header')
      .first()
      .getByRole('button', { name: 'Return to dashboard' })
      .click();
    await catering.waitForLoadState('networkidle');
    await expect(catering).toHaveURL(/\/dashboard/);
  });
});
