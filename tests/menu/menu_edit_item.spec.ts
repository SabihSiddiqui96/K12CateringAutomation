import { test, expect, Page } from '@playwright/test';
import {
  loginToK12Catering,
  navigateK12CateringMenu,
} from '../../utils/helpers';

test.setTimeout(180000);
test.use({ storageState: { cookies: [], origins: [] } });

test.describe('Menu - Edit Menu Item', () => {
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

  test('Menu - Clicking edit button on a menu item opens Edit Menu Item modal', async () => {
    await catering
      .getByRole('button', { name: /Edit .+ menu item/ })
      .first()
      .click();
    await expect(
      catering.getByRole('dialog', { name: 'Edit Menu Item' }),
    ).toBeVisible({ timeout: 10000 });
    await catering
      .getByRole('button', { name: 'Cancel and close modal' })
      .click();
  });

  test('Menu - Edit Menu Item modal pre-fills existing item data', async () => {
    await catering
      .getByRole('button', { name: /Edit .+ menu item/ })
      .first()
      .click();
    await expect(
      catering.getByRole('dialog', { name: 'Edit Menu Item' }),
    ).toBeVisible({ timeout: 10000 });
    const nameInput = catering.getByRole('textbox', {
      name: 'Enter menu item name',
    });
    const descInput = catering.getByRole('textbox', {
      name: 'Enter menu item description',
    });
    await expect(nameInput).not.toHaveValue('');
    await expect(descInput).not.toHaveValue('');
    await catering
      .getByRole('button', { name: 'Cancel and close modal' })
      .click();
  });

  test('Menu - Editing menu item name and saving updates the item on the page', async () => {
    await catering
      .getByRole('button', { name: /Edit .+ menu item/ })
      .first()
      .click();
    await expect(
      catering.getByRole('dialog', { name: 'Edit Menu Item' }),
    ).toBeVisible({ timeout: 10000 });

    const nameInput = catering.getByRole('textbox', {
      name: 'Enter menu item name',
    });
    const originalName = await nameInput.inputValue();
    const updatedName = originalName + ' Updated';

    await nameInput.clear();
    await nameInput.fill(updatedName);
    await catering.getByRole('button', { name: 'Update menu item' }).click();
    await expect(
      catering.getByRole('dialog', { name: 'Edit Menu Item' }),
    ).not.toBeVisible({ timeout: 15000 });
    await expect(catering.getByText(updatedName)).toBeVisible({
      timeout: 10000,
    });

    // Restore original name
    await catering
      .getByRole('button', {
        name: new RegExp(`Edit ${updatedName} menu item`),
      })
      .first()
      .click();
    await expect(
      catering.getByRole('dialog', { name: 'Edit Menu Item' }),
    ).toBeVisible({ timeout: 10000 });
    await catering
      .getByRole('textbox', { name: 'Enter menu item name' })
      .clear();
    await catering
      .getByRole('textbox', { name: 'Enter menu item name' })
      .fill(originalName);
    await catering.getByRole('button', { name: 'Update menu item' }).click();
    await expect(
      catering.getByRole('dialog', { name: 'Edit Menu Item' }),
    ).not.toBeVisible({ timeout: 15000 });
  });

  test('Menu - Editing menu item description and saving updates the item', async () => {
    await catering
      .getByRole('button', { name: /Edit .+ menu item/ })
      .first()
      .click();
    await expect(
      catering.getByRole('dialog', { name: 'Edit Menu Item' }),
    ).toBeVisible({ timeout: 10000 });

    const descInput = catering.getByRole('textbox', {
      name: 'Enter menu item description',
    });
    const originalDesc = await descInput.inputValue();
    const updatedDesc = 'Automation updated description';

    await descInput.clear();
    await descInput.fill(updatedDesc);
    await catering.getByRole('button', { name: 'Update menu item' }).click();
    await expect(
      catering.getByRole('dialog', { name: 'Edit Menu Item' }),
    ).not.toBeVisible({ timeout: 15000 });

    // Restore original description
    await catering
      .getByRole('button', { name: /Edit .+ menu item/ })
      .first()
      .click();
    await expect(
      catering.getByRole('dialog', { name: 'Edit Menu Item' }),
    ).toBeVisible({ timeout: 10000 });
    await catering
      .getByRole('textbox', { name: 'Enter menu item description' })
      .clear();
    await catering
      .getByRole('textbox', { name: 'Enter menu item description' })
      .fill(originalDesc);
    await catering.getByRole('button', { name: 'Update menu item' }).click();
    await expect(
      catering.getByRole('dialog', { name: 'Edit Menu Item' }),
    ).not.toBeVisible({ timeout: 15000 });
  });

  test('Menu - Editing menu item price and saving updates the displayed price', async () => {
    await catering
      .getByRole('button', { name: /Edit .+ menu item/ })
      .first()
      .click();
    await expect(
      catering.getByRole('dialog', { name: 'Edit Menu Item' }),
    ).toBeVisible({ timeout: 10000 });

    const priceInput = catering.getByRole('spinbutton', {
      name: 'Price (USD)',
    });
    const originalPrice = await priceInput.inputValue();
    const updatedPrice = '9.99';

    await priceInput.clear();
    await priceInput.fill(updatedPrice);
    await catering.getByRole('button', { name: 'Update menu item' }).click();
    await expect(
      catering.getByRole('dialog', { name: 'Edit Menu Item' }),
    ).not.toBeVisible({ timeout: 15000 });
    await expect(
      catering
        .locator('main[aria-label="Main content"]')
        .getByText('$9.99')
        .first(),
    ).toBeVisible({ timeout: 10000 });

    // Restore original price
    await catering
      .getByRole('button', { name: /Edit .+ menu item/ })
      .first()
      .click();
    await expect(
      catering.getByRole('dialog', { name: 'Edit Menu Item' }),
    ).toBeVisible({ timeout: 10000 });
    await catering.getByRole('spinbutton', { name: 'Price (USD)' }).clear();
    await catering
      .getByRole('spinbutton', { name: 'Price (USD)' })
      .fill(originalPrice);
    await catering.getByRole('button', { name: 'Update menu item' }).click();
    await expect(
      catering.getByRole('dialog', { name: 'Edit Menu Item' }),
    ).not.toBeVisible({ timeout: 15000 });
  });

  test('Menu - Cancelling Edit Menu Item modal discards changes', async () => {
    await catering
      .getByRole('button', { name: /Edit .+ menu item/ })
      .first()
      .click();
    await expect(
      catering.getByRole('dialog', { name: 'Edit Menu Item' }),
    ).toBeVisible({ timeout: 10000 });

    const nameInput = catering.getByRole('textbox', {
      name: 'Enter menu item name',
    });
    const originalName = await nameInput.inputValue();

    await nameInput.clear();
    await nameInput.fill('Should Not Save');
    await catering
      .getByRole('button', { name: 'Cancel and close modal' })
      .click();
    await expect(
      catering.getByRole('dialog', { name: 'Edit Menu Item' }),
    ).not.toBeVisible({ timeout: 10000 });

    // Original name should still be on the page
    await expect(catering.getByText(originalName)).toBeVisible({
      timeout: 10000,
    });
  });

  test('Menu - Deleting a menu item removes it from the list', async () => {
    // First add a throwaway item to delete
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
      .fill('Delete Me Item');
    await catering
      .getByRole('textbox', { name: 'Enter menu item description' })
      .fill('To be deleted');
    await catering
      .getByRole('spinbutton', { name: 'Price (USD)' })
      .fill('1.00');
    await catering.getByRole('spinbutton', { name: 'Serves #' }).fill('1');
    await catering.getByRole('button', { name: 'Add new menu item' }).click();
    await expect(
      catering.getByRole('dialog', { name: 'Add New Menu Item' }),
    ).not.toBeVisible({ timeout: 15000 });

    // Now delete it
    await catering
      .getByRole('button', { name: 'Delete Delete Me Item menu item' })
      .click();
    // Confirm deletion dialog
    await catering.getByRole('button', { name: /confirm|yes|delete/i }).click();
    await expect(catering.getByText('Delete Me Item')).not.toBeVisible({
      timeout: 10000,
    });
  });
});
