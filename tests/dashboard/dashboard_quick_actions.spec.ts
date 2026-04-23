// Dashboard - Quick Actions & Account Statistics regression tests
// Tests the Quick Actions button group navigation and
// the Account Statistics sidebar counts and navigation

import { test, expect, Page } from '@playwright/test';
import {
  loginToK12Catering,
  navigateK12CateringMenu,
} from '../../utils/helpers';


test.use({ storageState: { cookies: [], origins: [] } });

test.describe('Dashboard - Quick Actions & Account Statistics', () => {
  let catering: Page;

  test.beforeAll(async ({ browser }) => {
    const context = await browser.newContext();
    const page = await context.newPage();
    catering = await loginToK12Catering(page, { navigateTo: 'Dashboard' });
  });

  test.beforeEach(async () => {
    await navigateK12CateringMenu(catering, 'Dashboard');
    await catering.waitForLoadState('domcontentloaded');

    // Always reset to Advanced view — view mode persists across navigation
    const advancedButton = catering.getByRole('button', {
      name: 'Advanced view',
    });
    if ((await advancedButton.getAttribute('aria-pressed')) !== 'true') {
      await advancedButton.click();
      await expect(advancedButton).toHaveAttribute('aria-pressed', 'true');
    }
  });

  // Helper scoped to the section
  const qaSection = () =>
    catering.locator(
      'section[aria-label="Quick actions and account statistics"]',
    );

  test('Quick Actions and Account Statistics sections render with key content', async () => {
    await expect(qaSection()).toBeVisible({ timeout: 15000 });
    await expect(
      qaSection().getByRole('heading', { name: 'Quick Actions' }),
    ).toBeVisible();
    await expect(
      qaSection().getByRole('heading', { name: 'Account Statistics' }),
    ).toBeVisible({ timeout: 15000 });
    await expect(
      qaSection().getByRole('button', { name: 'View all orders' }),
    ).toBeVisible({ timeout: 15000 });
    await expect(
      qaSection().getByRole('button', { name: 'View menu items' }),
    ).toBeVisible();
    await expect(
      qaSection().getByRole('button', {
        name: 'View shopping list for upcoming orders',
      }),
    ).toBeVisible();
    await expect(
      qaSection().getByRole('button', { name: 'Manage user accounts' }),
    ).toBeVisible();
    await expect(
      qaSection().getByRole('button', { name: 'Open system settings' }),
    ).toBeVisible();
    await expect(
      qaSection().locator('[aria-label*="total accounts"]'),
    ).toBeVisible({ timeout: 15000 });
    await expect(qaSection()).toContainText('Total Accounts:');
    await expect(
      qaSection().locator('[aria-label*="active accounts"]'),
    ).toBeVisible({ timeout: 15000 });
    await expect(qaSection()).toContainText('Active Accounts:');
    await expect(
      qaSection().locator('[aria-label*="pending accounts"]'),
    ).toBeVisible({ timeout: 15000 });
    await expect(qaSection()).toContainText('Pending Accounts:');
  });

  test('Quick Action buttons navigate to the correct pages', async () => {
    const quickActions: Array<{ buttonName: string; urlPattern: RegExp }> = [
      { buttonName: 'View all orders', urlPattern: /\/orders/ },
      { buttonName: 'View menu items', urlPattern: /\/menu/ },
      {
        buttonName: 'View shopping list for upcoming orders',
        urlPattern: /\/shopping-list/,
      },
      { buttonName: 'Manage user accounts', urlPattern: /\/accounts/ },
      { buttonName: 'Open system settings', urlPattern: /\/settings/ },
    ];

    for (const action of quickActions) {
      await qaSection().getByRole('button', { name: action.buttonName }).click();
      await expect(catering).toHaveURL(action.urlPattern, { timeout: 15000 });
      await navigateK12CateringMenu(catering, 'Dashboard');
      await catering.waitForLoadState('domcontentloaded');
      await expect(qaSection()).toBeVisible({ timeout: 15000 });
    }
  });

  test('Clicking account stats navigates to Accounts page', async () => {
    const statSelectors = [
      '[aria-label*="total accounts"]',
      '[aria-label*="active accounts"]',
      '[aria-label*="pending accounts"]',
    ];

    for (const selector of statSelectors) {
      await qaSection().locator(selector).click();
      await expect(catering).toHaveURL(/\/accounts/, { timeout: 15000 });
      await navigateK12CateringMenu(catering, 'Dashboard');
      await catering.waitForLoadState('domcontentloaded');
      await expect(qaSection()).toBeVisible({ timeout: 15000 });
    }
  });
});
