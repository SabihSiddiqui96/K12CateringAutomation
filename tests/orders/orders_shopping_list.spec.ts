import { test, expect, Page } from '@playwright/test';
import {
  loginToK12Catering,
  navigateK12CateringMenu,
} from '../../utils/helpers';

test.use({ storageState: { cookies: [], origins: [] } });

let catering: Page;

test.beforeAll(async ({ browser }) => {
  const context = await browser.newContext();
  const page = await context.newPage();
  catering = await loginToK12Catering(page);
});

test.beforeEach(async () => {
  await navigateK12CateringMenu(catering, 'Orders');
  await catering.waitForLoadState('domcontentloaded');
  await catering
    .getByRole('button', { name: 'View shopping list for upcoming orders' })
    .click();
  await catering.waitForLoadState('domcontentloaded');
});

test('Orders - Shopping List page title and subtitle are displayed', async () => {
  // Use locator('h1') — getByRole('heading', { name: 'Shopping List' }) matches 3 elements
  await expect(catering.locator('h1')).toBeVisible({ timeout: 10000 });
  await expect(catering.locator('h1')).toContainText('Shopping List');
  await expect(
    catering.getByText('Upcoming 7 days inventory planning'),
  ).toBeVisible();
});

test('Orders - Shopping List summary stat cards are displayed', async () => {
  await expect(catering.getByText('Total Items')).toBeVisible({
    timeout: 10000,
  });
  await expect(catering.getByText('Total Quantity')).toBeVisible();
  await expect(catering.getByText('Time Period')).toBeVisible();
  await expect(catering.getByText('Top Item')).toBeVisible();
});

test('Orders - Shopping List day toggles switch time period', async () => {
  await expect(
    catering.getByRole('button', { name: 'Filter for 7 days' }),
  ).toBeVisible({ timeout: 10000 });
  await expect(
    catering.getByRole('button', { name: 'Filter for 14 days' }),
  ).toBeVisible();
  await expect(
    catering.getByRole('button', { name: 'Filter for 30 days' }),
  ).toBeVisible();
  await catering.getByRole('button', { name: 'Filter for 14 days' }).click();
  await catering.waitForLoadState('domcontentloaded');
  // After clicking, verify the button is now active (aria-pressed="true")
  await expect(
    catering.getByRole('button', { name: 'Filter for 14 days' }),
  ).toHaveAttribute('aria-pressed', 'true', { timeout: 5000 });
});

test('Orders - Shopping List items table is displayed', async () => {
  await expect(
    catering.locator('h3', { hasText: 'Shopping List Items' }),
  ).toBeVisible({ timeout: 10000 });
  // 'apple juice' appears twice (Top Item card + item row) — use .first()
  await expect(catering.getByText('apple juice').first()).toBeVisible();
  await expect(catering.getByText('Quantity').first()).toBeVisible();
});

test('Orders - Shopping List download and print buttons are visible', async () => {
  // Exact aria-labels from DOM
  await expect(
    catering.getByRole('button', { name: 'Print shopping list' }),
  ).toBeVisible({ timeout: 10000 });
  await expect(
    catering.getByRole('button', { name: 'Download shopping list as CSV' }),
  ).toBeVisible();
  await expect(
    catering.getByRole('button', { name: 'Download shopping list as PDF' }),
  ).toBeVisible();
});

test('Orders - View Orders button on Shopping List navigates back to orders', async () => {
  // aria-label is "View all orders" (not "View Orders")
  await catering.getByRole('button', { name: 'View all orders' }).click();
  await catering.waitForLoadState('domcontentloaded');
  await expect(
    catering.getByRole('heading', { name: 'Order Management' }),
  ).toBeVisible({ timeout: 10000 });
});
