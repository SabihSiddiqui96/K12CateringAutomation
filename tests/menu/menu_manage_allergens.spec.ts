import { test, expect, Page } from '@playwright/test';
import {
  loginToK12Catering,
  navigateK12CateringMenu,
} from '../../utils/helpers';

test.setTimeout(180000);
test.use({ storageState: { cookies: [], origins: [] } });

test.describe('Menu - Configuration: Manage Allergens', () => {
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

  async function openManageAllergensModal() {
    await catering.getByRole('button', { name: 'Manage allergens' }).click();
    const dialog = catering.getByRole('dialog', { name: 'Manage Allergens' });
    await expect(dialog).toBeVisible({ timeout: 10000 });
    await expect(
      catering.getByRole('button', { name: 'Edit allergen' }).first(),
    ).toBeVisible({ timeout: 10000 });
    return dialog;
  }

  test('Modal opens and displays allergen list', async () => {
    const dialog = await openManageAllergensModal();
    await expect(
      dialog.getByRole('heading', { name: 'Manage Allergens' }),
    ).toBeVisible();
    await expect(
      catering.getByRole('button', { name: 'Edit allergen' }).first(),
    ).toBeVisible();
    // Close with bottom Close button (no aria-label, has text "Close")
    await dialog.getByText('Close').click();
    await expect(dialog).not.toBeVisible({ timeout: 5000 });
  });

  test('Clicking pencil opens inline edit with save and cancel buttons', async () => {
    const dialog = await openManageAllergensModal();
    await catering
      .getByRole('button', { name: 'Edit allergen' })
      .first()
      .click();
    await expect(dialog.getByRole('textbox').first()).toBeVisible({
      timeout: 5000,
    });
    await expect(catering.getByRole('button', { name: 'Save' })).toBeVisible();
    await expect(
      catering.getByRole('button', { name: 'Cancel' }),
    ).toBeVisible();
    // Cancel edit
    await catering.getByRole('button', { name: 'Cancel' }).click();
    await dialog.getByText('Close').click();
    await expect(dialog).not.toBeVisible({ timeout: 5000 });
  });

  test('Saving inline edit updates the allergen name, cancel discards it', async () => {
    const dialog = await openManageAllergensModal();
    const editInput = dialog.getByRole('textbox').first();

    // --- Test CANCEL first ---
    await catering
      .getByRole('button', { name: 'Edit allergen' })
      .first()
      .click();
    await expect(editInput).toBeVisible({ timeout: 5000 });
    const originalName = await editInput.inputValue();
    await editInput.clear();
    await editInput.fill('ShouldNotSave');
    await catering.getByRole('button', { name: 'Cancel' }).click();
    await expect(dialog.getByText('ShouldNotSave')).not.toBeVisible();
    await expect(dialog.getByText(originalName)).toBeVisible({ timeout: 5000 });

    // --- Test SAVE ---
    await catering
      .getByRole('button', { name: 'Edit allergen' })
      .first()
      .click();
    await expect(editInput).toBeVisible({ timeout: 5000 });
    const updatedName = originalName + ' Updated';
    await editInput.clear();
    await editInput.fill(updatedName);
    await catering.getByRole('button', { name: 'Save' }).click();
    await expect(dialog.getByText(updatedName)).toBeVisible({ timeout: 10000 });

    // Restore original name
    await catering
      .getByRole('button', { name: 'Edit allergen' })
      .first()
      .click();
    await expect(editInput).toBeVisible({ timeout: 5000 });
    await editInput.clear();
    await editInput.fill(originalName);
    await catering.getByRole('button', { name: 'Save' }).click();
    await expect(dialog.getByText(originalName)).toBeVisible({
      timeout: 10000,
    });

    await dialog.getByText('Close').click();
    await expect(dialog).not.toBeVisible({ timeout: 5000 });
  });

  test('Modal closes with X button', async () => {
    const dialog = await openManageAllergensModal();
    await catering.getByRole('button', { name: 'Close modal' }).click();
    await expect(dialog).not.toBeVisible({ timeout: 5000 });
  });
});
