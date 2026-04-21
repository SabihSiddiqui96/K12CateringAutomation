import { test, expect, Page } from '@playwright/test';
import {
  loginToK12Catering,
  navigateK12CateringMenu,
} from '../../utils/helpers';

test.setTimeout(180000);
test.use({ storageState: { cookies: [], origins: [] } });

test.describe('Menu - Configuration: Manage Categories', () => {
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

  async function openManageCategoriesModal() {
    await catering
      .getByRole('button', { name: 'Manage menu categories' })
      .click();
    const dialog = catering.getByRole('dialog', { name: 'Manage Categories' });
    await expect(dialog).toBeVisible({ timeout: 10000 });
    const footerCount = catering.locator(
      'div.text-sm.font-medium.text-gray-700',
    );
    await expect(footerCount).toBeVisible({ timeout: 10000 });
    await expect(footerCount).toContainText('categories total', {
      timeout: 10000,
    });
    return dialog;
  }

  async function getFooterCount(): Promise<number> {
    const text =
      (await catering
        .locator('div.text-sm.font-medium.text-gray-700')
        .textContent({ timeout: 10000 })) ?? '';
    const match = text.match(/^(\d+)\s+categories total/);
    return match ? parseInt(match[1]) : 0;
  }

  test('Modal opens and displays layout correctly', async () => {
    const dialog = await openManageCategoriesModal();
    await expect(
      dialog.getByRole('heading', { name: 'Manage Categories' }),
    ).toBeVisible();
    await expect(dialog.getByText('Add New Category')).toBeVisible();
    await expect(catering.locator('#new-category-input')).toBeVisible();
    await expect(dialog.getByText('Existing Categories')).toBeVisible();
    const handles = catering.locator('[aria-label="Drag to reorder category"]');
    expect(await handles.count()).toBeGreaterThan(0);
    const footerCount = catering.locator(
      'div.text-sm.font-medium.text-gray-700',
    );
    await expect(footerCount).toContainText('categories total');
    await catering.getByRole('button', { name: 'Close modal' }).first().click();
  });

  test('Adding a category with a name adds it to the list', async () => {
    await openManageCategoriesModal();
    const countBefore = await getFooterCount();
    const newName = `TestCat_${Date.now()}`;
    await catering.locator('#new-category-input').fill(newName);
    await catering.getByRole('button', { name: 'Add new category' }).click();
    await expect(
      catering.locator('div.text-sm.font-medium.text-gray-700'),
    ).toContainText(`${countBefore + 1} categories total`, { timeout: 10000 });
    // Clean up
    await catering
      .getByRole('button', { name: 'Delete category' })
      .last()
      .click();
    await catering.getByRole('button', { name: 'Close modal' }).first().click();
  });

  test('Adding a category without a name shows validation and does not add it', async () => {
    const dialog = await openManageCategoriesModal();
    const countBefore = await getFooterCount();
    await catering.getByRole('button', { name: 'Add new category' }).click();
    await expect(dialog.getByText('Category name is required')).toBeVisible({
      timeout: 5000,
    });
    await expect(
      catering.locator('div.text-sm.font-medium.text-gray-700'),
    ).toContainText(`${countBefore} categories total`, { timeout: 5000 });
    await catering.getByRole('button', { name: 'Close modal' }).first().click();
  });

  test('Editing a category name — save updates it, cancel discards it', async () => {
    const dialog = await openManageCategoriesModal();

    // Open inline edit and cancel — name should be unchanged
    await catering
      .getByRole('button', { name: 'Edit category name' })
      .first()
      .click();
    const editInput = dialog.getByRole('textbox', {
      name: 'Edit category name',
    });
    await expect(editInput).toBeVisible({ timeout: 5000 });
    const originalName = await editInput.inputValue();
    await editInput.clear();
    await editInput.fill('ShouldNotSave');
    await catering
      .getByRole('button', { name: 'Cancel editing category' })
      .click();
    await expect(dialog.getByText('ShouldNotSave')).not.toBeVisible();
    await expect(dialog.getByText(originalName)).toBeVisible({ timeout: 5000 });

    // Open inline edit and save — name should update
    await catering
      .getByRole('button', { name: 'Edit category name' })
      .first()
      .click();
    await expect(editInput).toBeVisible({ timeout: 5000 });
    const updatedName = `Renamed_${Date.now()}`;
    await editInput.clear();
    await editInput.fill(updatedName);
    await catering
      .getByRole('button', { name: 'Save category changes' })
      .click();
    await expect(dialog.getByText(updatedName)).toBeVisible({ timeout: 10000 });

    // Restore original name
    await catering
      .getByRole('button', { name: 'Edit category name' })
      .first()
      .click();
    await expect(editInput).toBeVisible({ timeout: 5000 });
    await editInput.clear();
    await editInput.fill(originalName);
    await catering
      .getByRole('button', { name: 'Save category changes' })
      .click();
    await expect(dialog.getByText(originalName)).toBeVisible({
      timeout: 10000,
    });

    await catering.getByRole('button', { name: 'Close modal' }).first().click();
  });

  test('Eye icon toggles category active/inactive state', async () => {
    const dialog = await openManageCategoriesModal();
    // Deactivate an active category
    await catering
      .getByRole('button', { name: 'Deactivate category' })
      .first()
      .click();
    await expect(
      catering.getByRole('button', { name: 'Activate category' }).first(),
    ).toBeVisible({ timeout: 5000 });
    // Re-activate it
    await catering
      .getByRole('button', { name: 'Activate category' })
      .first()
      .click();
    await expect(
      catering.getByRole('button', { name: 'Deactivate category' }).first(),
    ).toBeVisible({ timeout: 5000 });
    await catering.getByRole('button', { name: 'Close modal' }).first().click();
  });

  test('Deleting a category reduces the count by one', async () => {
    await openManageCategoriesModal();
    // Add a fresh category to safely delete
    const tempName = `DeleteMe_${Date.now()}`;
    await catering.locator('#new-category-input').fill(tempName);
    await catering.getByRole('button', { name: 'Add new category' }).click();
    await expect(
      catering.locator('div.text-sm.font-medium.text-gray-700'),
    ).toContainText('categories total', { timeout: 10000 });
    const countAfterAdd = await getFooterCount();

    await catering
      .getByRole('button', { name: 'Delete category' })
      .last()
      .click();
    await expect(
      catering.locator('div.text-sm.font-medium.text-gray-700'),
    ).toContainText(`${countAfterAdd - 1} categories total`, {
      timeout: 10000,
    });
    await catering.getByRole('button', { name: 'Close modal' }).first().click();
  });

  test('Categories in use have the delete button disabled', async () => {
    const dialog = await openManageCategoriesModal();
    const disabledDelete = catering
      .getByRole('button', { name: 'Cannot delete - category is in use' })
      .first();
    await expect(disabledDelete).toBeVisible({ timeout: 5000 });
    await expect(disabledDelete).toBeDisabled();
    await catering.getByRole('button', { name: 'Close modal' }).first().click();
  });

  test('Modal can be closed with X, Cancel, or Done', async () => {
    // Close with X
    let dialog = await openManageCategoriesModal();
    await catering.locator('[aria-label="Close modal"]').click();
    await expect(dialog).not.toBeVisible({ timeout: 5000 });

    // Close with Cancel
    dialog = await openManageCategoriesModal();
    await catering.locator('button:has-text("Cancel")').click();
    await expect(dialog).not.toBeVisible({ timeout: 5000 });

    // Close with Done
    dialog = await openManageCategoriesModal();
    await catering.locator('button:has-text("Done")').click();
    await expect(dialog).not.toBeVisible({ timeout: 10000 }); // longer timeout for Done
  });
});
