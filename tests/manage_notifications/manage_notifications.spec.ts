import { test, expect, Page } from '@playwright/test';
import {
  loginToK12Catering,
  navigateK12CateringMenu,
} from '../../utils/helpers';

test.use({ storageState: { cookies: [], origins: [] } });

test.describe('Manage Notifications', () => {
  let catering: Page;

  test.beforeAll(async ({ browser }) => {
    const context = await browser.newContext();
    const page = await context.newPage();
    catering = await loginToK12Catering(page);
  });

  test.beforeEach(async () => {
    await navigateK12CateringMenu(catering, 'Manage Notifications');
    await catering.waitForLoadState('domcontentloaded');
  });

  test('Manage Notifications - Page heading and controls are visible', async () => {
    await expect(catering.locator('h1')).toContainText('Manage Notifications', { timeout: 10000 });
    await expect(catering.getByRole('heading', { name: /Notification Management/i })).toBeVisible();
    await expect(catering.getByRole('button', { name: /Create new notification/i })).toBeVisible();
    await expect(catering.getByRole('textbox', { name: /Search notifications/i })).toBeVisible();
    await expect(catering.getByRole('checkbox', { name: /Include inactive notifications/i })).toBeVisible();
    await expect(catering.getByText(/Error Code: 404|something went wrong/i)).not.toBeVisible();
  });

  test('Manage Notifications - Search filters list and include inactive checkbox toggles', async () => {
    const searchInput = catering.getByRole('textbox', { name: /Search notifications/i });
    await searchInput.fill('ZZZNoMatchXXX99999');
    await catering.waitForTimeout(600);
    await expect(catering.getByText(/No Notifications/i).first()).toBeVisible({ timeout: 5000 });
    await searchInput.clear();

    const checkbox = catering.getByRole('checkbox', { name: /Include inactive notifications/i });
    const initialState = await checkbox.isChecked();
    await checkbox.click();
    await catering.waitForTimeout(400);
    expect(await checkbox.isChecked()).toBe(!initialState);
    await checkbox.click();
    await catering.waitForTimeout(400);
    expect(await checkbox.isChecked()).toBe(initialState);
  });

  test('Manage Notifications - Create form opens with required fields and validates on empty submit', async () => {
    await catering.getByRole('button', { name: /Create new notification/i }).click();
    await catering.waitForTimeout(500);

    const hasDialog = await catering.getByRole('dialog').first().isVisible({ timeout: 5000 }).catch(() => false);
    const hasInput = await catering.getByRole('textbox', { name: /Title|Message|Notification/i }).first().isVisible({ timeout: 5000 }).catch(() => false);
    expect(hasDialog || hasInput).toBe(true);

    await expect(catering.getByRole('button', { name: /Save|Submit|Create|Publish/i }).last()).toBeVisible({ timeout: 10000 });
    await catering.getByRole('button', { name: /Save|Submit|Create|Publish/i }).last().click();
    await expect(catering.getByText(/required|must not be empty|please enter/i).first()).toBeVisible({ timeout: 5000 });

    const cancelBtn = catering.getByRole('button', { name: /Cancel/i });
    if (await cancelBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
      await cancelBtn.click();
    } else {
      await catering.keyboard.press('Escape');
    }
  });
});
