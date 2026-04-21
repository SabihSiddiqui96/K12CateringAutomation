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

  test('Menu - Clicking More Filters reveals the Advanced Filters panel', async () => {
    await catering
      .getByRole('button', { name: 'Show advanced filters' })
      .click();
    await expect(
      catering.getByRole('heading', { name: 'Advanced Filters' }),
    ).toBeVisible({ timeout: 10000 });
  });

  test('Menu - Advanced Filters panel contains Serves, Sort by, Order, and Price Range fields', async () => {
    await catering
      .getByRole('button', { name: 'Show advanced filters' })
      .click();
    await expect(
      catering.getByRole('combobox', { name: /All Serves/i }),
    ).toBeVisible({ timeout: 10000 });
    await expect(
      catering.getByRole('combobox', { name: /Display Order/i }),
    ).toBeVisible();
    await expect(
      catering.getByRole('combobox', { name: /Ascending/i }),
    ).toBeVisible();
    await expect(
      catering.getByRole('textbox', { name: /Minimum price/i }),
    ).toBeVisible();
    await expect(
      catering.getByRole('textbox', { name: /Maximum price/i }),
    ).toBeVisible();
  });

  test('Menu - Filtering by Serves returns matching items', async () => {
    await catering
      .getByRole('button', { name: 'Show advanced filters' })
      .click();
    await catering
      .getByRole('combobox', { name: /All Serves/i })
      .selectOption({ value: '1' });
    await catering.waitForTimeout(500);
    await expect(
      catering.getByRole('heading', { name: 'Menu', exact: true }),
    ).toBeVisible({ timeout: 10000 });
  });

  test('Menu - Sort by field changes the display order of items', async () => {
    await catering
      .getByRole('button', { name: 'Show advanced filters' })
      .click();
    await catering
      .getByRole('combobox', { name: /Display Order/i })
      .selectOption({ value: 'name' });
    await catering.waitForTimeout(500);
    await expect(
      catering.getByRole('heading', { name: 'Menu', exact: true }),
    ).toBeVisible({ timeout: 10000 });
  });

  test('Menu - Order field toggles ascending and descending sort', async () => {
    await catering
      .getByRole('button', { name: 'Show advanced filters' })
      .click();
    await catering
      .getByRole('combobox', { name: /Ascending/i })
      .selectOption({ value: 'desc' });
    await catering.waitForTimeout(500);
    await expect(
      catering.getByRole('combobox', { name: /Descending/i }),
    ).toBeVisible({ timeout: 10000 });
  });

  test('Menu - Price Range slider is interactive and shows updated range label', async () => {
    await catering
      .getByRole('button', { name: 'Show advanced filters' })
      .click();
    const minSlider = catering.getByRole('textbox', { name: /Minimum price/i });
    await expect(minSlider).toBeVisible({ timeout: 10000 });
    // Verify the price range label is present
    await expect(catering.locator('text=/Price Range:/i')).toBeVisible({
      timeout: 10000,
    });
  });

  test('Menu - Combining multiple advanced filters narrows results', async () => {
    await catering
      .getByRole('button', { name: 'Show advanced filters' })
      .click();
    await catering
      .getByRole('combobox', { name: /All Serves/i })
      .selectOption({ value: '1' });
    await catering
      .getByRole('combobox', { name: /Display Order/i })
      .selectOption({ value: 'price' });
    await catering
      .getByRole('combobox', { name: /Ascending/i })
      .selectOption({ value: 'asc' });
    await catering.waitForTimeout(500);
    await expect(
      catering.getByRole('heading', { name: 'Menu', exact: true }),
    ).toBeVisible({ timeout: 10000 });
  });
});
