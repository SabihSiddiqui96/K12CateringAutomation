import { test, expect, Page } from '@playwright/test';
import {
  loginToK12Catering,
  navigateK12CateringMenu,
} from '../../utils/helpers';

test.use({ storageState: { cookies: [], origins: [] } });
test.use({ viewport: { width: 1440, height: 900 } });

test.describe('Accounts', () => {
  let catering: Page;

  test.beforeAll(async ({ browser }) => {
    const context = await browser.newContext();
    const page = await context.newPage();
    catering = await loginToK12Catering(page);
  });

  test.beforeEach(async () => {
    await navigateK12CateringMenu(catering, 'Accounts');
    await catering.waitForLoadState('domcontentloaded');

    const closeBtn = catering.getByRole('button', { name: 'Close account details modal' });
    if (await closeBtn.isVisible({ timeout: 1000 }).catch(() => false)) {
      await closeBtn.click();
      await expect(closeBtn).not.toBeVisible({ timeout: 5000 });
    }
  });

  test('Accounts - Page heading, stat cards and list are visible', async () => {
    await expect(catering.locator('h1')).toContainText('Account Management', { timeout: 10000 });
    await expect(catering.getByText('Manage user accounts and permissions')).toBeVisible();
    await expect(catering.getByRole('button', { name: /Total accounts:.*Click to show all accounts/i })).toBeVisible();
    await expect(catering.getByRole('region', { name: /^Pending accounts:/ })).toBeVisible();
    await expect(catering.getByRole('region', { name: /^Active accounts:/ })).toBeVisible();
    await expect(catering.getByRole('region', { name: /^Inactive accounts:/ })).toBeVisible();
    await expect(catering.getByRole('region', { name: /^Rejected accounts:/ })).toBeVisible();
    await expect(catering.getByRole('heading', { name: 'Accounts List' })).toBeVisible();
    await expect(catering.getByRole('region', { name: 'Accounts list' })).toBeVisible();
  });

  test('Accounts - Account cards display details, actions and pagination', async () => {
    const firstCard = catering.getByRole('listitem').filter({ hasText: 'asd sdv' }).first();
    await expect(firstCard.getByText('Role')).toBeVisible({ timeout: 10000 });
    await expect(firstCard.getByText('Email')).toBeVisible();
    await expect(firstCard.getByRole('button', { name: /View details for asd sdv/i })).toBeVisible();
    await expect(firstCard.getByRole('button', { name: /Actions for asd sdv/i })).toBeVisible();

    await expect(catering.getByRole('button', { name: 'Page 1' }).first()).toBeVisible();
    await expect(catering.getByRole('button', { name: 'Next page' }).first()).toBeVisible();
  });

  test('Accounts - Search and filter dropdowns work correctly', async () => {
    const searchBox = catering.getByRole('textbox', { name: 'Search accounts by name, username, or email' });
    await expect(searchBox).toBeVisible({ timeout: 10000 });
    await searchBox.fill('demo');
    await expect(searchBox).toHaveValue('demo');

    await catering.getByRole('button', { name: 'Filter accounts by status' }).click();
    const listbox = catering.getByRole('listbox');
    await expect(listbox.getByRole('option', { name: 'All Status', exact: true })).toBeVisible();
    await expect(listbox.getByRole('option', { name: 'Active', exact: true })).toBeVisible();
    await expect(listbox.getByRole('option', { name: 'Pending', exact: true })).toBeVisible();
    await listbox.getByRole('option', { name: 'Active', exact: true }).click();
    await catering.waitForLoadState('domcontentloaded');
    await expect(catering.locator('[role="status"]').filter({ hasText: 'Pending' })).toHaveCount(0);
  });

  test('Accounts - Actions kebab menu opens and can be dismissed', async () => {
    await catering.getByRole('button', { name: /Actions for asd sdv/i }).click();
    await expect(catering.getByRole('menuitem', { name: 'Deactivate Account' })).toBeVisible({ timeout: 5000 });
    await expect(catering.getByRole('menuitem', { name: 'Change Password' })).toBeVisible();
    await catering.keyboard.press('Escape');
    await expect(catering.getByRole('menuitem', { name: 'Deactivate Account' })).not.toBeVisible();
  });

  test('Accounts - Account Details modal opens with all sections and closes correctly', async () => {
    await catering.getByRole('button', { name: /View details for asd sdv/i }).click();
    await expect(catering.getByRole('heading', { name: 'Account Details' })).toBeVisible({ timeout: 10000 });
    await expect(catering.getByText('Manage user information and permissions')).toBeVisible();
    await expect(catering.getByRole('heading', { name: 'Basic Information' })).toBeVisible();
    await expect(catering.locator('#firstName-input')).toBeVisible();
    await expect(catering.getByRole('heading', { name: 'Account Information' })).toBeVisible();
    await expect(catering.locator('#username-input')).toBeVisible();
    await expect(catering.getByRole('heading', { name: 'Work Information' })).toBeVisible();
    await expect(catering.getByRole('heading', { name: 'Account Status' })).toBeVisible();
    await expect(catering.getByRole('heading', { name: 'User Role' })).toBeVisible();
    await expect(catering.getByRole('button', { name: 'Deactivate Account' })).toBeVisible();
    await expect(catering.getByRole('button', { name: 'Update Details' })).toBeVisible();

    await catering.getByRole('button', { name: 'Close account details modal' }).click();
    await expect(catering.getByRole('heading', { name: 'Account Details' })).not.toBeVisible();
    await expect(catering.getByRole('heading', { name: 'Account Management' })).toBeVisible();
  });
});
