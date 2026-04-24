import { test, expect, Page } from '@playwright/test';
import {
  loginToK12Catering,
  navigateK12CateringMenu,
} from '../../utils/helpers';

test.use({ storageState: { cookies: [], origins: [] } });

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

test('Contact Us - Page heading is displayed', async () => {
  await expect(catering.locator('h1')).toContainText('Contact Us', { timeout: 10000 });
});

test('Contact Us - Contact Information section heading is visible', async () => {
  await expect(
    catering.getByRole('heading', { name: /Contact Information/i }),
  ).toBeVisible({ timeout: 10000 });
});

test('Contact Us - Hours of Operation section is visible', async () => {
  await expect(
    catering.getByRole('heading', { name: /Hours of Operation/i }),
  ).toBeVisible({ timeout: 10000 });
});

test('Contact Us - Page loads without errors', async () => {
  await expect(catering.getByText(/Error Code: 404|something went wrong/i)).not.toBeVisible();
});
