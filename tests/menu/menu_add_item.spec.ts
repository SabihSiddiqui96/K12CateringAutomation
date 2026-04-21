import { test, expect, Page } from '@playwright/test';
import {
  loginToK12Catering,
  navigateK12CateringMenu,
} from '../../utils/helpers';

test.setTimeout(180000);
test.use({ storageState: { cookies: [], origins: [] } });

test.describe('Menu - Add Menu Item', () => {
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

  test('Menu - Add Menu Item button is visible on the Menu page', async () => {
    await expect(
      catering.getByRole('button', { name: 'Add a new menu item' }),
    ).toBeVisible({ timeout: 15000 });
  });

  test('Menu - Clicking Add Menu Item opens the Add New Menu Item modal', async () => {
    await catering.getByRole('button', { name: 'Add a new menu item' }).click();
    await expect(
      catering.getByRole('dialog', { name: 'Add New Menu Item' }),
    ).toBeVisible({ timeout: 10000 });
    await expect(
      catering.getByRole('textbox', {
        name: 'Add categories for this menu item',
      }),
    ).toBeVisible();
    await expect(
      catering.getByRole('textbox', { name: 'Enter menu item name' }),
    ).toBeVisible();
    await expect(
      catering.getByRole('textbox', { name: 'Enter menu item description' }),
    ).toBeVisible();
    await expect(
      catering.getByRole('spinbutton', { name: 'Price (USD)' }),
    ).toBeVisible();
    await expect(
      catering.getByRole('spinbutton', { name: 'Serves #' }),
    ).toBeVisible();
    await catering
      .getByRole('button', { name: 'Cancel and close modal' })
      .click();
  });

  test('Menu - Submitting Add Menu Item with all required fields empty shows validation errors', async () => {
    await catering.getByRole('button', { name: 'Add a new menu item' }).click();
    await expect(
      catering.getByRole('dialog', { name: 'Add New Menu Item' }),
    ).toBeVisible({ timeout: 10000 });
    await catering.getByRole('button', { name: 'Add new menu item' }).click();
    // At least one validation error should appear
    await expect(
      catering
        .locator('[aria-invalid="true"], .error, [class*="error"]')
        .first(),
    ).toBeVisible({ timeout: 10000 });
    await catering
      .getByRole('button', { name: 'Cancel and close modal' })
      .click();
  });

  test('Menu - Category is required in Add Menu Item form', async () => {
    await catering.getByRole('button', { name: 'Add a new menu item' }).click();
    await expect(
      catering.getByRole('dialog', { name: 'Add New Menu Item' }),
    ).toBeVisible({ timeout: 10000 });
    // Fill all except category
    await catering
      .getByRole('textbox', { name: 'Enter menu item name' })
      .fill('Test Item');
    await catering
      .getByRole('textbox', { name: 'Enter menu item description' })
      .fill('Test Description');
    await catering
      .getByRole('spinbutton', { name: 'Price (USD)' })
      .fill('5.00');
    await catering.getByRole('spinbutton', { name: 'Serves #' }).fill('1');
    await catering.getByRole('button', { name: 'Add new menu item' }).click();
    // Validation error should appear near categories
    await expect(
      catering.getByRole('dialog', { name: 'Add New Menu Item' }),
    ).toBeVisible({ timeout: 10000 });
    await catering
      .getByRole('button', { name: 'Cancel and close modal' })
      .click();
  });

  test('Menu - Name is required in Add Menu Item form', async () => {
    await catering.getByRole('button', { name: 'Add a new menu item' }).click();
    await expect(
      catering.getByRole('dialog', { name: 'Add New Menu Item' }),
    ).toBeVisible({ timeout: 10000 });
    await catering
      .getByRole('textbox', { name: 'Enter menu item description' })
      .fill('Test Description');
    await catering
      .getByRole('spinbutton', { name: 'Price (USD)' })
      .fill('5.00');
    await catering.getByRole('spinbutton', { name: 'Serves #' }).fill('1');
    await catering.getByRole('button', { name: 'Add new menu item' }).click();
    // Modal should remain open (validation failed)
    await expect(
      catering.getByRole('dialog', { name: 'Add New Menu Item' }),
    ).toBeVisible({ timeout: 10000 });
    await catering
      .getByRole('button', { name: 'Cancel and close modal' })
      .click();
  });

  test('Menu - Description is required in Add Menu Item form', async () => {
    await catering.getByRole('button', { name: 'Add a new menu item' }).click();
    await expect(
      catering.getByRole('dialog', { name: 'Add New Menu Item' }),
    ).toBeVisible({ timeout: 10000 });
    await catering
      .getByRole('textbox', { name: 'Enter menu item name' })
      .fill('Test Item');
    await catering
      .getByRole('spinbutton', { name: 'Price (USD)' })
      .fill('5.00');
    await catering.getByRole('spinbutton', { name: 'Serves #' }).fill('1');
    await catering.getByRole('button', { name: 'Add new menu item' }).click();
    await expect(
      catering.getByRole('dialog', { name: 'Add New Menu Item' }),
    ).toBeVisible({ timeout: 10000 });
    await catering
      .getByRole('button', { name: 'Cancel and close modal' })
      .click();
  });

  test('Menu - Price is required in Add Menu Item form', async () => {
    await catering.getByRole('button', { name: 'Add a new menu item' }).click();
    await expect(
      catering.getByRole('dialog', { name: 'Add New Menu Item' }),
    ).toBeVisible({ timeout: 10000 });
    await catering
      .getByRole('textbox', { name: 'Enter menu item name' })
      .fill('Test Item');
    await catering
      .getByRole('textbox', { name: 'Enter menu item description' })
      .fill('Test Description');
    await catering.getByRole('spinbutton', { name: 'Serves #' }).fill('1');
    // Clear price to 0 or empty
    const priceInput = catering.getByRole('spinbutton', {
      name: 'Price (USD)',
    });
    await priceInput.clear();
    await catering.getByRole('button', { name: 'Add new menu item' }).click();
    await expect(
      catering.getByRole('dialog', { name: 'Add New Menu Item' }),
    ).toBeVisible({ timeout: 10000 });
    await catering
      .getByRole('button', { name: 'Cancel and close modal' })
      .click();
  });

  test('Menu - Ingredients, Image, and Min Order Qty are optional', async () => {
    await catering.getByRole('button', { name: 'Add a new menu item' }).click();
    await expect(
      catering.getByRole('dialog', { name: 'Add New Menu Item' }),
    ).toBeVisible({ timeout: 10000 });
    // Select category
    await catering
      .getByRole('textbox', { name: 'Add categories for this menu item' })
      .fill('Drink');
    await catering.getByRole('option', { name: 'Drink' }).click();
    // Fill required fields only
    await catering
      .getByRole('textbox', { name: 'Enter menu item name' })
      .fill('Automation Test Item');
    await catering
      .getByRole('textbox', { name: 'Enter menu item description' })
      .fill('Automation test description');
    await catering
      .getByRole('spinbutton', { name: 'Price (USD)' })
      .fill('1.00');
    await catering.getByRole('spinbutton', { name: 'Serves #' }).fill('1');
    // Leave Ingredients, Image, Min Order Qty blank - submit
    await catering.getByRole('button', { name: 'Add new menu item' }).click();
    // Modal should close on success
    await expect(
      catering.getByRole('dialog', { name: 'Add New Menu Item' }),
    ).not.toBeVisible({ timeout: 15000 });
  });

  test('Menu - Successfully adding a menu item closes modal and adds item to the list', async () => {
    // Count items before
    const itemCountBefore = await catering
      .locator('main')
      .getByRole('article')
      .count();
    await catering.getByRole('button', { name: 'Add a new menu item' }).click();
    await expect(
      catering.getByRole('dialog', { name: 'Add New Menu Item' }),
    ).toBeVisible({ timeout: 10000 });
    await catering
      .getByRole('textbox', { name: 'Add categories for this menu item' })
      .fill('Drink');
    await catering.getByRole('option', { name: 'Drink' }).click();
    await catering
      .getByRole('textbox', { name: 'Enter menu item name' })
      .fill('Automation New Item');
    await catering
      .getByRole('textbox', { name: 'Enter menu item description' })
      .fill('Added by automation test');
    await catering
      .getByRole('spinbutton', { name: 'Price (USD)' })
      .fill('2.00');
    await catering.getByRole('spinbutton', { name: 'Serves #' }).fill('1');
    await catering.getByRole('button', { name: 'Add new menu item' }).click();
    await expect(
      catering.getByRole('dialog', { name: 'Add New Menu Item' }),
    ).not.toBeVisible({ timeout: 15000 });
    // Item count should increase
    const itemCountAfter = await catering
      .locator('main')
      .getByRole('article')
      .count();
    expect(itemCountAfter).toBeGreaterThan(itemCountBefore);
  });
});
