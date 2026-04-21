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

  test('Menu - Manage Allergens modal opens from Configuration', async () => {
    await catering.getByRole('button', { name: 'Manage allergens' }).click();
    await expect(
      catering.getByRole('dialog', { name: 'Manage Allergens' }),
    ).toBeVisible({ timeout: 10000 });
    await expect(
      catering.getByRole('button', { name: 'Edit allergen' }).first(),
    ).toBeVisible();
    await catering.getByRole('button', { name: 'Close' }).click();
  });

  test('Menu - Clicking pencil icon on an allergen opens inline edit', async () => {
    await catering.getByRole('button', { name: 'Manage allergens' }).click();
    await expect(
      catering.getByRole('dialog', { name: 'Manage Allergens' }),
    ).toBeVisible({ timeout: 10000 });

    await catering
      .getByRole('button', { name: 'Edit allergen' })
      .first()
      .click();
    await expect(catering.getByRole('textbox').first()).toBeVisible({
      timeout: 10000,
    });

    // Cancel button (X) and save (checkmark) should appear
    const dialog = catering.getByRole('dialog', { name: 'Manage Allergens' });
    await expect(
      dialog.locator('button').filter({ hasText: '' }).first(),
    ).toBeVisible();

    // Press Escape or click X to cancel
    await catering.keyboard.press('Escape');
    await catering.getByRole('button', { name: 'Close' }).click();
  });

  test('Menu - Saving inline edit updates the allergen name', async () => {
    await catering.getByRole('button', { name: 'Manage allergens' }).click();
    await expect(
      catering.getByRole('dialog', { name: 'Manage Allergens' }),
    ).toBeVisible({ timeout: 10000 });

    await catering
      .getByRole('button', { name: 'Edit allergen' })
      .first()
      .click();
    const editInput = catering
      .getByRole('dialog', { name: 'Manage Allergens' })
      .getByRole('textbox')
      .first();
    const originalName = await editInput.inputValue();
    const updatedName = originalName + ' Updated';

    await editInput.clear();
    await editInput.fill(updatedName);

    // Click the green checkmark (save) button
    await catering
      .getByRole('dialog', { name: 'Manage Allergens' })
      .locator('button[type="button"]')
      .filter({ hasText: '' })
      .first()
      .click();
    await expect(
      catering
        .getByRole('dialog', { name: 'Manage Allergens' })
        .getByText(updatedName),
    ).toBeVisible({ timeout: 10000 });

    // Restore original
    await catering
      .getByRole('button', { name: 'Edit allergen' })
      .first()
      .click();
    await catering
      .getByRole('dialog', { name: 'Manage Allergens' })
      .getByRole('textbox')
      .first()
      .clear();
    await catering
      .getByRole('dialog', { name: 'Manage Allergens' })
      .getByRole('textbox')
      .first()
      .fill(originalName);
    await catering
      .getByRole('dialog', { name: 'Manage Allergens' })
      .locator('button[type="button"]')
      .filter({ hasText: '' })
      .first()
      .click();
    await catering.getByRole('button', { name: 'Close' }).click();
  });

  test('Menu - Cancelling inline edit discards allergen name change', async () => {
    await catering.getByRole('button', { name: 'Manage allergens' }).click();
    await expect(
      catering.getByRole('dialog', { name: 'Manage Allergens' }),
    ).toBeVisible({ timeout: 10000 });

    await catering
      .getByRole('button', { name: 'Edit allergen' })
      .first()
      .click();
    const editInput = catering
      .getByRole('dialog', { name: 'Manage Allergens' })
      .getByRole('textbox')
      .first();
    const originalName = await editInput.inputValue();

    await editInput.clear();
    await editInput.fill('Should Not Save');

    // Click the red X (cancel) button
    await catering.keyboard.press('Escape');
    await catering.waitForTimeout(300);
    await expect(
      catering
        .getByRole('dialog', { name: 'Manage Allergens' })
        .getByText(originalName),
    ).toBeVisible({ timeout: 10000 });
    await catering.getByRole('button', { name: 'Close' }).click();
  });
});
