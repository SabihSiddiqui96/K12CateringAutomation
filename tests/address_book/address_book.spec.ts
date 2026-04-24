import { test, expect, Page } from '@playwright/test';
import {
  loginToK12Catering,
  navigateK12CateringMenu,
} from '../../utils/helpers';

test.use({ storageState: { cookies: [], origins: [] } });

test.describe('Address Book', () => {
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

  test('Address Book - Page heading, subtitle, count and Add button are visible', async () => {
    await expect(catering.locator('h1')).toContainText('Address Book', { timeout: 10000 });
    await expect(catering.getByText(/Manage your saved locations and contact information/i)).toBeVisible();
    await expect(catering.getByRole('heading', { name: /^\d+$/ }).first()).toBeVisible();
    await expect(catering.getByRole('button', { name: /Add a new location to your address book/i })).toBeVisible();
    await expect(catering.getByRole('heading', { name: /Locations List/i })).toBeVisible();
  });

  test('Address Book - Locations list or empty state is shown', async () => {
    const hasEmptyState = await catering.getByText(/No addresses saved yet/i).first().isVisible({ timeout: 5000 }).catch(() => false);
    const hasLocations = await catering.getByRole('row').or(catering.getByRole('listitem')).first().isVisible({ timeout: 5000 }).catch(() => false);
    expect(hasEmptyState || hasLocations).toBe(true);

    const countHeading = catering.getByRole('heading', { name: /^\d+$/ }).first();
    const text = await countHeading.textContent();
    expect(Number(text?.trim())).toBeGreaterThanOrEqual(0);
  });

  test('Address Book - Add New Location form opens, validates required fields', async () => {
    await catering.getByRole('button', { name: /Add a new location to your address book/i }).click();
    await catering.waitForTimeout(500);

    const hasFields = await catering.getByRole('textbox').first().isVisible({ timeout: 5000 }).catch(() => false);
    expect(hasFields).toBe(true);

    await expect(catering.getByRole('button', { name: /Save|Add|Create|Submit/i }).last()).toBeVisible({ timeout: 10000 });
    await catering.getByRole('button', { name: /Save|Add|Create|Submit/i }).last().click();
    await expect(catering.getByText(/required|must not be empty|please enter/i).first()).toBeVisible({ timeout: 5000 });

    const cancelBtn = catering.getByRole('button', { name: /Cancel/i });
    if (await cancelBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
      await cancelBtn.click();
    } else {
      await catering.keyboard.press('Escape');
    }
  });
});
