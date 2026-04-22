import { test, expect, Page } from '@playwright/test';
import {
  loginToK12Catering,
  navigateK12CateringMenu,
} from '../../utils/helpers';

test.setTimeout(180000);
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
});

test('Orders - Search bar and Search button are visible', async () => {
  await expect(
    catering.getByRole('textbox', { name: 'Search orders by ID or status' }),
  ).toBeVisible({ timeout: 10000 });
  await expect(
    catering.getByRole('button', { name: 'Search orders' }),
  ).toBeVisible();
});

test('Orders - Status filter dropdown shows all options', async () => {
  await catering
    .getByRole('button', { name: 'Filter orders by status' })
    .click();
  await expect(
    catering.getByRole('option', { name: 'All Status' }),
  ).toBeVisible({ timeout: 5000 });
  await expect(catering.getByRole('option', { name: 'Pending' })).toBeVisible();
  await expect(
    catering.getByRole('option', { name: 'Accepted' }),
  ).toBeVisible();
  await expect(
    catering.getByRole('option', { name: 'Upcoming' }),
  ).toBeVisible();
  await expect(
    catering.getByRole('option', { name: 'Delivered' }),
  ).toBeVisible();
  await expect(
    catering.getByRole('option', { name: 'Cancelled' }),
  ).toBeVisible();
  await expect(
    catering.getByRole('option', { name: 'Rejected' }),
  ).toBeVisible();
  await catering.keyboard.press('Escape');
});

test('Orders - Sort dropdown shows all sort options', async () => {
  await catering.getByRole('button', { name: 'Sort orders' }).click();
  await expect(
    catering.getByRole('option', { name: 'Newest First' }).first(),
  ).toBeVisible({ timeout: 5000 });
  await expect(
    catering.getByRole('option', { name: 'Oldest First' }).first(),
  ).toBeVisible();
  await expect(
    catering.getByRole('option', { name: 'Amount: High to Low' }).first(),
  ).toBeVisible();
  await expect(
    catering.getByRole('option', { name: 'Amount: Low to High' }).first(),
  ).toBeVisible();
  await expect(
    catering.getByRole('option', { name: 'Status' }).first(),
  ).toBeVisible();
  await catering.keyboard.press('Escape');
});

test('Orders - Date Range filter expands and shows fields', async () => {
  await catering
    .getByRole('button', { name: 'Toggle date range filter' })
    .click();
  await expect(catering.getByText('Filter By')).toBeVisible({ timeout: 5000 });
  await expect(catering.getByText('Start Date')).toBeVisible();
  await expect(catering.getByText('End Date')).toBeVisible();
  await expect(
    catering.getByRole('button', { name: 'Apply date range filter' }),
  ).toBeVisible();
});

test('Orders - Filtering by Accepted status shows only accepted orders', async () => {
  await catering
    .getByRole('button', { name: 'Filter orders by status' })
    .click();
  await catering.getByRole('option', { name: 'Accepted' }).click();
  await catering.waitForLoadState('domcontentloaded');
  const badges = catering.locator('main').getByText('accepted');
  await expect(badges.first()).toBeVisible({ timeout: 10000 });
});
