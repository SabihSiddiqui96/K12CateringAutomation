import { test, expect, Page } from '@playwright/test';
import {
  loginToK12Catering,
  navigateK12CateringMenu,
} from '../../utils/helpers';

test.use({ storageState: { cookies: [], origins: [] } });

test.describe('Guest Menu', () => {
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

  const banner = (page: Page) => page.locator('div.bg-linear-to-r.from-blue-500.to-purple-600');
  const categoryNav = (page: Page) => page.locator('nav[aria-label="Menu categories"]');

  test('Guest Menu - Header shows district name, item count, and navigation buttons', async () => {
    await expect(catering.getByRole('heading', { name: /Mercer County School District/i })).toBeVisible({ timeout: 10000 });
    await expect(catering.getByText(/\d+ menu items available/i)).toBeVisible();
    await expect(catering.locator('header').first().getByRole('button', { name: 'Return to menu page' })).toBeVisible();
    await expect(catering.locator('header').first().getByRole('button', { name: 'Return to dashboard' })).toBeVisible();
  });

  test('Guest Menu - Catalog banner shows Menu Catalog heading, item and category counts', async () => {
    await expect(catering.getByRole('heading', { name: 'Menu Catalog' })).toBeVisible({ timeout: 10000 });
    await expect(catering.getByText('Discover our carefully crafted menu items')).toBeVisible();
    await expect(banner(catering).getByText(/\d+ items/)).toBeVisible();
    await expect(banner(catering).getByText(/\d+ categories/)).toBeVisible();
  });

  test('Guest Menu - Category sidebar shows categories and filtering works', async () => {
    await expect(catering.getByRole('complementary').getByRole('heading', { name: /categories/i })).toBeVisible({ timeout: 10000 });
    await expect(catering.getByRole('complementary').getByText('Drink')).toBeVisible();
    await expect(catering.getByRole('complementary').getByText('Appetizer')).toBeVisible();

    await categoryNav(catering).getByText('Appetizer').click();
    await expect(catering.locator('div.bg-linear-to-r').getByText(/2 appetizer items/i)).toBeVisible({ timeout: 5000 });

    await categoryNav(catering).getByText('All Categories').click();
    await expect(catering.locator('div.bg-linear-to-r').getByText(/10 items/)).toBeVisible({ timeout: 5000 });
  });

  test('Guest Menu - Item cards show name, allergens, serves, price and Guest viewing badge', async () => {
    await expect(catering.getByRole('article', { name: 'Menu item: apple juice' })).toBeVisible({ timeout: 10000 });
    await expect(catering.getByText('Allergens:').first()).toBeVisible();
    await expect(catering.getByText('Serves:').first()).toBeVisible();
    await expect(catering.getByText('Min Order:').first()).toBeVisible();
    await expect(catering.getByText('Guest viewing').first()).toBeVisible();
  });

  test('Guest Menu - District dropdown opens with searchable list and selecting updates menu', async () => {
    await catering.getByRole('button', { name: 'Select a district to view menu' }).click();
    await expect(catering.getByPlaceholder(/search/i)).toBeVisible({ timeout: 5000 });
    await expect(catering.getByText('Berkeley School District')).toBeVisible();

    await catering.getByPlaceholder(/search/i).fill('Berkeley');
    await catering.getByText('Berkeley School District').click();
    await catering.waitForLoadState('networkidle');
    await expect(banner(catering).getByText(/\d+ items/)).toBeVisible({ timeout: 10000 });
  });

  test('Guest Menu - Back to Menu button navigates to /menu page', async () => {
    await catering.locator('header').first().getByRole('button', { name: 'Return to menu page' }).click();
    await catering.waitForLoadState('networkidle');
    await expect(catering).toHaveURL(/\/menu/);
    await expect(catering.getByRole('heading', { name: /^menu$/i })).toBeVisible({ timeout: 10000 });
  });

  test('Guest Menu - Download PDF button is visible and triggers file download', async () => {
    await expect(catering.getByRole('button', { name: 'Download menu as PDF' })).toBeVisible({ timeout: 10000 });
    const downloadPromise = catering.waitForEvent('download', { timeout: 15000 });
    await catering.getByRole('button', { name: 'Download menu as PDF' }).click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toMatch(/\.pdf$/i);
  });
});
