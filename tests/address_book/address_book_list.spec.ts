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

test('Address Book - Locations list or empty state is shown', async () => {
  const hasEmptyState = await catering
    .getByText(/No addresses saved yet/i)
    .first()
    .isVisible({ timeout: 5000 })
    .catch(() => false);
  const hasLocations = await catering
    .getByRole('row')
    .or(catering.getByRole('listitem'))
    .first()
    .isVisible({ timeout: 5000 })
    .catch(() => false);
  expect(hasEmptyState || hasLocations).toBe(true);
});

test('Address Book - Empty state shows Add Your First Location button', async () => {
  const hasEmptyState = await catering
    .getByText(/No addresses saved yet/i)
    .first()
    .isVisible({ timeout: 3000 })
    .catch(() => false);

  if (hasEmptyState) {
    await expect(
      catering.getByRole('button', { name: /Add your first location to get started/i }),
    ).toBeVisible({ timeout: 10000 });
  }
});

test('Address Book - Total Addresses count is numeric', async () => {
  const countHeading = catering.getByRole('heading', { name: /^\d+$/ }).first();
  await expect(countHeading).toBeVisible({ timeout: 10000 });
  const text = await countHeading.textContent();
  expect(Number(text?.trim())).toBeGreaterThanOrEqual(0);
});
