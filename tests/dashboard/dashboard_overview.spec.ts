import { test, expect, Page } from '@playwright/test';
import {
  loginToK12Catering,
  navigateK12CateringMenu,
} from '../../utils/helpers';

test.use({ storageState: { cookies: [], origins: [] } });

test.describe('Dashboard - Overview (Stats, Quick Actions, Filters)', () => {
  let catering: Page;

  test.beforeAll(async ({ browser }) => {
    const context = await browser.newContext();
    const page = await context.newPage();
    catering = await loginToK12Catering(page, { navigateTo: 'Dashboard' });
  });

  test.beforeEach(async () => {
    await navigateK12CateringMenu(catering, 'Dashboard');
    await catering.waitForLoadState('domcontentloaded');

    const advancedButton = catering.getByRole('button', { name: 'Advanced view' });
    if ((await advancedButton.getAttribute('aria-pressed')) !== 'true') {
      await advancedButton.click();
      await expect(advancedButton).toHaveAttribute('aria-pressed', 'true');
    }
  });

  const statsRegion = () => catering.getByRole('region', { name: 'Dashboard statistics' });
  const qaSection = () => catering.locator('section[aria-label="Quick actions and account statistics"]');

  test('Dashboard - Filter controls render with default values and shortcut buttons work', async () => {
    await expect(catering.getByRole('button', { name: 'Select time period filter' })).toBeVisible({ timeout: 15000 });
    await expect(catering.getByRole('button', { name: 'Select status filter' })).toContainText('All Status');
    await expect(catering.getByRole('button', { name: 'Select statistics by date type' })).toContainText('Delivery Date');

    await catering.getByRole('button', { name: 'Scroll to calendar view' }).click();
    await expect(catering.getByRole('region', { name: 'Calendar view and date-wise orders' })).toBeVisible({ timeout: 10000 });
    await catering.getByRole('button', { name: 'Scroll to trending chart' }).click();
    await expect(catering.getByRole('region', { name: 'Trending data visualization' }).first()).toBeVisible({ timeout: 10000 });
  });

  test('Dashboard - Time Period and Status dropdowns show all options and update filter label', async () => {
    const timePeriodButton = catering.getByRole('button', { name: 'Select time period filter' });
    await timePeriodButton.click();
    await expect(catering.getByRole('option', { name: 'Today' })).toBeVisible();
    await expect(catering.getByRole('option', { name: 'This Week' })).toBeVisible();
    await expect(catering.getByRole('option', { name: 'All Time' })).toBeVisible();
    await catering.getByRole('option', { name: 'All Time' }).click();
    await expect(timePeriodButton).toContainText('All Time');

    const statusButton = catering.getByRole('button', { name: 'Select status filter' });
    await statusButton.click();
    await expect(catering.getByRole('option', { name: 'Pending' })).toBeVisible();
    await expect(catering.getByRole('option', { name: 'Delivered' })).toBeVisible();
    await catering.getByRole('option', { name: 'All Status' }).click();
  });

  test('Dashboard - Statistics cards and subtitles are visible in Advanced view', async () => {
    const timePeriodButton = catering.getByRole('button', { name: 'Select time period filter' });
    await timePeriodButton.click();
    await catering.getByRole('option', { name: 'All Time' }).click();
    const statusButton = catering.getByRole('button', { name: 'Select status filter' });
    await statusButton.click();
    await catering.getByRole('option', { name: 'All Status' }).click();

    await expect(statsRegion()).toBeVisible({ timeout: 15000 });
    await expect(statsRegion().getByRole('region', { name: /^Total Orders/i })).toBeVisible();
    await expect(statsRegion().getByRole('region', { name: /^Total Revenue/i })).toBeVisible();
    await expect(statsRegion().getByRole('region', { name: /^Pending Orders/i })).toContainText('All clear');
    await expect(statsRegion().getByRole('region', { name: /^Accepted Orders/i })).toContainText(/acceptance rate/i);
    await expect(statsRegion().getByRole('region', { name: /^Active Accounts/i })).toBeVisible();
  });

  test('Dashboard - Basic/Advanced view toggle switches layout and stats persist', async () => {
    const basicButton = catering.getByRole('button', { name: 'Basic view' });
    await basicButton.click();
    await expect(basicButton).toHaveAttribute('aria-pressed', 'true');
    await expect(catering.getByRole('heading', { name: 'Dashboard' })).toBeVisible();

    const advancedButton = catering.getByRole('button', { name: 'Advanced view' });
    await advancedButton.click();
    await expect(advancedButton).toHaveAttribute('aria-pressed', 'true');
    await expect(statsRegion().getByRole('region', { name: /^Total Orders/i })).toBeVisible({ timeout: 10000 });
  });

  test('Dashboard - Quick Actions section renders all buttons and navigates correctly', async () => {
    await expect(qaSection()).toBeVisible({ timeout: 15000 });
    await expect(qaSection().getByRole('heading', { name: 'Quick Actions' })).toBeVisible();
    await expect(qaSection().getByRole('heading', { name: 'Account Statistics' })).toBeVisible();

    const actions: Array<{ buttonName: string; urlPattern: RegExp }> = [
      { buttonName: 'View all orders', urlPattern: /\/orders/ },
      { buttonName: 'View menu items', urlPattern: /\/menu/ },
      { buttonName: 'Manage user accounts', urlPattern: /\/accounts/ },
    ];
    for (const action of actions) {
      await qaSection().getByRole('button', { name: action.buttonName }).click();
      await expect(catering).toHaveURL(action.urlPattern, { timeout: 15000 });
      await navigateK12CateringMenu(catering, 'Dashboard');
      await catering.waitForLoadState('domcontentloaded');
      await expect(qaSection()).toBeVisible({ timeout: 15000 });
    }
  });
});
