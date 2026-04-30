import { test, expect, Page } from '@playwright/test';
import {
  loginToK12Catering,
  navigateK12CateringMenu,
  getDistrictName,
} from '../../utils/helpers';
import { getEnvVar } from '../../utils/env';

test.use({ storageState: { cookies: [], origins: [] } });

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

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
  const categoryButtons = (page: Page) => categoryNav(page).getByRole('button');
  const itemCards = (page: Page) =>
    page
      .locator('article')
      .filter({ has: page.locator('h2, h3, h4') });

  test('Guest Menu - Header shows district name, item count, and navigation buttons', async () => {
    await expect(catering.getByRole('heading', { name: new RegExp(getDistrictName(), 'i') })).toBeVisible({ timeout: 10000 });
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
    await expect(categoryButtons(catering).first()).toBeVisible({ timeout: 10000 });

    const labels = (await categoryButtons(catering).allTextContents())
      .map((text) => text.replace(/\s+/g, ' ').trim())
      .filter(Boolean);
    expect(labels.length).toBeGreaterThanOrEqual(2);
    expect(labels.some((label) => /all categories/i.test(label))).toBeTruthy();

    const selectedCategoryButton = categoryButtons(catering).nth(1);
    const selectedCategory = ((await selectedCategoryButton.textContent()) ?? '')
      .replace(/\d+\s*$/, '')
      .replace(/\s+/g, ' ')
      .trim();
    expect(selectedCategory).toBeTruthy();

    await selectedCategoryButton.click();
    await expect(
      banner(catering).getByText(
        new RegExp(`\\d+\\s+${escapeRegExp(selectedCategory)}\\s+items?`, 'i'),
      ),
    ).toBeVisible({ timeout: 5000 });

    await categoryNav(catering).getByRole('button', { name: /All Categories/i }).click();
    await expect(banner(catering).getByText(/\d+\s+items?/i)).toBeVisible({ timeout: 5000 });
  });

  test('Guest Menu - Item cards show name, allergens, serves, price and Guest viewing badge', async () => {
    const firstItemCard = itemCards(catering).first();
    await expect(firstItemCard).toBeVisible({ timeout: 10000 });
    await expect(firstItemCard.locator('h2, h3, h4').first()).toBeVisible();
    await expect(firstItemCard.getByText(/Allergens:/i)).toBeVisible();
    await expect(firstItemCard.getByText(/Serves:/i)).toBeVisible();
    await expect(firstItemCard.getByText(/Min Order:/i)).toBeVisible();
    await expect(firstItemCard.getByText(/\$[\d,.]+\.\d{2}/)).toBeVisible();
    await expect(firstItemCard.getByText(/Guest viewing/i)).toBeVisible();
  });

  test('Guest Menu - District dropdown opens with searchable list and selecting updates menu', async () => {
    await catering.getByRole('button', { name: 'Select a district to view menu' }).click();
    await expect(catering.getByPlaceholder(/search/i)).toBeVisible({ timeout: 5000 });
    const secondaryDistrict = getEnvVar('SECONDARY_DISTRICT_NAME', { required: false }) || 'Berkeley School District';
    await expect(catering.getByText(secondaryDistrict)).toBeVisible();

    await catering.getByPlaceholder(/search/i).fill(secondaryDistrict.split(' ')[0]);
    await catering.getByText(secondaryDistrict).click();
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
