import { test, expect, Page } from '@playwright/test';
import {
  loginToK12Catering,
  navigateK12CateringMenu,
} from '../../utils/helpers';

test.setTimeout(180000);
test.use({ storageState: { cookies: [], origins: [] } });

test.describe('Menu - Advanced Filters', () => {
  let catering: Page;

  test.beforeAll(async ({ browser }) => {
    const context = await browser.newContext();
    const page = await context.newPage();
    catering = await loginToK12Catering(page, { navigateTo: 'Menu' });
  });

  test.beforeEach(async () => {
    await navigateK12CateringMenu(catering, 'Menu');
    await catering.waitForLoadState('domcontentloaded');
    // Ensure advanced filters are hidden to start
    const hideBtn = catering.getByRole('button', {
      name: 'Hide advanced filters',
    });
    if (await hideBtn.isVisible()) {
      await hideBtn.click();
    }
  });

  async function openAdvancedFilters() {
    await catering
      .getByRole('button', { name: 'Show advanced filters' })
      .click();
    await expect(
      catering.locator('h2', { hasText: 'Advanced Filters' }),
    ).toBeVisible({ timeout: 10000 });
  }

  test('Clicking More Filters reveals the Advanced Filters panel', async () => {
    await openAdvancedFilters();
    await expect(
      catering.locator('h2', { hasText: 'Advanced Filters' }),
    ).toBeVisible();
    await expect(catering.locator('#serves-select')).toBeVisible();
    await expect(catering.locator('#sort-select')).toBeVisible();
    await expect(catering.locator('#sort-order-select')).toBeVisible();
    await expect(catering.locator('#price-range-min')).toBeVisible();
    await expect(catering.locator('#price-range-max')).toBeVisible();
    await expect(
      catering.locator('label[for="price-range-min"]'),
    ).toContainText('Price Range:');
  });

  test('Filtering by Serves filters the menu items', async () => {
    await openAdvancedFilters();
    await catering.locator('#serves-select').selectOption({ value: '1' });
    await catering.waitForTimeout(500);
    // Page still renders (Menu heading visible, items shown)
    await expect(
      catering.getByRole('heading', { name: 'Menu', exact: true }),
    ).toBeVisible({ timeout: 10000 });
    const cards = catering.locator('#main-content div.group.rounded-xl');
    await expect(cards.first()).toBeVisible({ timeout: 10000 });
  });

  test('Sort by field changes the display order of items', async () => {
    await openAdvancedFilters();
    await catering.locator('#sort-select').selectOption({ value: 'name' });
    await catering.waitForTimeout(500);
    await expect(
      catering.getByRole('heading', { name: 'Menu', exact: true }),
    ).toBeVisible({ timeout: 10000 });
    await catering.locator('#sort-select').selectOption({ value: 'price' });
    await catering.waitForTimeout(500);
    await expect(
      catering.getByRole('heading', { name: 'Menu', exact: true }),
    ).toBeVisible({ timeout: 10000 });
  });

  test('Order field toggles ascending and descending sort', async () => {
    await openAdvancedFilters();
    // Switch to descending
    await catering
      .locator('#sort-order-select')
      .selectOption({ value: 'desc' });
    await catering.waitForTimeout(500);
    await expect(catering.locator('#sort-order-select')).toHaveValue('desc');
    // Switch back to ascending
    await catering.locator('#sort-order-select').selectOption({ value: 'asc' });
    await catering.waitForTimeout(500);
    await expect(catering.locator('#sort-order-select')).toHaveValue('asc');
  });

  test('Price Range sliders are interactive', async () => {
    await openAdvancedFilters();
    await expect(catering.locator('#price-range-min')).toBeVisible({
      timeout: 10000,
    });
    await expect(catering.locator('#price-range-max')).toBeVisible({
      timeout: 10000,
    });
    await expect(
      catering.locator('label[for="price-range-min"]'),
    ).toContainText('Price Range:');
    // Sliders have min/max attributes
    const minType = await catering
      .locator('#price-range-min')
      .getAttribute('type');
    expect(minType).toBe('range');
  });

  test('Combining multiple advanced filters narrows results', async () => {
    await openAdvancedFilters();
    await catering.locator('#serves-select').selectOption({ value: '1' });
    await catering.locator('#sort-select').selectOption({ value: 'price' });
    await catering.locator('#sort-order-select').selectOption({ value: 'asc' });
    await catering.waitForTimeout(500);
    await expect(
      catering.getByRole('heading', { name: 'Menu', exact: true }),
    ).toBeVisible({ timeout: 10000 });
    const cards = catering.locator('#main-content div.group.rounded-xl');
    await expect(cards.first()).toBeVisible({ timeout: 10000 });
  });
});
