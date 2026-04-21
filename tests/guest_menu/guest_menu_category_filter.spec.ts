import { test, expect, Page } from '@playwright/test';
import {
  loginToK12Catering,
  navigateK12CateringMenu,
} from '../../utils/helpers';

test.setTimeout(180000);
test.use({ storageState: { cookies: [], origins: [] } });

test.describe('Guest Menu - Category Filter', () => {
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

  // Scope all category sidebar checks to the complementary region
  const sidebar = (catering: Page) => catering.getByRole('complementary');
  const categoryNav = (catering: Page) =>
    catering.locator('nav[aria-label="Menu categories"]');

  test('Guest Menu - Category sidebar displays all categories with item counts', async () => {
    await expect(
      catering
        .getByRole('complementary')
        .getByRole('heading', { name: /categories/i }),
    ).toBeVisible({ timeout: 10000 });
    await expect(
      catering.getByRole('complementary').getByText('Drink'),
    ).toBeVisible();
    await expect(
      catering.getByRole('complementary').getByText('Appetizer'),
    ).toBeVisible();
    await expect(
      catering.getByRole('complementary').getByText('Side'),
    ).toBeVisible();
    await expect(
      catering.getByRole('complementary').getByText('Snack'),
    ).toBeVisible();
  });

  test('Guest Menu - All Categories is selected by default and shows all items', async () => {
    // Use the banner badge scoped to main, not the sidebar heading
    await expect(
      catering.locator('div.bg-linear-to-r').getByText(/10 items/),
    ).toBeVisible({ timeout: 10000 });
  });

  test('Guest Menu - Clicking a category filters the items grid to that category only', async () => {
    await categoryNav(catering).getByText('Appetizer').click();
    await expect(
      catering.locator('div.bg-linear-to-r').getByText(/2 appetizer items/i),
    ).toBeVisible({ timeout: 5000 });
    await expect(
      catering.getByRole('heading', { name: /^appetizer$/i }),
    ).toBeVisible();
  });

  test('Guest Menu - Clicking All Categories resets the filter and shows all items', async () => {
    await categoryNav(catering).getByText('Appetizer').click();
    await expect(
      catering.locator('div.bg-linear-to-r').getByText(/2 appetizer items/i),
    ).toBeVisible({ timeout: 5000 });
    await categoryNav(catering).getByText('All Categories').click();
    await expect(
      catering.locator('div.bg-linear-to-r').getByText(/10 items/),
    ).toBeVisible({ timeout: 5000 });
  });

  test('Guest Menu - Menu Items Summary shows total available item count', async () => {
    await expect(
      catering
        .getByRole('complementary')
        .getByRole('heading', { name: 'Menu Items Summary' }),
    ).toBeVisible({ timeout: 10000 });
    await expect(
      catering
        .getByRole('complementary')
        .getByRole('heading', { name: /10 items available/i }),
    ).toBeVisible();
  });
});
