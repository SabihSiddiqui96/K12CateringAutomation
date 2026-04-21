import { test, expect, Page } from '@playwright/test';
import {
  loginToK12Catering,
  navigateK12CateringMenu,
} from '../../utils/helpers';

test.setTimeout(180000);
test.use({ storageState: { cookies: [], origins: [] } });

test.describe('Guest Menu - Catalog Banner', () => {
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

  // Scope all banner checks to the gradient banner div
  const banner = (catering: Page) =>
    catering.locator('div.bg-linear-to-r.from-blue-500.to-purple-600');

  test('Guest Menu - Menu Catalog banner displays title and subtitle', async () => {
    await expect(
      catering.getByRole('heading', { name: 'Menu Catalog' }),
    ).toBeVisible({ timeout: 10000 });
    await expect(
      catering.getByText('Discover our carefully crafted menu items'),
    ).toBeVisible();
  });

  test('Guest Menu - Catalog banner shows item count and category count badges', async () => {
    await expect(banner(catering).getByText(/\d+ items/)).toBeVisible({
      timeout: 10000,
    });
    await expect(banner(catering).getByText(/\d+ categories/)).toBeVisible();
  });

  test('Guest Menu - District dropdown opens and shows a searchable list of districts', async () => {
    await catering
      .getByRole('button', { name: 'Select a district to view menu' })
      .click();
    await expect(catering.getByPlaceholder(/search/i)).toBeVisible({
      timeout: 5000,
    });
    await expect(catering.getByText('Berkeley School District')).toBeVisible();
  });

  test('Guest Menu - Selecting a different district updates the menu content', async () => {
    await catering
      .getByRole('button', { name: 'Select a district to view menu' })
      .click();
    await catering.getByPlaceholder(/search/i).fill('Berkeley');
    await catering.getByText('Berkeley School District').click();
    await catering.waitForLoadState('networkidle');
    await expect(banner(catering).getByText(/\d+ items/)).toBeVisible({
      timeout: 10000,
    });
  });
});
