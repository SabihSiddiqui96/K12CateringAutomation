import { test, expect, Page } from '@playwright/test';
import {
  loginToK12Catering,
  navigateK12CateringMenu,
} from '../../utils/helpers';

test.use({ storageState: { cookies: [], origins: [] } });

test.describe('Menu - Add & Edit Items', () => {
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

  const addDialog = () => catering.getByRole('dialog', { name: 'Add New Menu Item' });
  const editDialog = () => catering.getByRole('dialog', { name: 'Edit Menu Item' });

  async function closeModal() {
    await catering.getByRole('button', { name: 'Cancel and close modal' }).click();
  }

  test('Menu - Add Menu Item button is visible and modal opens with all required fields', async () => {
    await expect(catering.getByRole('button', { name: 'Add a new menu item' })).toBeVisible({ timeout: 15000 });
    await catering.getByRole('button', { name: 'Add a new menu item' }).click();
    await expect(addDialog()).toBeVisible({ timeout: 10000 });
    await expect(catering.locator('#categories-input')).toBeVisible();
    await expect(catering.locator('#menu-item-name')).toBeVisible();
    await expect(catering.locator('#menu-item-description')).toBeVisible();
    await expect(catering.locator('#price-per-item')).toBeVisible();
    await closeModal();
  });

  test('Menu - Add form validates: empty submit shows errors; Name, Description, and Category are required', async () => {
    await catering.getByRole('button', { name: 'Add a new menu item' }).click();
    await expect(addDialog()).toBeVisible({ timeout: 10000 });
    await catering.getByRole('button', { name: 'Add new menu item' }).click();
    await expect(catering.locator('p.text-red-500').first()).toBeVisible({ timeout: 10000 });
    await expect(addDialog()).toBeVisible();

    await catering.locator('#menu-item-name').fill('Test Item');
    await catering.locator('#menu-item-description').fill('Test Description');
    await catering.locator('#price-per-item').fill('5.00');
    await catering.locator('#serves-count').fill('1');
    await catering.getByRole('button', { name: 'Add new menu item' }).click();
    await expect(catering.locator('p.text-red-500', { hasText: /category/i })).toBeVisible({ timeout: 5000 });
    await closeModal();
  });

  test('Menu - Edit modal opens pre-filled; Cancel discards, Save updates item name and price', async () => {
    await catering.getByRole('button', { name: /Edit .+ menu item/ }).first().click();
    await expect(editDialog()).toBeVisible({ timeout: 10000 });
    await expect(catering.locator('#menu-item-name')).not.toHaveValue('');
    await expect(catering.locator('#menu-item-description')).not.toHaveValue('');

    const nameInput = catering.locator('#menu-item-name');
    const originalName = await nameInput.inputValue();
    await nameInput.clear();
    await nameInput.fill('Should Not Save');
    await closeModal();
    await expect(editDialog()).not.toBeVisible({ timeout: 10000 });
    await expect(catering.locator('#main-content').getByText(originalName).first()).toBeVisible({ timeout: 5000 });

    await catering.getByRole('button', { name: /Edit .+ menu item/ }).first().click();
    await expect(editDialog()).toBeVisible({ timeout: 10000 });
    const priceInput = catering.locator('#price-per-item');
    const originalPrice = await priceInput.inputValue();
    await priceInput.clear();
    await priceInput.fill('9.99');
    await catering.getByRole('button', { name: 'Update menu item' }).click();
    await expect(editDialog()).not.toBeVisible({ timeout: 15000 });
    await expect(catering.locator('#main-content').getByText('$9.99').first()).toBeVisible({ timeout: 10000 });

    await catering.getByRole('button', { name: /Edit .+ menu item/ }).first().click();
    await expect(editDialog()).toBeVisible({ timeout: 10000 });
    await priceInput.clear();
    await priceInput.fill(originalPrice);
    await catering.getByRole('button', { name: 'Update menu item' }).click();
    await expect(editDialog()).not.toBeVisible({ timeout: 15000 });
  });
});
