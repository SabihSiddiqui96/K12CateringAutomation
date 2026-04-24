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
  await navigateK12CateringMenu(catering, 'Address Book');
  await catering.waitForLoadState('domcontentloaded');
});

test('Address Book - Page heading is displayed', async () => {
  await expect(catering.locator('h1')).toContainText('Address Book', { timeout: 10000 });
});

test('Address Book - Subtitle is visible', async () => {
  await expect(
    catering.getByText(/Manage your saved locations and contact information/i),
  ).toBeVisible({ timeout: 10000 });
});

test('Address Book - Total Addresses count is displayed', async () => {
  await expect(
    catering.getByRole('heading', { name: /^\d+$/ }).first(),
  ).toBeVisible({ timeout: 10000 });
});

test('Address Book - Add New Location button is visible', async () => {
  await expect(
    catering.getByRole('button', { name: /Add a new location to your address book/i }),
  ).toBeVisible({ timeout: 10000 });
});

test('Address Book - Locations List heading is visible', async () => {
  await expect(
    catering.getByRole('heading', { name: /Locations List/i }),
  ).toBeVisible({ timeout: 10000 });
});
