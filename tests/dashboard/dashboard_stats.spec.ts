// Dashboard - Statistics / KPI Cards regression tests
// Tests all 10 stat cards and the Basic/Advanced view toggle

import { test, expect, Page } from '@playwright/test';
import {
  loginToK12Catering,
  navigateK12CateringMenu,
} from '../../utils/helpers';


test.use({ storageState: { cookies: [], origins: [] } });

test.describe('Dashboard - Statistics Cards', () => {
  let catering: Page;

  test.beforeAll(async ({ browser }) => {
    const context = await browser.newContext();
    const page = await context.newPage();
    catering = await loginToK12Catering(page, { navigateTo: 'Dashboard' });
  });

  test.beforeEach(async () => {
    await navigateK12CateringMenu(catering, 'Dashboard');
    await catering.waitForLoadState('domcontentloaded');

    // Always reset to Advanced view first — view mode persists across navigation
    const advancedButton = catering.getByRole('button', {
      name: 'Advanced view',
    });
    if ((await advancedButton.getAttribute('aria-pressed')) !== 'true') {
      await advancedButton.click();
      await expect(advancedButton).toHaveAttribute('aria-pressed', 'true');
    }

    // Reset filters to All Time / All Status for consistent results
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
  });

  // Helper scoped to the stats region to avoid matching elements elsewhere on the page
  const statsRegion = () =>
    catering.getByRole('region', { name: 'Dashboard statistics' });

  test('Statistics cards and subtitles are visible', async () => {
    await expect(statsRegion()).toBeVisible({ timeout: 15000 });
    const totalOrdersCard = statsRegion().getByRole('region', {
      name: /^Total Orders/i,
    });
    await expect(totalOrdersCard).toBeVisible();

    const pendingOrdersCard = statsRegion().getByRole('region', {
      name: /^Pending Orders/i,
    });
    await expect(pendingOrdersCard).toBeVisible();
    await expect(pendingOrdersCard).toContainText('All clear');

    const acceptedOrdersCard = statsRegion().getByRole('region', {
      name: /^Accepted Orders/i,
    });
    await expect(acceptedOrdersCard).toBeVisible();
    await expect(acceptedOrdersCard).toContainText(/acceptance rate/i);

    const completedOrdersCard = statsRegion().getByRole('region', {
      name: /^Completed Orders/i,
    });
    await expect(completedOrdersCard).toBeVisible();
    await expect(completedOrdersCard).toContainText(/completion rate/i);

    const cancelledOrdersCard = statsRegion().getByRole('region', {
      name: /^Cancelled Orders/i,
    });
    await expect(cancelledOrdersCard).toBeVisible();

    const rejectedOrdersCard = statsRegion().getByRole('region', {
      name: /^Rejected Orders/i,
    });
    await expect(rejectedOrdersCard).toBeVisible();
    await expect(rejectedOrdersCard).toContainText(/rejection rate/i);

    const upcomingOrdersCard = statsRegion().getByRole('region', {
      name: /^Upcoming Orders/i,
    });
    await expect(upcomingOrdersCard).toBeVisible();
    await expect(upcomingOrdersCard).toContainText(/of total orders/i);

    const totalRevenueCard = statsRegion().getByRole('region', {
      name: /^Total Revenue/i,
    });
    await expect(totalRevenueCard).toBeVisible();
    await expect(totalRevenueCard).toContainText(/Avg:/i);

    const pendingAccountsCard = statsRegion().getByRole('region', {
      name: /^Pending Accounts/i,
    });
    await expect(pendingAccountsCard).toBeVisible();
    await expect(pendingAccountsCard).toContainText(/Awaiting approval/i);

    const activeAccountsCard = statsRegion().getByRole('region', {
      name: /^Active Accounts/i,
    });
    await expect(activeAccountsCard).toBeVisible();
    await expect(activeAccountsCard).toContainText(/total accounts/i);
  });

  test('Stat cards update when Time Period and Status filters change', async () => {
    const timePeriodButton = catering.getByRole('button', {
      name: 'Select time period filter',
    });
    await timePeriodButton.click();
    await catering.getByRole('option', { name: 'Today' }).click();
    await expect(timePeriodButton).toContainText('Today');

    await expect(statsRegion()).toBeVisible({ timeout: 10000 });
    await expect(
      statsRegion().getByRole('region', { name: /^Total Orders/i }),
    ).toBeVisible();

    const statusButton = catering.getByRole('button', {
      name: 'Select status filter',
    });
    await statusButton.click();
    await catering.getByRole('option', { name: 'Accepted' }).click();
    await expect(statusButton).toContainText('Accepted');

    await expect(statsRegion()).toBeVisible({ timeout: 10000 });
    await expect(
      statsRegion().getByRole('region', { name: /^Total Orders/i }),
    ).toBeVisible();
  });

  test('View toggle switches to Basic and back to Advanced', async () => {
    const basicButton = catering.getByRole('button', { name: 'Basic view' });
    await expect(basicButton).toBeVisible({ timeout: 15000 });
    await basicButton.click();
    await expect(basicButton).toHaveAttribute('aria-pressed', 'true');
    await expect(
      catering.getByRole('heading', { name: 'Dashboard' }),
    ).toBeVisible();

    // Now switch back to Advanced
    const advancedButton = catering.getByRole('button', {
      name: 'Advanced view',
    });
    await advancedButton.click();
    await expect(advancedButton).toHaveAttribute('aria-pressed', 'true');

    // Verify the full stats region is restored
    await expect(
      statsRegion().getByRole('region', { name: /^Total Orders/i }),
    ).toBeVisible({ timeout: 10000 });
    await expect(
      statsRegion().getByRole('region', { name: /^Total Revenue/i }),
    ).toBeVisible();
  });
});
