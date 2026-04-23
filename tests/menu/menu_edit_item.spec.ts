import { test, expect, Page } from '@playwright/test';
import {
  loginToK12Catering,
  navigateK12CateringMenu,
} from '../../utils/helpers';

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

  async function openEditModal() {
    await catering
      .getByRole('button', { name: /Edit .+ menu item/ })
      .first()
      .click();
    const dialog = catering.getByRole('dialog', { name: 'Edit Menu Item' });
    await expect(dialog).toBeVisible({ timeout: 10000 });
    return dialog;
  }

  test('Clicking edit button opens Edit Menu Item modal pre-filled with existing data', async () => {
    const dialog = await openEditModal();
    await expect(
      dialog.getByRole('heading', { name: 'Edit Menu Item' }),
    ).toBeVisible();
    // Name and description are pre-filled (inputs have no aria-label, use id)
    await expect(catering.locator('#menu-item-name')).not.toHaveValue('');
    await expect(catering.locator('#menu-item-description')).not.toHaveValue(
      '',
    );
    await catering
      .getByRole('button', { name: 'Cancel and close modal' })
      .click();
    await expect(dialog).not.toBeVisible({ timeout: 5000 });
  });

  test('Editing name and description saves correctly, cancel discards changes', async () => {
    const dialog = await openEditModal();
    const nameInput = catering.locator('#menu-item-name');
    const descInput = catering.locator('#menu-item-description');
    const originalName = await nameInput.inputValue();
    const originalDesc = await descInput.inputValue();

    // --- Test CANCEL first ---
    await nameInput.clear();
    await nameInput.fill('Should Not Save');
    await catering
      .getByRole('button', { name: 'Cancel and close modal' })
      .click();
    await expect(dialog).not.toBeVisible({ timeout: 10000 });
    await expect(
      catering.locator('#main-content').getByText(originalName).first(),
    ).toBeVisible({ timeout: 5000 });

    // --- Test SAVE name ---
    await openEditModal();
    const updatedName = originalName + ' Updated';
    await catering.locator('#menu-item-name').clear();
    await catering.locator('#menu-item-name').fill(updatedName);
    await catering.getByRole('button', { name: 'Update menu item' }).click();
    await expect(dialog).not.toBeVisible({ timeout: 15000 });
    await expect(
      catering.locator('#main-content').getByText(updatedName).first(),
    ).toBeVisible({ timeout: 10000 });

    // --- Test SAVE description ---
    await catering
      .getByRole('button', { name: /Edit .+ menu item/ })
      .first()
      .click();
    await expect(dialog).toBeVisible({ timeout: 10000 });
    await catering.locator('#menu-item-description').clear();
    await catering
      .locator('#menu-item-description')
      .fill('Automation updated description');
    await catering.getByRole('button', { name: 'Update menu item' }).click();
    await expect(dialog).not.toBeVisible({ timeout: 15000 });

    // Restore original name and description
    await catering
      .getByRole('button', { name: /Edit .+ menu item/ })
      .first()
      .click();
    await expect(dialog).toBeVisible({ timeout: 10000 });
    await catering.locator('#menu-item-name').clear();
    await catering.locator('#menu-item-name').fill(originalName);
    await catering.locator('#menu-item-description').clear();
    await catering.locator('#menu-item-description').fill(originalDesc);
    await catering.getByRole('button', { name: 'Update menu item' }).click();
    await expect(dialog).not.toBeVisible({ timeout: 15000 });
  });

  test('Editing price saves the updated price on the card', async () => {
    const dialog = await openEditModal();
    const originalPrice = await catering
      .locator('#price-per-item')
      .inputValue();

    await catering.locator('#price-per-item').clear();
    await catering.locator('#price-per-item').fill('9.99');
    await catering.getByRole('button', { name: 'Update menu item' }).click();
    await expect(dialog).not.toBeVisible({ timeout: 15000 });
    await expect(
      catering.locator('#main-content').getByText('$9.99').first(),
    ).toBeVisible({ timeout: 10000 });

    // Restore original price
    await openEditModal();
    await catering.locator('#price-per-item').clear();
    await catering.locator('#price-per-item').fill(originalPrice);
    await catering.getByRole('button', { name: 'Update menu item' }).click();
    await expect(dialog).not.toBeVisible({ timeout: 15000 });
  });
});
