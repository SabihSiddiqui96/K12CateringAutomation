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

test('Orders - Page title and subtitle are displayed', async () => {
  await expect(
    catering.getByRole('heading', { name: 'Order Management' }),
  ).toBeVisible({ timeout: 10000 });
  await expect(
    catering.getByText('Track and manage all your orders'),
  ).toBeVisible();
});

test('Orders - Total Orders stat card is displayed', async () => {
  await expect(
    catering.getByRole('button', { name: /Total orders:/i }),
  ).toBeVisible({ timeout: 10000 });
  // Verify the card contains a numeric count (not hardcoded — count changes with test data)
  const totalCard = catering.getByRole('button', { name: /Total orders:/i });
  const text = await totalCard.textContent();
  expect(text).toMatch(/\d+/);
});

test('Orders - Status stat cards are displayed with counts', async () => {
  await expect(
    catering.getByRole('button', { name: /Accepted orders:/i }),
  ).toBeVisible({ timeout: 10000 });
  await expect(
    catering.getByRole('button', { name: /Completed orders:/i }),
  ).toBeVisible();
  await expect(
    catering.getByRole('button', { name: /Rejected orders:/i }),
  ).toBeVisible();
  await expect(catering.getByLabel(/Pending orders:/i)).toBeVisible();
  await expect(catering.getByLabel(/Cancelled orders:/i)).toBeVisible();
});

test('Orders - Total Revenue stat card is displayed', async () => {
  await expect(
    catering.getByRole('button', { name: /Total Revenue:/i }),
  ).toBeVisible({ timeout: 10000 });
  const revenueCard = catering.getByRole('button', { name: /Total Revenue:/i });
  const text = await revenueCard.textContent();
  expect(text).toMatch(/\$/);
});
