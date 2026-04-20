// Dashboard - Filters regression tests
// Tests the Time Period, Status, Statistics By dropdowns
// and the Calendar, Trending, Search shortcut buttons

import { test, expect, Page } from '@playwright/test';
import {
  loginToK12Catering,
  navigateK12CateringMenu,
} from '../../utils/helpers';

test.setTimeout(180000);

test.use({ storageState: { cookies: [], origins: [] } });

test.describe('Dashboard - Filters', () => {
  let catering: Page;

  test.beforeAll(async ({ browser }) => {
    const context = await browser.newContext();
    const page = await context.newPage();
    catering = await loginToK12Catering(page, { navigateTo: 'Dashboard' });
  });

  test.beforeEach(async () => {
    await navigateK12CateringMenu(catering, 'Dashboard');
    await catering.waitForLoadState('domcontentloaded');
  });

  test('Time Period dropdown is visible with a selected value', async () => {
    const timePeriodButton = catering.getByRole('button', {
      name: 'Select time period filter',
    });
    await expect(timePeriodButton).toBeVisible({ timeout: 15000 });
  });

  test('Time Period dropdown shows all options when opened', async () => {
    const timePeriodButton = catering.getByRole('button', {
      name: 'Select time period filter',
    });
    await expect(timePeriodButton).toBeVisible({ timeout: 15000 });
    await timePeriodButton.click();

    await expect(catering.getByRole('option', { name: 'Today' })).toBeVisible();
    await expect(
      catering.getByRole('option', { name: 'Yesterday' }),
    ).toBeVisible();
    await expect(
      catering.getByRole('option', { name: 'This Week' }),
    ).toBeVisible();
    await expect(
      catering.getByRole('option', { name: 'Last Week' }),
    ).toBeVisible();
    await expect(
      catering.getByRole('option', { name: 'This Month' }),
    ).toBeVisible();
    await expect(
      catering.getByRole('option', { name: 'Last Month' }),
    ).toBeVisible();
    await expect(
      catering.getByRole('option', { name: 'This Quarter' }),
    ).toBeVisible();
    await expect(
      catering.getByRole('option', { name: 'This Year' }),
    ).toBeVisible();
    await expect(
      catering.getByRole('option', { name: 'Last Year' }),
    ).toBeVisible();
    await expect(
      catering.getByRole('option', { name: 'All Time' }),
    ).toBeVisible();

    await catering.keyboard.press('Escape');
  });

  test('Time Period dropdown - selecting "Today" updates the button label', async () => {
    const timePeriodButton = catering.getByRole('button', {
      name: 'Select time period filter',
    });
    await expect(timePeriodButton).toBeVisible({ timeout: 15000 });
    await timePeriodButton.click();
    await catering.getByRole('option', { name: 'Today' }).click();
    await expect(timePeriodButton).toContainText('Today');
  });

  test('Time Period dropdown - selecting "All Time" updates the button label', async () => {
    const timePeriodButton = catering.getByRole('button', {
      name: 'Select time period filter',
    });
    await expect(timePeriodButton).toBeVisible({ timeout: 15000 });
    await timePeriodButton.click();
    await catering.getByRole('option', { name: 'All Time' }).click();
    await expect(timePeriodButton).toContainText('All Time');
  });

  test('Status dropdown renders with default "All Status"', async () => {
    const statusButton = catering.getByRole('button', {
      name: 'Select status filter',
    });
    await expect(statusButton).toBeVisible({ timeout: 15000 });
    await expect(statusButton).toContainText('All Status');
  });

  test('Status dropdown shows all options when opened', async () => {
    const statusButton = catering.getByRole('button', {
      name: 'Select status filter',
    });
    await expect(statusButton).toBeVisible({ timeout: 15000 });
    await statusButton.click();

    await expect(
      catering.getByRole('option', { name: 'All Status' }),
    ).toBeVisible();
    await expect(
      catering.getByRole('option', { name: 'Pending' }),
    ).toBeVisible();
    await expect(
      catering.getByRole('option', { name: 'Accepted' }),
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

  test('Status dropdown - selecting "Accepted" updates the button label', async () => {
    const statusButton = catering.getByRole('button', {
      name: 'Select status filter',
    });
    await expect(statusButton).toBeVisible({ timeout: 15000 });
    await statusButton.click();
    await catering.getByRole('option', { name: 'Accepted' }).click();
    await expect(statusButton).toContainText('Accepted');
  });

  test('Statistics By dropdown renders with default "Delivery Date"', async () => {
    const statsByButton = catering.getByRole('button', {
      name: 'Select statistics by date type',
    });
    await expect(statsByButton).toBeVisible({ timeout: 15000 });
    await expect(statsByButton).toContainText('Delivery Date');
  });

  test('Statistics By dropdown - selecting "Created Date" updates the button label', async () => {
    const statsByButton = catering.getByRole('button', {
      name: 'Select statistics by date type',
    });
    await expect(statsByButton).toBeVisible({ timeout: 15000 });
    await statsByButton.click();
    await catering.getByRole('option', { name: 'Created Date' }).click();
    await expect(statsByButton).toContainText('Created Date');
  });

  test('Calendar shortcut button scrolls to Orders Calendar section', async () => {
    await catering
      .getByRole('button', { name: 'Scroll to calendar view' })
      .click();
    const calendarSection = catering.getByRole('region', {
      name: 'Calendar view and date-wise orders',
    });
    await expect(calendarSection).toBeVisible({ timeout: 10000 });
  });

  test("Trending shortcut button scrolls to What's Trending section", async () => {
    await catering
      .getByRole('button', { name: 'Scroll to trending chart' })
      .click();
    const trendingSection = catering
      .getByRole('region', { name: 'Trending data visualization' })
      .first();
    await expect(trendingSection).toBeVisible({ timeout: 10000 });
  });

  test('Search shortcut button scrolls to Search Orders section', async () => {
    await catering
      .getByRole('button', { name: 'Scroll to search orders' })
      .click();
    const searchInput = catering.getByPlaceholder(
      'Search by order ID, customer name, or order number...',
    );
    await expect(searchInput).toBeVisible({ timeout: 10000 });
  });

  test('Basic view toggle switches dashboard layout', async () => {
    const basicButton = catering.getByRole('button', { name: 'Basic view' });
    const advancedButton = catering.getByRole('button', {
      name: 'Advanced view',
    });

    await expect(basicButton).toBeVisible({ timeout: 15000 });
    await basicButton.click();
    await expect(
      catering.getByRole('heading', { name: 'Dashboard' }),
    ).toBeVisible();

    await advancedButton.click();
    await expect(
      catering.getByRole('heading', { name: 'Dashboard' }),
    ).toBeVisible();
  });
});
