// Dashboard - Recent Orders & Upcoming Orders regression tests

import { test, expect, Page } from '@playwright/test';
import {
  loginToK12Catering,
  navigateK12CateringMenu,
} from '../../utils/helpers';

test.setTimeout(180000);

test.use({ storageState: { cookies: [], origins: [] } });

test.describe('Dashboard - Recent & Upcoming Orders', () => {
  let catering: Page;

  test.beforeAll(async ({ browser }) => {
    const context = await browser.newContext();
    const page = await context.newPage();
    catering = await loginToK12Catering(page, { navigateTo: 'Dashboard' });
  });

  test.beforeEach(async () => {
    await navigateK12CateringMenu(catering, 'Dashboard');
    await catering.waitForLoadState('domcontentloaded');

    // Always reset to Advanced view
    const advancedButton = catering.getByRole('button', {
      name: 'Advanced view',
    });
    if ((await advancedButton.getAttribute('aria-pressed')) !== 'true') {
      await advancedButton.click();
      await expect(advancedButton).toHaveAttribute('aria-pressed', 'true');
    }

    // Reset filters
    const timePeriodButton = catering.getByRole('button', {
      name: 'Select time period filter',
    });
    await timePeriodButton.click();
    await catering.getByRole('option', { name: 'All Time' }).click();

    const statusButton = catering.getByRole('button', {
      name: 'Select status filter',
    });
    await statusButton.click();
    await catering.getByRole('option', { name: 'All Status' }).click();

    // Scroll to the orders lists section
    await catering
      .getByRole('button', { name: 'Scroll to search orders' })
      .click();
  });

  const recentOrdersCard = () =>
    catering
      .locator('section[aria-label="Recent and upcoming orders"] > div > div')
      .nth(0);

  const upcomingOrdersCard = () =>
    catering
      .locator('section[aria-label="Recent and upcoming orders"] > div > div')
      .nth(1);

  // ── Recent Orders ───────────────────────────────────────────────────────────

  test('Recent Orders content and pagination are visible', async () => {
    await expect(
      catering.getByRole('heading', { name: 'Recent Orders' }),
    ).toBeVisible({ timeout: 15000 });

    const list = catering.getByRole('list', { name: 'Recent orders list' });
    await expect(list).toBeVisible({ timeout: 15000 });

    const firstItem = catering
      .getByRole('list', { name: 'Recent orders list' })
      .getByRole('listitem')
      .first();

    await expect(firstItem).toBeVisible({ timeout: 15000 });
    await expect(firstItem).toContainText(/#[A-Z0-9]+/);
    await expect(firstItem).toContainText(
      /Accepted|Pending|Completed|Cancelled|Rejected/i,
    );
    await expect(firstItem).toContainText(/\$[\d,]+\.\d{2}/);
    await expect(recentOrdersCard()).toContainText(/\d+-\d+ of \d+/, {
      timeout: 15000,
    });
    await expect(
      recentOrdersCard().getByRole('button', { name: 'Previous page' }),
    ).toBeVisible({ timeout: 15000 });
    await expect(
      recentOrdersCard().getByRole('button', { name: 'Next page' }),
    ).toBeVisible();
    // CORRECT
    await expect(
      recentOrdersCard().getByRole('button', { name: 'Page 1', exact: true }),
    ).toBeVisible();

    const select = recentOrdersCard().locator(
      'select[aria-label="Items per page"]',
    );
    await select.selectOption('10');
    const items = catering
      .getByRole('list', { name: 'Recent orders list' })
      .getByRole('listitem');
    await expect(items).toHaveCount(10, { timeout: 10000 });
  });

  test('Recent Orders - "View All" button navigates to Orders page', async () => {
    await catering
      .getByRole('button', { name: 'View all recent orders' })
      .click();
    await expect(catering).toHaveURL(/\/orders/, { timeout: 15000 });
  });

  test('Recent Orders - clicking an order item navigates to order details', async () => {
    const firstItem = catering
      .getByRole('list', { name: 'Recent orders list' })
      .getByRole('listitem')
      .first()
      .getByRole('button');

    await expect(firstItem).toBeVisible({ timeout: 15000 });
    await firstItem.click();
    await expect(catering).toHaveURL(/\/orders\/details/, { timeout: 15000 });
  });

  // ── Upcoming Orders ─────────────────────────────────────────────────────────

  test('Upcoming Orders content and pagination are visible', async () => {
    await expect(
      catering.getByRole('heading', { name: 'Upcoming Orders' }),
    ).toBeVisible({ timeout: 15000 });

    const list = catering.getByRole('list', { name: 'Upcoming orders list' });
    await expect(list).toBeVisible({ timeout: 15000 });

    const firstItem = catering
      .getByRole('list', { name: 'Upcoming orders list' })
      .getByRole('listitem')
      .first();

    await expect(firstItem).toBeVisible({ timeout: 15000 });
    await expect(firstItem).toContainText(/#[A-Z0-9]+/);
    await expect(firstItem).toContainText(
      /Accepted|Pending|Completed|Cancelled|Rejected/i,
    );
    await expect(firstItem).toContainText(/\$[\d,]+\.\d{2}/);
    await expect(upcomingOrdersCard()).toContainText(/\d+-\d+ of \d+/, {
      timeout: 15000,
    });
    await expect(
      upcomingOrdersCard().getByRole('button', { name: 'Previous page' }),
    ).toBeVisible({ timeout: 15000 });
    await expect(
      upcomingOrdersCard().getByRole('button', { name: 'Next page' }),
    ).toBeVisible();
    await expect(
      upcomingOrdersCard().getByRole('button', { name: 'Page 1', exact: true }),
    ).toBeVisible();
  });

  test('Upcoming Orders - "View All" button navigates to Orders page', async () => {
    await catering
      .getByRole('button', { name: 'View all upcoming orders' })
      .click();
    await expect(catering).toHaveURL(/\/orders\?filter=upcoming\b/, {
      timeout: 15000,
    });
  });

  test('Upcoming Orders - clicking an order item navigates to order details', async () => {
    const firstItem = catering
      .getByRole('list', { name: 'Upcoming orders list' })
      .getByRole('listitem')
      .first()
      .getByRole('button');

    await expect(firstItem).toBeVisible({ timeout: 15000 });
    await firstItem.click();
    await expect(catering).toHaveURL(/\/orders\/details/, { timeout: 15000 });
  });
});
