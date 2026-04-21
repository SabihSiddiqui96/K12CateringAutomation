import { test, expect, Page } from '@playwright/test';
import {
  loginToK12Catering,
  navigateK12CateringMenu,
} from '../../utils/helpers';

test.setTimeout(180000);
test.use({ storageState: { cookies: [], origins: [] } });

test.describe('Menu - Configuration: Manage Ingredients', () => {
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

  test('Menu - Manage Ingredients modal opens from Configuration', async () => {
    await catering.getByRole('button', { name: 'Manage ingredients' }).click();
    await expect(
      catering.getByRole('dialog', { name: 'Manage Ingredients' }),
    ).toBeVisible({ timeout: 10000 });
    await expect(
      catering.getByRole('button', { name: 'Edit ingredient' }).first(),
    ).toBeVisible();
    await catering.getByRole('button', { name: 'Close' }).last().click();
  });

  test('Menu - Clicking pencil icon on an ingredient opens inline edit', async () => {
    await catering.getByRole('button', { name: 'Manage ingredients' }).click();
    await expect(
      catering.getByRole('dialog', { name: 'Manage Ingredients' }),
    ).toBeVisible({ timeout: 10000 });

    await catering
      .getByRole('button', { name: 'Edit ingredient' })
      .first()
      .click();
    await expect(
      catering
        .getByRole('dialog', { name: 'Manage Ingredients' })
        .getByRole('textbox')
        .first(),
    ).toBeVisible({ timeout: 10000 });

    await catering.keyboard.press('Escape');
    await catering.getByRole('button', { name: 'Close' }).last().click();
  });

  test('Menu - Saving inline edit updates the ingredient name', async () => {
    await catering.getByRole('button', { name: 'Manage ingredients' }).click();
    await expect(
      catering.getByRole('dialog', { name: 'Manage Ingredients' }),
    ).toBeVisible({ timeout: 10000 });

    await catering
      .getByRole('button', { name: 'Edit ingredient' })
      .first()
      .click();
    const editInput = catering
      .getByRole('dialog', { name: 'Manage Ingredients' })
      .getByRole('textbox')
      .first();
    const originalName = await editInput.inputValue();
    const updatedName = originalName + ' Updated';

    await editInput.clear();
    await editInput.fill(updatedName);
    await editInput.press('Enter');

    await expect(
      catering
        .getByRole('dialog', { name: 'Manage Ingredients' })
        .getByText(updatedName),
    ).toBeVisible({ timeout: 10000 });

    // Restore original
    await catering
      .getByRole('button', { name: 'Edit ingredient' })
      .first()
      .click();
    const restoreInput = catering
      .getByRole('dialog', { name: 'Manage Ingredients' })
      .getByRole('textbox')
      .first();
    await restoreInput.clear();
    await restoreInput.fill(originalName);
    await restoreInput.press('Enter');
    await catering.getByRole('button', { name: 'Close' }).last().click();
  });

  test('Menu - Cancelling inline edit discards ingredient name change', async () => {
    await catering.getByRole('button', { name: 'Manage ingredients' }).click();
    await expect(
      catering.getByRole('dialog', { name: 'Manage Ingredients' }),
    ).toBeVisible({ timeout: 10000 });

    await catering
      .getByRole('button', { name: 'Edit ingredient' })
      .first()
      .click();
    const editInput = catering
      .getByRole('dialog', { name: 'Manage Ingredients' })
      .getByRole('textbox')
      .first();
    const originalName = await editInput.inputValue();

    await editInput.clear();
    await editInput.fill('Should Not Save');
    await catering.keyboard.press('Escape');
    await catering.waitForTimeout(300);

    await expect(
      catering
        .getByRole('dialog', { name: 'Manage Ingredients' })
        .getByText(originalName),
    ).toBeVisible({ timeout: 10000 });
    await catering.getByRole('button', { name: 'Close' }).last().click();
  });
});
