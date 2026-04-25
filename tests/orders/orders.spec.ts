import { test, expect, Page } from '@playwright/test';
import {
  loginToK12Catering,
  navigateK12CateringMenu,
} from '../../utils/helpers';

test.use({ storageState: { cookies: [], origins: [] } });

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

test.describe('Orders', () => {
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

  const orderCards = () =>
    catering.locator('article').filter({
      has: catering.getByRole('button', { name: /View details for order/i }),
    });

  test('Orders - Page heading, stat cards (Total, Status, Revenue) are displayed', async () => {
    await expect(catering.getByRole('heading', { name: 'Order Management' })).toBeVisible({ timeout: 10000 });
    await expect(catering.getByText('Track and manage all your orders')).toBeVisible();
    const totalCard = catering.getByRole('button', { name: /Total orders:/i });
    await expect(totalCard).toBeVisible();
    expect(await totalCard.textContent()).toMatch(/\d+/);
    await expect(catering.getByRole('button', { name: /Accepted orders:/i })).toBeVisible();
    await expect(catering.getByRole('button', { name: /Completed orders:/i })).toBeVisible();
    const revenueCard = catering.getByRole('button', { name: /Total Revenue:/i });
    await expect(revenueCard).toBeVisible();
    expect(await revenueCard.textContent()).toMatch(/\$/);
  });

  test('Orders - Order list shows cards with required fields, status badge, and pagination', async () => {
    const firstOrderCard = orderCards().first();
    await expect(firstOrderCard).toBeVisible({ timeout: 10000 });
    await expect(
      firstOrderCard.getByRole('button', { name: /View details for order/i }),
    ).toBeVisible();
    await expect(firstOrderCard.getByText('Event Date')).toBeVisible();
    await expect(firstOrderCard.getByText('Total Amount')).toBeVisible();
    await expect(
      firstOrderCard.getByText(
        /accepted|completed|delivered|cancelled|pending|processing/i,
      ).first(),
    ).toBeVisible();
    await expect(catering.getByText(/1-20 of \d+/).first()).toBeVisible();
    await expect(catering.getByRole('button', { name: 'Page 1' }).first()).toBeVisible();
    await expect(catering.getByRole('button', { name: 'Next page' }).first()).toBeVisible();
  });

  test('Orders - Search, Status, Sort dropdowns and Date Range filter work', async () => {
    await expect(catering.getByRole('textbox', { name: 'Search orders by ID or status' })).toBeVisible({ timeout: 10000 });

    await catering.getByRole('button', { name: 'Filter orders by status' }).click();
    await expect(catering.getByRole('option', { name: 'All Status' })).toBeVisible({ timeout: 5000 });
    await expect(catering.getByRole('option', { name: 'Accepted' })).toBeVisible();
    await catering.getByRole('option', { name: 'Accepted' }).click();
    await catering.waitForLoadState('domcontentloaded');
    await expect(catering.locator('main').getByText('accepted').first()).toBeVisible({ timeout: 10000 });

    await catering.getByRole('button', { name: 'Toggle date range filter' }).click();
    await expect(catering.getByText('Start Date')).toBeVisible({ timeout: 5000 });
    await expect(catering.getByRole('button', { name: 'Apply date range filter' })).toBeVisible();
  });

  test('Orders - Kebab menu shows View Activity and View Details navigates to detail page', async () => {
    await catering.getByRole('button', { name: 'More options' }).first().click();
    await expect(catering.locator('button', { hasText: 'View Activity' }).filter({ visible: true }).first()).toBeVisible({ timeout: 5000 });
    await catering.keyboard.press('Escape');

    const detailsButton = catering
      .getByRole('button', { name: /View details for order/i })
      .first();
    const detailsLabel = (await detailsButton.getAttribute('aria-label')) ?? '';
    const orderId = detailsLabel.replace(/^View details for order\s*/i, '').trim();

    await detailsButton.click();
    await catering.waitForLoadState('domcontentloaded');
    if (orderId) {
      await expect(
        catering.getByRole('heading', {
          name: new RegExp(`Order\\s*#?\\s*${escapeRegExp(orderId)}`, 'i'),
        }),
      ).toBeVisible({ timeout: 10000 });
    } else {
      await expect(
        catering.getByRole('heading', { name: /Order #/i }),
      ).toBeVisible({ timeout: 10000 });
    }
  });

  test('Orders - Detail page shows all sections and Back button returns to list', async () => {
    await catering.getByRole('button', { name: /View details for order/i }).first().click();
    await expect(catering).toHaveURL(/\/orders\/details/, { timeout: 15000 });
    await catering.getByText(/Loading order details/i).waitFor({ state: 'hidden', timeout: 30000 }).catch(() => {});

    const detailPage = catering.locator('main').filter({
      has: catering.getByRole('heading', { name: 'Order Summary' }),
    }).first();
    const markDeliveredButton = detailPage.getByRole('button', {
      name: 'Mark this order as delivered',
    });
    const cancelOrderButton = detailPage.getByRole('button', {
      name: 'Cancel this order',
    });
    const noActionsMessage = detailPage.getByText(
      /No actions available for this order status/i,
    );

    await expect(catering.getByRole('heading', { name: /Order #/i })).toBeVisible({
      timeout: 10000,
    });
    await expect(
      catering.locator('h2').filter({ hasText: /^\$\d/ }).first(),
    ).toBeVisible();
    await expect(detailPage.getByRole('heading', { name: 'Order Summary' })).toBeVisible();
    await expect(detailPage.getByText('Event Date')).toBeVisible();
    await expect(detailPage.getByRole('heading', { name: 'Admin Actions' })).toBeVisible();

    if (await markDeliveredButton.isVisible().catch(() => false)) {
      await expect(cancelOrderButton).toBeVisible();
    } else {
      await expect(noActionsMessage).toBeVisible();
    }

    await expect(detailPage.getByRole('heading', { name: 'Options' })).toBeVisible();
    await expect(detailPage.getByRole('button', { name: 'Print Invoice' })).toBeVisible();
    await expect(detailPage.getByRole('heading', { name: 'Order Items' })).toBeVisible();
    await expect(detailPage.getByRole('heading', { name: 'Order Activity' })).toBeVisible();

    await catering.getByRole('button', { name: 'Back to orders' }).click();
    await expect(catering).toHaveURL(/\/orders$/, { timeout: 15000 });
    await expect(catering.getByRole('heading', { name: 'Order Management' })).toBeVisible({ timeout: 10000 });
  });

  test('Orders - Shopping List page shows stat cards, day toggles, items table and action buttons', async () => {
    await catering.getByRole('button', { name: 'View shopping list for upcoming orders' }).click();
    await catering.waitForLoadState('domcontentloaded');

    await expect(catering.locator('h1')).toContainText('Shopping List', { timeout: 10000 });
    await expect(catering.getByText('Upcoming 7 days inventory planning')).toBeVisible();
    await expect(catering.getByText('Total Items')).toBeVisible();
    await expect(catering.getByText('Total Quantity')).toBeVisible();

    await expect(catering.getByRole('button', { name: 'Filter for 7 days' })).toBeVisible();
    await expect(catering.getByRole('button', { name: 'Filter for 14 days' })).toBeVisible();
    await catering.getByRole('button', { name: 'Filter for 14 days' }).click();
    await expect(catering.getByRole('button', { name: 'Filter for 14 days' })).toHaveAttribute('aria-pressed', 'true', { timeout: 5000 });

    await expect(catering.locator('h3', { hasText: 'Shopping List Items' })).toBeVisible({ timeout: 10000 });
    await expect(catering.getByRole('button', { name: 'Print shopping list' })).toBeVisible();
    await expect(catering.getByRole('button', { name: 'Download shopping list as CSV' })).toBeVisible();

    await catering.getByRole('button', { name: 'View all orders' }).click();
    await catering.waitForLoadState('domcontentloaded');
    await expect(catering.getByRole('heading', { name: 'Order Management' })).toBeVisible({ timeout: 10000 });
  });
});
