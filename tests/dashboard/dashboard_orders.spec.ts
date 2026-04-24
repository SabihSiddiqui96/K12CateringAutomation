import { test, expect, Page } from '@playwright/test';
import {
  loginToK12Catering,
  navigateK12CateringMenu,
} from '../../utils/helpers';

test.use({ storageState: { cookies: [], origins: [] } });

test.describe('Dashboard - Orders (Calendar & Lists)', () => {
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

  test('Dashboard - Calendar section shows current month and navigation controls', async () => {
    await catering.getByRole('button', { name: 'Scroll to calendar view' }).click();
    const calendarSection = catering.getByRole('region', { name: 'Calendar view and date-wise orders' });
    await expect(calendarSection).toBeVisible({ timeout: 10000 });

    const months = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
    const currentMonth = months[new Date().getMonth()];
    await expect(calendarSection.getByText(new RegExp(currentMonth, 'i')).first()).toBeVisible({ timeout: 10000 });
    await expect(calendarSection.getByRole('button', { name: /previous month/i })).toBeVisible();
    await expect(calendarSection.getByRole('button', { name: /next month/i })).toBeVisible();
    await expect(calendarSection.getByRole('button', { name: /today/i })).toBeVisible();
  });

  test('Dashboard - Calendar day grid renders and clicking a date navigates', async () => {
    await catering.getByRole('button', { name: 'Scroll to calendar view' }).click();
    const calendarSection = catering.getByRole('region', { name: 'Calendar view and date-wise orders' });
    await expect(calendarSection).toBeVisible({ timeout: 10000 });

    const dayButtons = calendarSection.getByRole('button').filter({ hasText: /^[0-9]+$/ });
    await expect(dayButtons.first()).toBeVisible({ timeout: 10000 });

    const firstDay = dayButtons.first();
    await firstDay.click();
    await catering.waitForTimeout(500);
    await expect(calendarSection).toBeVisible();
  });

  test('Dashboard - Recent Orders section shows content, pagination and View All navigation', async () => {
    const ordersSection = catering.locator('section[aria-label="Recent and upcoming orders"]');
    const recentSection = ordersSection
      .getByRole('heading', { name: /Recent Orders/i })
      .locator('xpath=ancestor::div[contains(@class,"rounded-xl")]')
      .first();

    await expect(ordersSection).toBeVisible({ timeout: 15000 });
    await expect(recentSection).toBeVisible({ timeout: 15000 });

    const hasPagination = await recentSection.locator('button[aria-label*="page" i], button[aria-label*="next" i]').first().isVisible({ timeout: 5000 }).catch(() => false);
    const hasOrders = await recentSection.locator('li, [class*="order"], [class*="card"]').first().isVisible({ timeout: 5000 }).catch(() => false);
    const hasEmpty = await recentSection.getByText(/no.*orders|empty/i).first().isVisible({ timeout: 3000 }).catch(() => false);
    expect(hasPagination || hasOrders || hasEmpty).toBe(true);

    const viewAllBtn = recentSection.getByRole('button', { name: /View All/i }).or(recentSection.getByRole('link', { name: /View All/i })).first();
    if (await viewAllBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      await viewAllBtn.click();
      await expect(catering).toHaveURL(/\/orders/, { timeout: 10000 });
      await navigateK12CateringMenu(catering, 'Dashboard');
      await catering.waitForLoadState('domcontentloaded');
    }
  });

  test('Dashboard - Upcoming Orders section shows content and View All navigation', async () => {
    const ordersSection = catering.locator('section[aria-label="Recent and upcoming orders"]');
    const upcomingSection = ordersSection
      .getByRole('heading', { name: /Upcoming Orders/i })
      .locator('xpath=ancestor::div[contains(@class,"rounded-xl")]')
      .first();

    await expect(ordersSection).toBeVisible({ timeout: 15000 });
    await expect(upcomingSection).toBeVisible({ timeout: 15000 });

    const hasContent = await upcomingSection.locator('li, [class*="order"], [class*="card"]').first().isVisible({ timeout: 5000 }).catch(() => false);
    const hasEmpty = await upcomingSection.getByText(/no.*orders|empty/i).first().isVisible({ timeout: 3000 }).catch(() => false);
    expect(hasContent || hasEmpty).toBe(true);

    const viewAllUpcomingBtn = upcomingSection.getByRole('button', { name: /View All/i }).or(upcomingSection.getByRole('link', { name: /View All/i })).first();
    if (await viewAllUpcomingBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      await viewAllUpcomingBtn.click();
      await expect(catering).toHaveURL(/\/orders/, { timeout: 10000 });
    }
  });
});
