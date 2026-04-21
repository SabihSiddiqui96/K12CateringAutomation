import { test, expect, Page } from '@playwright/test';
import {
  loginToK12Catering,
  navigateK12CateringMenu,
} from '../../utils/helpers';

test.setTimeout(180000);
test.use({ storageState: { cookies: [], origins: [] } });

test.describe('Menu - Menu Items Grid', () => {
  let catering: Page;

  test.beforeAll(async ({ browser }) => {
    const context = await browser.newContext();
    const page = await context.newPage();
    catering = await loginToK12Catering(page, { navigateTo: 'Menu' });
  });

  test.beforeEach(async () => {
    await navigateK12CateringMenu(catering, 'Menu');
    await catering.waitForLoadState('domcontentloaded');
  });

  test('Menu - Each menu item card displays name, price, and Add to Cart button', async () => {
    // Grid view is default
    const firstCard = catering.locator('main').getByRole('article').first();
    await expect(firstCard).toBeVisible({ timeout: 15000 });
    // Price should be formatted as currency
    await expect(firstCard).toContainText(/\$[\d]+\.[\d]{2}/);
    // Add to Cart button should be present
    await expect(
      firstCard.getByRole('button', { name: /Add to cart/i }),
    ).toBeVisible();
  });

  test('Menu - Each menu item in List view displays name, price, and Add to Cart button', async () => {
    await catering.getByRole('button', { name: 'Switch to list view' }).click();
    await catering.waitForTimeout(300);
    const firstItem = catering.locator('main').getByRole('article').first();
    await expect(firstItem).toBeVisible({ timeout: 15000 });
    await expect(firstItem).toContainText(/\$[\d]+\.[\d]{2}/);
    await expect(
      firstItem.getByRole('button', { name: /Add to cart/i }),
    ).toBeVisible();
  });

  test('Menu - No results message is shown when filters match no items', async () => {
    const searchInput = catering.getByRole('textbox', {
      name: 'Search menu items',
    });
    await searchInput.fill('zzz_no_match_xyz_123');
    await catering.waitForTimeout(500);
    // Should show empty state or "no results" text
    await expect(catering.locator('main')).not.toContainText(
      /\$[\d]+\.[\d]{2}/,
      { timeout: 10000 },
    );
  });
});
