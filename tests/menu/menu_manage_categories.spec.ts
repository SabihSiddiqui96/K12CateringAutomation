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

  test('Menu - Manage Categories modal opens from Configuration', async () => {
    await catering
      .getByRole('button', { name: 'Manage menu categories' })
      .click();
    await expect(
      catering.getByRole('dialog', { name: 'Manage Categories' }),
    ).toBeVisible({ timeout: 10000 });
    await expect(
      catering.getByRole('textbox', { name: /Enter category name/i }),
    ).toBeVisible();
    await expect(
      catering.getByRole('button', { name: 'Add new category' }),
    ).toBeVisible();
    await catering.getByRole('button', { name: 'Close modal' }).click();
  });

  test('Menu - Adding a new category with a name adds it to the list', async () => {
    await catering
      .getByRole('button', { name: 'Manage menu categories' })
      .click();
    await expect(
      catering.getByRole('dialog', { name: 'Manage Categories' }),
    ).toBeVisible({ timeout: 10000 });

    const newCategoryName = 'Automation Category';
    await catering
      .getByRole('textbox', { name: /Enter category name/i })
      .fill(newCategoryName);
    await catering.getByRole('button', { name: 'Add new category' }).click();
    await expect(
      catering.getByRole('dialog').getByText(newCategoryName),
    ).toBeVisible({ timeout: 10000 });

    // Clean up - delete it
    await catering
      .getByRole('button', { name: `Delete category` })
      .last()
      .click();
    await catering.getByRole('button', { name: 'Close modal' }).click();
  });

  test('Menu - Adding a category without a name does not add it', async () => {
    await catering
      .getByRole('button', { name: 'Manage menu categories' })
      .click();
    await expect(
      catering.getByRole('dialog', { name: 'Manage Categories' }),
    ).toBeVisible({ timeout: 10000 });

    const countBefore = await catering
      .getByRole('button', { name: /Drag to reorder category/ })
      .count();
    // Leave name empty and click Add
    await catering.getByRole('button', { name: 'Add new category' }).click();
    await catering.waitForTimeout(300);
    const countAfter = await catering
      .getByRole('button', { name: /Drag to reorder category/ })
      .count();
    expect(countAfter).toBe(countBefore);

    await catering.getByRole('button', { name: 'Close modal' }).click();
  });

  test('Menu - Clicking the pencil icon on a category opens an inline text box', async () => {
    await catering
      .getByRole('button', { name: 'Manage menu categories' })
      .click();
    await expect(
      catering.getByRole('dialog', { name: 'Manage Categories' }),
    ).toBeVisible({ timeout: 10000 });

    await catering
      .getByRole('button', { name: 'Edit category name' })
      .first()
      .click();
    await expect(
      catering.getByRole('textbox', { name: 'Edit category name' }),
    ).toBeVisible({ timeout: 10000 });
    await expect(
      catering.getByRole('button', { name: 'Save category changes' }),
    ).toBeVisible();
    await expect(
      catering.getByRole('button', { name: 'Cancel editing category' }),
    ).toBeVisible();

    await catering
      .getByRole('button', { name: 'Cancel editing category' })
      .click();
    await catering.getByRole('button', { name: 'Close modal' }).click();
  });

  test('Menu - Saving the inline edit updates the category name', async () => {
    await catering
      .getByRole('button', { name: 'Manage menu categories' })
      .click();
    await expect(
      catering.getByRole('dialog', { name: 'Manage Categories' }),
    ).toBeVisible({ timeout: 10000 });

    // Use a category with 0 items so we can edit it freely (water has 0 items)
    await catering
      .getByRole('button', { name: 'Edit category name' })
      .first()
      .click();
    const editInput = catering.getByRole('textbox', {
      name: 'Edit category name',
    });
    const originalName = await editInput.inputValue();
    const updatedName = originalName + ' Edited';

    await editInput.clear();
    await editInput.fill(updatedName);
    await catering
      .getByRole('button', { name: 'Save category changes' })
      .click();
    await expect(
      catering.getByRole('dialog').getByText(updatedName),
    ).toBeVisible({ timeout: 10000 });

    // Restore original name
    await catering
      .getByRole('button', { name: 'Edit category name' })
      .first()
      .click();
    await catering.getByRole('textbox', { name: 'Edit category name' }).clear();
    await catering
      .getByRole('textbox', { name: 'Edit category name' })
      .fill(originalName);
    await catering
      .getByRole('button', { name: 'Save category changes' })
      .click();
    await catering.getByRole('button', { name: 'Close modal' }).click();
  });

  test('Menu - Cancelling the inline edit discards changes', async () => {
    await catering
      .getByRole('button', { name: 'Manage menu categories' })
      .click();
    await expect(
      catering.getByRole('dialog', { name: 'Manage Categories' }),
    ).toBeVisible({ timeout: 10000 });

    await catering
      .getByRole('button', { name: 'Edit category name' })
      .first()
      .click();
    const editInput = catering.getByRole('textbox', {
      name: 'Edit category name',
    });
    const originalName = await editInput.inputValue();

    await editInput.clear();
    await editInput.fill('Should Not Save');
    await catering
      .getByRole('button', { name: 'Cancel editing category' })
      .click();

    await expect(
      catering.getByRole('dialog').getByText(originalName),
    ).toBeVisible({ timeout: 10000 });
    await catering.getByRole('button', { name: 'Close modal' }).click();
  });

  test('Menu - Clicking the eye icon deactivates an active category', async () => {
    await catering
      .getByRole('button', { name: 'Manage menu categories' })
      .click();
    await expect(
      catering.getByRole('dialog', { name: 'Manage Categories' }),
    ).toBeVisible({ timeout: 10000 });

    await catering
      .getByRole('button', { name: 'Deactivate category' })
      .first()
      .click();
    await expect(
      catering.getByText(/Category deactivated successfully/i),
    ).toBeVisible({ timeout: 10000 });

    // Re-activate to restore state
    await catering
      .getByRole('button', { name: 'Activate category' })
      .first()
      .click();
    await catering.getByRole('button', { name: 'Close modal' }).click();
  });

  test('Menu - Clicking the delete icon removes the category', async () => {
    // Add a throwaway category first
    await catering
      .getByRole('button', { name: 'Manage menu categories' })
      .click();
    await expect(
      catering.getByRole('dialog', { name: 'Manage Categories' }),
    ).toBeVisible({ timeout: 10000 });

    await catering
      .getByRole('textbox', { name: /Enter category name/i })
      .fill('Delete Me Category');
    await catering.getByRole('button', { name: 'Add new category' }).click();
    await expect(
      catering.getByRole('dialog').getByText('Delete Me Category'),
    ).toBeVisible({ timeout: 10000 });

    // Delete it
    await catering
      .getByRole('button', { name: 'Delete category' })
      .last()
      .click();
    await expect(
      catering.getByRole('dialog').getByText('Delete Me Category'),
    ).not.toBeVisible({ timeout: 10000 });

    await catering.getByRole('button', { name: 'Close modal' }).click();
  });
});
