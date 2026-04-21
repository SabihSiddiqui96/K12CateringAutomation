import { test, expect, Page } from '@playwright/test';
import { loginToK12Catering, navigateK12CateringMenu } from '../../utils/helpers';

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
    await catering.getByRole('button', { name: /Edit .+ menu item/ }).first().click();
    await expect(catering.getByRole('dialog', { name: 'Edit Menu Item' })).toBeVisible({ timeout: 10000 });
    await catering.getByRole('button', { name: 'Cancel and close modal' }).click();
  });

  test('Menu - Edit Menu Item modal pre-fills existing item data', async () => {
    await catering.getByRole('button', { name: /Edit .+ menu item/ }).first().click();
    await expect(catering.getByRole('dialog', { name: 'Edit Menu Item' })).toBeVisible({ timeout: 10000 });
    // Name and description fields should not be empty
    const nameInput = catering.getByRole('textbox', { name: 'Enter menu item name' });
    const descInput = catering.getByRole('textbox', { name: 'Enter menu item description' });
    await expect(nameInput).not.toHaveValue('');
    await expect(descInput).not.toHaveValue('');
    await catering.getByRole('button', { name: 'Cancel and close modal' }).click();
  });

  test('Menu - Editing menu item name and saving updates the item on the page', async () => {
    // Get the name of the first edit button to identify which item we're editing
    const firstEditBtn = catering.getByRole('button', { name: /Edit .+ menu item/ }).first();
    const btnLabel = await firstEditBtn.getAttribute('aria-label') ?? '';
    const itemName = btnLabel.replace('Edit ', '').replace(' menu item', '');

    await firstEditBtn.click();
    await expect(catering.getByRole('dialog', { name: 'Edit Menu Item' })).toBeVisible({ timeout: 10000 });

    const nameInput = catering.getByRole('textbox', { name: 'Enter menu item name' });
    const originalName = await nameInput.inputValue();
    const updatedName = originalName + ' Updated';

    await nameInput.triple_click();
    await nameInput.fill(updatedName);
    await catering.getByRole('button', { name: 'Update menu item' }).click();
    await expect(catering.getByRole('dialog', { name: 'Edit Menu Item' })).not.toBeVisible({ timeout: 15000 });

    // Verify updated name appears on page
    await expect(catering.getByText(updatedName)).toBeVisible({ timeout: 10000 });

    // Restore original name
    await catering.getByRole('button', { name: new RegExp(`Edit ${updatedName} menu item`) }).first().click();
    await expect(catering.getByRole('dialog', { name: 'Edit Menu Item' })).toBeVisible({ timeout: 10000 });
    await catering.getByRole('textbox', { name: 'Enter menu item name' }).fill(originalName);
    await catering.getByRole('button', { name: 'Update menu item' }).click();
    await expect(catering.getByRole('dialog', { name: 'Edit Menu Item' })).not.toBeVisible({ timeout: 15000 });
  });

  test('Menu - Editing menu item description and saving updates the item', async () => {
    await catering.getByRole('button', { name: /Edit .+ menu item/ }).first().click();
    await expect(catering.getByRole('dialog', { name: 'Edit Menu Item' })).toBeVisible({ timeout: 10000 });

    const descInput = catering.getByRole('textbox', { name: 'Enter menu item description' });
    const originalDesc = await descInput.inputValue();
    const updatedDesc = 'Automation updated description';

    await descInput.fill(updatedDesc);
    await catering.getByRole('button', { name: 'Update menu item' }).click();
    await expect(catering.getByRole('dialog', { name: 'Edit Menu Item' })).not.toBeVisible({ timeout: 15000 });

    // Restore original description
    await catering.getByRole('button', { name: /Edit .+ menu item/ }).first().click();
    await catering.getByRole('textbox', { name: 'Enter menu item description' }).fill(originalDesc);
    await catering.getByRole('button', { name: 'Update menu item' }).click();
    await expect(catering.getByRole('dialog', { name: 'Edit Menu Item' })).not.toBeVisible({ timeout: 15000 });
  });

  test('Menu - Editing menu item price and saving updates the displayed price', async () => {
    await catering.getByRole('button', { name: /Edit .+ menu item/ }).first().click();
    await expect(catering.getByRole('dialog', { name: 'Edit Menu Item' })).toBeVisible({ timeout: 10000 });

    const priceInput = catering.getByRole('spinbutton', { name: