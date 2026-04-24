import { test, expect, Page } from '@playwright/test';
import {
  loginToK12Catering,
  navigateK12CateringMenu,
} from '../../utils/helpers';

test.use({ storageState: { cookies: [], origins: [] } });

test.describe('Address Book - Add New Location Form', () => {
  let catering: Page;

  test.beforeAll(async ({ browser }) => {
    const context = await browser.newContext();
    const page = await context.newPage();
    catering = await loginToK12Catering(page);
  });

  test.beforeEach(async () => {
    await navigateK12CateringMenu(catering, 'Address Book');
    await catering.waitForLoadState('domcontentloaded');
  });

  async function openAddLocationForm() {
    const addBtn = catering.getByRole('button', { name: /Add a new location to your address book/i });
    await expect(addBtn).toBeVisible({ timeout: 10000 });
    await addBtn.click();
    await catering.waitForTimeout(500);
  }

  async function closeForm() {
    const cancelBtn = catering.getByRole('button', { name: /Cancel/i });
    if (await cancelBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
      await cancelBtn.click();
    } else {
      await catering.keyboard.press('Escape');
    }
    await catering.waitForTimeout(300);
  }

  test('Add New Location - Form opens with address fields', async () => {
    await openAddLocationForm();
    const hasFields = await catering.getByRole('textbox').first().isVisible({ timeout: 5000 }).catch(() => false);
    expect(hasFields).toBe(true);
    await closeForm();
  });

  test('Add New Location - Save/Submit button is present', async () => {
    await openAddLocationForm();
    await expect(
      catering.getByRole('button', { name: /Save|Add|Create|Submit/i }).last(),
    ).toBeVisible({ timeout: 10000 });
    await closeForm();
  });

  test('Add New Location - Empty form submission shows validation errors', async () => {
    await openAddLocationForm();
    await catering.getByRole('button', { name: /Save|Add|Create|Submit/i }).last().click();
    await expect(
      catering.getByText(/required|must not be empty|please enter/i).first(),
    ).toBeVisible({ timeout: 5000 });
    await closeForm();
  });
});
