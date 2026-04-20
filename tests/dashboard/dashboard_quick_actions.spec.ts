// Dashboard - Quick Actions & Account Statistics regression tests
// Tests the Quick Actions button group navigation and
// the Account Statistics sidebar counts and navigation

import { test, expect, Page } from '@playwright/test';
import {
  loginToK12Catering,
  navigateK12CateringMenu,
} from '../../utils/helpers';

test.setTimeout(180000);

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

  // ── Visibility ──────────────────────────────────────────────────────────────

  test('Quick Actions section is visible with heading', async () => {
    await expect(qaSection()).toBeVisible({ timeout: 15000 });
    await expect(
      qaSection().getByRole('heading', { name: 'Quick Actions' }),
    ).toBeVisible();
  });

  test('Account Statistics section is visible with heading', async () => {
    await expect(
      qaSection().getByRole('heading', { name: 'Account Statistics' }),
    ).toBeVisible({ timeout: 15000 });
  });

  // ── Quick Action Buttons Visible ────────────────────────────────────────────

  test('All 5 Quick Action buttons are visible', async () => {
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
  });

  // ── Quick Action Navigation ─────────────────────────────────────────────────

  test('"View All Orders" button navigates to Orders page', async () => {
    await qaSection().getByRole('button', { name: 'View all orders' }).click();
    await expect(catering).toHaveURL(/\/orders/, { timeout: 15000 });
  });

  test('"View Menu" button navigates to Menu page', async () => {
    await navigateK12CateringMenu(catering, 'Dashboard');
    await catering.waitForLoadState('domcontentloaded');
    await qaSection().getByRole('button', { name: 'View menu items' }).click();
    await expect(catering).toHaveURL(/\/menu/, { timeout: 15000 });
  });

  test('"Shopping List" button navigates to Shopping List page', async () => {
    await navigateK12CateringMenu(catering, 'Dashboard');
    await catering.waitForLoadState('domcontentloaded');
    await qaSection()
      .getByRole('button', { name: 'View shopping list for upcoming orders' })
      .click();
    await expect(catering).toHaveURL(/\/shopping-list/, { timeout: 15000 });
  });

  test('"Manage Accounts" button navigates to Accounts page', async () => {
    await navigateK12CateringMenu(catering, 'Dashboard');
    await catering.waitForLoadState('domcontentloaded');
    await qaSection()
      .getByRole('button', { name: 'Manage user accounts' })
      .click();
    await expect(catering).toHaveURL(/\/accounts/, { timeout: 15000 });
  });

  test('"Settings" button navigates to Settings page', async () => {
    await navigateK12CateringMenu(catering, 'Dashboard');
    await catering.waitForLoadState('domcontentloaded');
    await qaSection()
      .getByRole('button', { name: 'Open system settings' })
      .click();
    await expect(catering).toHaveURL(/\/settings/, { timeout: 15000 });
  });

  // ── Account Statistics ──────────────────────────────────────────────────────

  test('Account Statistics shows Total Accounts count', async () => {
    await navigateK12CateringMenu(catering, 'Dashboard');
    await catering.waitForLoadState('domcontentloaded');
    // The list item aria-label contains the count e.g. "14 total accounts - Click to view details"
    await expect(
      qaSection().locator('[aria-label*="total accounts"]'),
    ).toBeVisible({ timeout: 15000 });
    await expect(qaSection()).toContainText('Total Accounts:');
  });

  test('Account Statistics shows Active Accounts count', async () => {
    await expect(
      qaSection().locator('[aria-label*="active accounts"]'),
    ).toBeVisible({ timeout: 15000 });
    await expect(qaSection()).toContainText('Active Accounts:');
  });

  test('Account Statistics shows Pending Accounts count', async () => {
    await expect(
      qaSection().locator('[aria-label*="pending accounts"]'),
    ).toBeVisible({ timeout: 15000 });
    await expect(qaSection()).toContainText('Pending Accounts:');
  });

  test('Clicking Total Accounts stat navigates to Accounts page', async () => {
    await qaSection().locator('[aria-label*="total accounts"]').click();
    await expect(catering).toHaveURL(/\/accounts/, { timeout: 15000 });
  });

  test('Clicking Active Accounts stat navigates to Accounts page', async () => {
    await navigateK12CateringMenu(catering, 'Dashboard');
    await catering.waitForLoadState('domcontentloaded');
    await qaSection().locator('[aria-label*="active accounts"]').click();
    await expect(catering).toHaveURL(/\/accounts/, { timeout: 15000 });
  });

  test('Clicking Pending Accounts stat navigates to Accounts page', async () => {
    await navigateK12CateringMenu(catering, 'Dashboard');
    await catering.waitForLoadState('domcontentloaded');
    await qaSection().locator('[aria-label*="pending accounts"]').click();
    await expect(catering).toHaveURL(/\/accounts/, { timeout: 15000 });
  });
});
