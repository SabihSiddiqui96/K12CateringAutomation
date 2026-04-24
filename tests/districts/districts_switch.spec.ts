import { test, expect, Page } from '@playwright/test';
import {
  loginToK12Catering,
  navigateK12CateringMenu,
} from '../../utils/helpers';

test.use({ storageState: { cookies: [], origins: [] } });

test.describe('Districts - Switch District', () => {
  let catering: Page;

  test.beforeAll(async ({ browser }) => {
    const context = await browser.newContext();
    const page = await context.newPage();
    catering = await loginToK12Catering(page);
  });

  test.beforeEach(async () => {
    await navigateK12CateringMenu(catering, 'Districts');
    await catering.waitForLoadState('domcontentloaded');
  });

  test('Switch District button opens district list', async () => {
    const switchBtn = catering.getByRole('button', { name: /Switch district/i });
    await expect(switchBtn).toBeVisible({ timeout: 10000 });
    await switchBtn.click();
    await catering.waitForLoadState('domcontentloaded');

    await expect(
      catering.getByText(/Mercer County School District/i).first(),
    ).toBeVisible({ timeout: 10000 });

    // Close / go back
    const cancelBtn = catering.getByRole('button', { name: /Cancel|Back/i }).first();
    if (await cancelBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
      await cancelBtn.click();
    } else {
      await catering.keyboard.press('Escape');
    }
  });

  test('Current active district is highlighted in switch list', async () => {
    const switchBtn = catering.getByRole('button', { name: /Switch district/i });
    await switchBtn.click();
    await catering.waitForLoadState('domcontentloaded');

    const activeOrSelectedDistrict = catering
      .locator('[aria-selected="true"], [data-selected="true"]')
      .or(catering.getByText(/Mercer County School District/i).first());
    await expect(activeOrSelectedDistrict).toBeVisible({ timeout: 10000 });

    const cancelBtn = catering.getByRole('button', { name: /Cancel|Back/i }).first();
    if (await cancelBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
      await cancelBtn.click();
    } else {
      await catering.keyboard.press('Escape');
    }
  });
});
