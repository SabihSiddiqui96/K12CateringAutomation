// Dashboard - Statistics / KPI Cards regression tests
// Tests all 10 stat cards and the Basic/Advanced view toggle

import { test, expect, Page } from '@playwright/test';
import {
  loginToK12Catering,
  navigateK12CateringMenu,
} from '../../utils/helpers';

test.setTimeout(180000);

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

  test('Dashboard statistics region is visible on page load', async () => {
    await expect(statsRegion()).toBeVisible({ timeout: 15000 });
  });

  test('Total Orders card is visible with label', async () => {
    await expect(
      statsRegion().getByRole('region', { name: /^Total Orders/i }),
    ).toBeVisible({ timeout: 15000 });
  });

  test('Pending Orders card is visible with label', async () => {
    await expect(
      statsRegion().getByRole('region', { name: /^Pending Orders/i }),
    ).toBeVisible({ timeout: 15000 });
  });

  test('Pending Orders card shows "All clear" subtitle when count is zero', async () => {
    await expect(statsRegion()).toBeVisible({ timeout: 15000 });
    const pendingCard = statsRegion().getByRole('region', {
      name: /^Pending Orders/i,
    });
    await expect(pendingCard).toBeVisible();
    await expect(pendingCard).toContainText('All clear');
  });

  test('Accepted Orders card is visible with acceptance rate subtitle', async () => {
    const card = statsRegion().getByRole('region', {
      name: /^Accepted Orders/i,
    });
    await expect(card).toBeVisible({ timeout: 15000 });
    await expect(card).toContainText(/acceptance rate/i);
  });

  test('Completed Orders card is visible with completion rate subtitle', async () => {
    const card = statsRegion().getByRole('region', {
      name: /^Completed Orders/i,
    });
    await expect(card).toBeVisible({ timeout: 15000 });
    await expect(card).toContainText(/completion rate/i);
  });

  test('Cancelled Orders card is visible with label', async () => {
    await expect(
      statsRegion().getByRole('region', { name: /^Cancelled Orders/i }),
    ).toBeVisible({ timeout: 15000 });
  });

  test('Rejected Orders card is visible with rejection rate subtitle', async () => {
    const card = statsRegion().getByRole('region', {
      name: /^Rejected Orders/i,
    });
    await expect(card).toBeVisible({ timeout: 15000 });
    await expect(card).toContainText(/rejection rate/i);
  });

  test('Upcoming Orders card is visible with percentage subtitle', async () => {
    const card = statsRegion().getByRole('region', {
      name: /^Upcoming Orders/i,
    });
    await expect(card).toBeVisible({ timeout: 15000 });
    await expect(card).toContainText(/of total orders/i);
  });

  test('Total Revenue card is visible with Avg subtitle', async () => {
    const card = statsRegion().getByRole('region', {
      name: /^Total Revenue/i,
    });
    await expect(card).toBeVisible({ timeout: 15000 });
    await expect(card).toContainText(/Avg:/i);
  });

  test('Pending Accounts card is visible with "Awaiting approval" subtitle', async () => {
    const card = statsRegion().getByRole('region', {
      name: /^Pending Accounts/i,
    });
    await expect(card).toBeVisible({ timeout: 15000 });
    await expect(card).toContainText(/Awaiting approval/i);
  });

  test('Active Accounts card is visible with total accounts subtitle', async () => {
    const card = statsRegion().getByRole('region', {
      name: /^Active Accounts/i,
    });
    await expect(card).toBeVisible({ timeout: 15000 });
    await expect(card).toContainText(/total accounts/i);
  });

  test('Stat cards update when Time Period changes to "Today"', async () => {
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
  });

  test('Stat cards update when Status filter changes to "Accepted"', async () => {
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

  test('Basic view toggle - clicking Basic switches the layout', async () => {
    const basicButton = catering.getByRole('button', { name: 'Basic view' });
    await expect(basicButton).toBeVisible({ timeout: 15000 });
    await basicButton.click();
    await expect(basicButton).toHaveAttribute('aria-pressed', 'true');
    await expect(
      catering.getByRole('heading', { name: 'Dashboard' }),
    ).toBeVisible();
  });

  test('Advanced view toggle - clicking Advanced restores the layout', async () => {
    // Switch to Basic first
    const basicButton = catering.getByRole('button', { name: 'Basic view' });
    await basicButton.click();
    await expect(basicButton).toHaveAttribute('aria-pressed', 'true');

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
