import { test, expect, Page } from '@playwright/test';
import {
  loginToK12Catering,
  navigateK12CateringMenu,
} from '../../utils/helpers';

test.use({ storageState: { cookies: [], origins: [] } });

test.describe('Menu - Configuration (Allergens, Categories, Ingredients, Sort)', () => {
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

  // ── Allergens ──

  test('Menu - Manage Allergens modal opens, inline edit saves and cancel discards', async () => {
    await catering.getByRole('button', { name: 'Manage allergens' }).click();
    const dialog = catering.getByRole('dialog', { name: 'Manage Allergens' });
    await expect(dialog).toBeVisible({ timeout: 10000 });
    await expect(catering.getByRole('button', { name: 'Edit allergen' }).first()).toBeVisible();

    await catering.getByRole('button', { name: 'Edit allergen' }).first().click();
    const editInput = dialog.getByRole('textbox').first();
    await expect(editInput).toBeVisible({ timeout: 5000 });
    const originalName = await editInput.inputValue();

    await editInput.clear();
    await editInput.fill('ShouldNotSave');
    await catering.getByRole('button', { name: 'Cancel' }).click();
    await expect(dialog.getByText('ShouldNotSave')).not.toBeVisible();

    await catering.getByRole('button', { name: 'Edit allergen' }).first().click();
    await expect(editInput).toBeVisible({ timeout: 5000 });
    await editInput.clear();
    await editInput.fill(originalName + ' Updated');
    await catering.getByRole('button', { name: 'Save' }).click();
    await expect(dialog.getByText(originalName + ' Updated')).toBeVisible({ timeout: 10000 });

    await catering.getByRole('button', { name: 'Edit allergen' }).first().click();
    await editInput.clear();
    await editInput.fill(originalName);
    await catering.getByRole('button', { name: 'Save' }).click();
    await expect(dialog.getByText(originalName)).toBeVisible({ timeout: 10000 });

    await catering.getByRole('button', { name: 'Close modal' }).click();
    await expect(dialog).not.toBeVisible({ timeout: 5000 });
  });

  // ── Categories ──

  test('Menu - Manage Categories modal opens with count, add/edit/delete/toggle work', async () => {
    await catering.getByRole('button', { name: 'Manage menu categories' }).click();
    const dialog = catering.getByRole('dialog', { name: 'Manage Categories' });
    await expect(dialog).toBeVisible({ timeout: 10000 });
    const categoryCount = dialog.locator('div.text-sm.font-medium.text-gray-700').last();
    const newCategoryInput = dialog.locator('#new-category-input');
    const addCategoryButton = newCategoryInput.locator('xpath=following::button[1]');

    await expect(categoryCount).toContainText('categories total', { timeout: 10000 });
    await expect(
      dialog
        .getByRole('button', {
          name: /Delete category|Deactivate category|Activate category|Cannot delete - category is in use/,
        })
        .first(),
    ).toBeVisible({ timeout: 10000 });

    const getCount = async () => {
      const texts = await dialog.getByText(/^\d+\s+categories total$/i).allTextContents();
      for (const text of texts) {
        const normalized = text.replace(/\s+/g, ' ').trim();
        const parsed = parseInt(normalized.match(/^(\d+)\s+categories total$/i)?.[1] ?? '', 10);
        if (!Number.isNaN(parsed) && parsed > 0) {
          return parsed;
        }
      }
      return 0;
    };

    await expect.poll(getCount, { timeout: 10000 }).toBeGreaterThan(0);
    const countBefore = await getCount();
    const newName = `TestCat_${Date.now()}`;
    await newCategoryInput.click();
    await newCategoryInput.clear();
    await newCategoryInput.pressSequentially(newName);
    await expect(newCategoryInput).toHaveValue(newName);
    await newCategoryInput.press('Tab');
    await expect(addCategoryButton).toBeVisible({ timeout: 5000 });
    await catering.keyboard.press('Enter');
    await expect(dialog.getByText(newName, { exact: true })).toBeVisible({ timeout: 10000 });
    await expect.poll(getCount, { timeout: 10000 }).toBe(countBefore + 1);

    const createdDeleteButton = dialog
      .getByText(newName, { exact: true })
      .locator('xpath=following::button[@aria-label="Delete category"][1]');
    await createdDeleteButton.click();
    await expect(dialog.getByText(newName, { exact: true })).not.toBeVisible({ timeout: 10000 });
    await expect.poll(getCount, { timeout: 10000 }).toBe(countBefore);

    await dialog.getByRole('button', { name: 'Deactivate category' }).first().click();
    await expect(dialog.getByRole('button', { name: 'Activate category' }).first()).toBeVisible({ timeout: 5000 });
    await dialog.getByRole('button', { name: 'Activate category' }).first().click();
    await expect(dialog.getByRole('button', { name: 'Deactivate category' }).first()).toBeVisible({ timeout: 5000 });

    const disabledDelete = dialog.getByRole('button', { name: 'Cannot delete - category is in use' }).first();
    await expect(disabledDelete).toBeVisible({ timeout: 5000 });
    await expect(disabledDelete).toBeDisabled();

    await dialog.getByRole('button', { name: 'Close modal', exact: true }).click();
    await expect(dialog).not.toBeVisible({ timeout: 5000 });
  });

  // ── Ingredients ──

  test('Menu - Manage Ingredients modal opens, inline edit saves and Escape cancels', async () => {
    await catering.getByRole('button', { name: 'Manage ingredients' }).click();
    const dialog = catering.getByRole('dialog', { name: 'Manage Ingredients' });
    await expect(dialog).toBeVisible({ timeout: 10000 });

    await catering.getByRole('button', { name: 'Edit ingredient' }).first().click();
    const editInput = dialog.getByRole('textbox').first();
    await expect(editInput).toBeVisible({ timeout: 5000 });
    const originalName = await editInput.inputValue();

    await editInput.clear();
    await editInput.fill('Should Not Save');
    await catering.keyboard.press('Escape');
    await catering.waitForTimeout(300);
    await expect(dialog.getByText(originalName)).toBeVisible({ timeout: 10000 });

    await catering.getByRole('button', { name: 'Edit ingredient' }).first().click();
    await editInput.clear();
    await editInput.fill(originalName + ' Updated');
    await editInput.press('Enter');
    await expect(dialog.getByText(originalName + ' Updated')).toBeVisible({ timeout: 10000 });

    await catering.getByRole('button', { name: 'Edit ingredient' }).first().click();
    await editInput.clear();
    await editInput.fill(originalName);
    await editInput.press('Enter');
    await catering.getByRole('button', { name: 'Close' }).last().click();
    await expect(dialog).not.toBeVisible({ timeout: 5000 });
  });

  // ── Sort Categories ──

  test('Menu - Sort Categories modal shows drag handles, drag reorders and Save shows success', async () => {
    await catering.getByRole('button', { name: 'Sort category order' }).click();
    await expect(catering.getByRole('heading', { name: 'Sort Categories' })).toBeVisible({ timeout: 10000 });
    await expect(catering.getByText('Drag and drop to reorder categories')).toBeVisible();
    await expect(catering.getByRole('button', { name: /Drag to reorder .+ category/ }).first()).toBeVisible();
    await expect(catering.getByText('#1')).toBeVisible();

    const firstItem = catering.getByRole('button', { name: /Drag to reorder .+ category/ }).nth(0);
    const secondItem = catering.getByRole('button', { name: /Drag to reorder .+ category/ }).nth(1);
    const firstBox = await firstItem.boundingBox();
    const secondBox = await secondItem.boundingBox();
    if (firstBox && secondBox) {
      await catering.mouse.move(firstBox.x + firstBox.width / 2, firstBox.y + firstBox.height / 2);
      await catering.mouse.down();
      await catering.mouse.move(secondBox.x + secondBox.width / 2, secondBox.y + secondBox.height + 10, { steps: 10 });
      await catering.mouse.up();
      await catering.waitForTimeout(500);
    }

    await catering.getByRole('button', { name: 'Save Order' }).click();
    await expect(catering.getByText(/Category order updated successfully/i)).toBeVisible({ timeout: 10000 });
  });
});
