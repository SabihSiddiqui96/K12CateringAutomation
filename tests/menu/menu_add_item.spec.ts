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

  const dialog = () =>
    catering.getByRole('dialog', { name: 'Add New Menu Item' });
  const openModal = async () => {
    await catering.getByRole('button', { name: 'Add a new menu item' }).click();
    await expect(dialog()).toBeVisible({ timeout: 10000 });
  };
  const closeModal = async () => {
    await catering
      .getByRole('button', { name: 'Cancel and close modal' })
      .click();
    await expect(dialog()).not.toBeVisible({ timeout: 5000 });
  };

  test('Menu - Add Menu Item button is visible on the Menu page', async () => {
    await expect(
      catering.getByRole('button', { name: 'Add a new menu item' }),
    ).toBeVisible({ timeout: 15000 });
  });

  test('Menu - Clicking Add Menu Item opens the Add New Menu Item modal', async () => {
    await openModal();
    await expect(catering.locator('#categories-input')).toBeVisible();
    await expect(catering.locator('#menu-item-name')).toBeVisible();
    await expect(catering.locator('#menu-item-description')).toBeVisible();
    await expect(catering.locator('#price-per-item')).toBeVisible();
    await expect(catering.locator('#serves-count')).toBeVisible();
    await closeModal();
  });

  test('Menu - Submitting with all required fields empty shows validation errors', async () => {
    await openModal();
    await catering.getByRole('button', { name: 'Add new menu item' }).click();
    // Validation errors appear as p.text-red-500
    await expect(catering.locator('p.text-red-500').first()).toBeVisible({
      timeout: 10000,
    });
    await expect(dialog()).toBeVisible(); // modal stays open
    await closeModal();
  });

  test('Menu - Category is required in Add Menu Item form', async () => {
    await openModal();
    await catering.locator('#menu-item-name').fill('Test Item');
    await catering.locator('#menu-item-description').fill('Test Description');
    await catering.locator('#price-per-item').fill('5.00');
    await catering.locator('#serves-count').fill('1');
    await catering.getByRole('button', { name: 'Add new menu item' }).click();
    await expect(
      catering.locator('p.text-red-500', { hasText: /category/i }),
    ).toBeVisible({ timeout: 5000 });
    await expect(dialog()).toBeVisible();
    await closeModal();
  });

  test('Menu - Name is required in Add Menu Item form', async () => {
    await openModal();
    await catering.locator('#menu-item-description').fill('Test Description');
    await catering.locator('#price-per-item').fill('5.00');
    await catering.locator('#serves-count').fill('1');
    await catering.getByRole('button', { name: 'Add new menu item' }).click();
    await expect(
      catering.locator('p.text-red-500', { hasText: 'Name is required' }),
    ).toBeVisible({ timeout: 5000 });
    await expect(dialog()).toBeVisible();
    await closeModal();
  });

  test('Menu - Description is required in Add Menu Item form', async () => {
    await openModal();
    await catering.locator('#menu-item-name').fill('Test Item');
    await catering.locator('#price-per-item').fill('5.00');
    await catering.locator('#serves-count').fill('1');
    await catering.getByRole('button', { name: 'Add new menu item' }).click();
    await expect(
      catering.locator('p.text-red-500', {
        hasText: 'Description is required',
      }),
    ).toBeVisible({ timeout: 5000 });
    await expect(dialog()).toBeVisible();
    await closeModal();
  });

  test('Menu - Price is required in Add Menu Item form', async () => {
    await openModal();
    // Fill category (required to isolate the price error)
    await catering.locator('#categories-input').fill('Drink');
    await catering.locator('#categories-input').press('Enter');
    await catering.locator('#menu-item-name').fill('Test Item');
    await catering.locator('#menu-item-description').fill('Test Description');
    await catering.locator('#serves-count').fill('1');
    // Set price to 0 — invalid (must be greater than 0)
    await catering.locator('#price-per-item').fill('0');
    await catering.getByRole('button', { name: 'Add new menu item' }).click();
    // Price error scoped to dialog
    await expect(
      catering
        .getByRole('dialog', { name: 'Add New Menu Item' })
        .locator('p.text-red-500', { hasText: 'Price must be greater than 0' }),
    ).toBeVisible({ timeout: 5000 });
    await expect(dialog()).toBeVisible();
    await closeModal();
  });
});
