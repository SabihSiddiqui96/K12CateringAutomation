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

test('Address Book - Search is available when locations exist', async () => {
  const hasLocations = await catering
    .getByText(/No addresses saved yet/i)
    .first()
    .isVisible({ timeout: 3000 })
    .catch(() => false);

  if (hasLocations) {
    // Empty state — search may not be present, test is skipped
    return;
  }

  const searchInput = catering.getByRole('textbox', { name: /Search/i }).first();
  await expect(searchInput).toBeVisible({ timeout: 10000 });
});

test('Address Book - Add New Location button is always visible', async () => {
  await expect(
    catering.getByRole('button', { name: /Add a new location to your address book/i }),
  ).toBeVisible({ timeout: 10000 });
});
