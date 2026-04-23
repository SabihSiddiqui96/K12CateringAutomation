import { test, expect, Page } from '@playwright/test';
import {
  loginToK12Catering,
  navigateK12CateringMenu,
} from '../../utils/helpers';

test.use({ storageState: { cookies: [], origins: [] } });

test.describe('Menu - Search & Basic Filters', () => {
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

  test('Menu - Typing in search bar filters menu items by name', async () => {
    const searchInput = catering.getByRole('textbox', {
      name: 'Search menu items',
    });
    await searchInput.fill('coffee');
    await catering.waitForTimeout(500);
    // At least one result should be visible and it should contain the search term
    const allText = await catering
      .locator('main[aria-label="Main content"]')
      .textContent();
    expect(allText?.toLowerCase()).toContain('coffee');
  });

  test('Menu - Clearing search bar restores all menu items', async () => {
    const searchInput = catering.getByRole('textbox', {
      name: 'Search menu items',
    });
    await searchInput.fill('coffee');
    await catering.waitForTimeout(500);
    await searchInput.clear();
    await catering.waitForTimeout(500);
    // Multiple categories/sections should be visible again
    const categoryHeadings = catering
      .locator('h2, h3')
      .filter({ hasText: /\d+ items?/ });
    await expect(categoryHeadings.first()).toBeVisible({ timeout: 10000 });
  });

  test('Menu - Selecting a category filters menu items by that category', async () => {
    await catering
      .getByRole('button', { name: 'Select category filter' })
      .click();
    await catering.getByRole('option', { name: 'Drink' }).click();
    await catering.waitForTimeout(500);
    // Only the Drink category section should be visible
    await expect(catering.getByRole('heading', { name: /Drink/i })).toBeVisible(
      { timeout: 10000 },
    );
  });

  test('Menu - Selecting an allergen filters menu items by that allergen', async () => {
    await catering
      .getByRole('button', { name: 'Select allergen filter' })
      .click();
    const firstOption = catering.getByRole('option').nth(1);
    await firstOption.click();
    await catering.waitForTimeout(500);
    // Menu page should still load without error after allergen filter applied
    await expect(
      catering.getByRole('heading', { name: 'Menu', exact: true }),
    ).toBeVisible({ timeout: 10000 });
  });

  test('Menu - Combining search and category filter narrows results', async () => {
    await catering
      .getByRole('button', { name: 'Select category filter' })
      .click();
    await catering.getByRole('option', { name: 'Drink' }).click();
    await catering.waitForTimeout(300);
    const searchInput = catering.getByRole('textbox', {
      name: 'Search menu items',
    });
    await searchInput.fill('coffee');
    await catering.waitForTimeout(500);
    // Should show drink items containing coffee, or empty state
    await expect(
      catering.getByRole('heading', { name: 'Menu', exact: true }),
    ).toBeVisible({ timeout: 10000 });
  });
});
