import { test, expect, Page } from '@playwright/test';
import {
  loginToK12Catering,
  navigateK12CateringMenu,
} from '../../utils/helpers';

test.use({ storageState: { cookies: [], origins: [] } });

test.describe('Contact Us', () => {
  let catering: Page;

  test.beforeAll(async ({ browser }) => {
    const context = await browser.newContext();
    const page = await context.newPage();
    catering = await loginToK12Catering(page);
  });

  test.beforeEach(async () => {
    await navigateK12CateringMenu(catering, 'Contact Us');
    await catering.waitForLoadState('domcontentloaded');
  });

  test('Contact Us - Page heading and main sections are visible', async () => {
    await expect(catering.locator('h1')).toContainText('Contact Us', { timeout: 10000 });
    await expect(catering.getByRole('heading', { name: /Contact Information/i })).toBeVisible();
    await expect(catering.getByRole('heading', { name: /Hours of Operation/i })).toBeVisible();
    await expect(catering.getByText(/Error Code: 404|something went wrong/i)).not.toBeVisible();
  });

  test('Contact Us - Contact cards show names, email links and availability', async () => {
    await expect(catering.getByRole('heading', { level: 3 }).first()).toBeVisible({ timeout: 10000 });
    await expect(catering.getByRole('link').filter({ hasText: /@/i }).first()).toBeVisible();
    await expect(catering.getByText(/Mon.{1,3}Fri|Monday|Sunday/i).first()).toBeVisible();
  });

  test('Contact Us - Hours of Operation shows schedule days', async () => {
    const hoursRegion = catering.locator('section, [role="region"]').filter({
      has: catering.getByText(/Hours of Operation/i),
    }).first();
    await expect(hoursRegion).toBeVisible({ timeout: 10000 });
    await expect(hoursRegion.getByText(/Monday|Tuesday|Wednesday|Sunday/i).first()).toBeVisible();
  });
});
