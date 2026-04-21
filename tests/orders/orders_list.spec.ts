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

test('Orders - Order list shows order cards with required fields', async () => {
  const firstCard = catering
    .locator('main')
    .locator('article, [class*="card"], li')
    .first();
  await expect(catering.getByText('260B857A02')).toBeVisible({
    timeout: 10000,
  });
  await expect(catering.getByText('Event Date').first()).toBeVisible();
  await expect(catering.getByText('Event Time').first()).toBeVisible();
  await expect(catering.getByText('Setup Time').first()).toBeVisible();
  await expect(catering.getByText('Total Amount').first()).toBeVisible();
  await expect(catering.getByText('Created').first()).toBeVisible();
  await expect(catering.getByText('Contact Name').first()).toBeVisible();
  await expect(catering.getByText('Phone').first()).toBeVisible();
  await expect(catering.getByText('Payment Type').first()).toBeVisible();
});

test('Orders - Order cards display status badge', async () => {
  await expect(catering.getByText('accepted').first()).toBeVisible({
    timeout: 10000,
  });
});

test('Orders - Pagination controls are visible and functional', async () => {
  // All pagination elements exist in both top + bottom bars — use .first() throughout
  await expect(catering.getByText(/1-20 of \d+/).first()).toBeVisible({
    timeout: 10000,
  });
  await expect(
    catering.getByRole('button', { name: 'Page 1' }).first(),
  ).toBeVisible();
  await expect(
    catering.getByRole('button', { name: 'Page 2' }).first(),
  ).toBeVisible();
  await expect(
    catering.getByRole('button', { name: 'Next page' }).first(),
  ).toBeVisible();
  await expect(
    catering.getByRole('button', { name: 'Last page' }).first(),
  ).toBeVisible();
});

test('Orders - View Details button navigates to order detail page', async () => {
  await catering
    .getByRole('button', { name: 'View details for order 260B857A02' })
    .click();
  await catering.waitForLoadState('domcontentloaded');
  await expect(
    catering.getByRole('heading', { name: /Order #260B857A02/i }),
  ).toBeVisible({ timeout: 10000 });
});

test('Orders - Kebab menu shows View Activity option', async () => {
  await catering.getByRole('button', { name: 'More options' }).first().click();
  // "View Activity" is a plain <button> — no role="menuitem"
  // Many are in the DOM (one per card), so filter to the visible one only
  await expect(
    catering
      .locator('button', { hasText: 'View Activity' })
      .filter({ visible: true })
      .first(),
  ).toBeVisible({ timeout: 5000 });
  await catering.keyboard.press('Escape');
});
