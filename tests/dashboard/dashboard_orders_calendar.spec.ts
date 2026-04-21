// Dashboard - Orders Calendar regression tests
// Tests the calendar section: month navigation, date selection,
// Delivery Date / Created Date filter toggle, and the date-wise orders panel

import { test, expect, Page } from '@playwright/test';
import {
  loginToK12Catering,
  navigateK12CateringMenu,
} from '../../utils/helpers';

test.setTimeout(180000);

test.use({ storageState: { cookies: [], origins: [] } });

test.describe('Dashboard - Orders Calendar', () => {
  let catering: Page;

  test.beforeAll(async ({ browser }) => {
    const context = await browser.newContext();
    const page = await context.newPage();
    catering = await loginToK12Catering(page, { navigateTo: 'Dashboard' });
  });

  test.beforeEach(async () => {
    await navigateK12CateringMenu(catering, 'Dashboard');
    await catering.waitForLoadState('domcontentloaded');

    // Reset to Advanced view
    const advancedButton = catering.getByRole('button', {
      name: 'Advanced view',
    });
    if ((await advancedButton.getAttribute('aria-pressed')) !== 'true') {
      await advancedButton.click();
      await expect(advancedButton).toHaveAttribute('aria-pressed', 'true');
    }

    // Scroll to calendar and reset to current month
    await catering
      .getByRole('button', { name: 'Scroll to calendar view' })
      .click();
    await catering
      .getByRole('region', { name: 'Calendar view and date-wise orders' })
      .getByRole('button', { name: "Go to today's date" })
      .click();
  });

  // Helper
  const calendarSection = () =>
    catering.getByRole('region', {
      name: 'Calendar view and date-wise orders',
    });

  test('Orders Calendar section is visible with heading and current month', async () => {
    await expect(calendarSection()).toBeVisible({ timeout: 15000 });
    await expect(
      calendarSection().getByRole('heading', { name: 'Orders Calendar' }),
    ).toBeVisible({ timeout: 15000 });
    const todayNow = new Date();
    const monthYear = todayNow.toLocaleString('default', {
      month: 'long',
      year: 'numeric',
    });
    await expect(calendarSection()).toContainText(monthYear, {
      timeout: 15000,
    });
  });

  test('Month navigation buttons and Today button update calendar month', async () => {
    const prevBtn = calendarSection().getByRole('button', {
      name: 'Previous month',
    });
    const nextBtn = calendarSection().getByRole('button', {
      name: 'Next month',
    });
    await expect(prevBtn).toBeVisible({ timeout: 15000 });
    await expect(nextBtn).toBeVisible({ timeout: 15000 });
    await prevBtn.click();
    const now = new Date();
    const prevMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const prevMonthYear = prevMonth.toLocaleString('default', {
      month: 'long',
      year: 'numeric',
    });
    await expect(calendarSection()).toContainText(prevMonthYear, {
      timeout: 10000,
    });
    await nextBtn.click();
    const currentMonthYear = now.toLocaleString('default', {
      month: 'long',
      year: 'numeric',
    });
    await expect(calendarSection()).toContainText(currentMonthYear, {
      timeout: 10000,
    });
    await calendarSection().getByRole('button', { name: 'Next month' }).click();
    await calendarSection()
      .getByRole('button', { name: "Go to today's date" })
      .click();

    const todayNow = new Date();
    const monthYear = todayNow.toLocaleString('default', {
      month: 'long',
      year: 'numeric',
    });
    await expect(calendarSection()).toContainText(monthYear, {
      timeout: 10000,
    });
  });

  test('Calendar day grid renders and selecting date with orders updates panel', async () => {
    const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    for (const day of days) {
      await expect(calendarSection()).toContainText(day, { timeout: 15000 });
    }
    const today = new Date();
    const todayLabel = `Select date ${today.toLocaleString('default', { month: 'long' })} ${today.getDate()}, ${today.getFullYear()}`;
    await expect(
      calendarSection().getByRole('button', {
        name: new RegExp(todayLabel, 'i'),
      }),
    ).toBeVisible({ timeout: 15000 });
    const dateWithOrders = calendarSection()
      .getByRole('button', { name: /\d+ orders?/ })
      .first();
    await expect(dateWithOrders).toBeVisible({ timeout: 15000 });
    await dateWithOrders.click();
    await expect(calendarSection()).toContainText(/Order #/i, {
      timeout: 10000,
    });
  });

  test('Calendar date type filter toggles between Delivery Date and Created Date', async () => {
    const deliveryBtn = calendarSection().getByRole('button', {
      name: 'View by delivery date',
    });
    const createdBtn = calendarSection().getByRole('button', {
      name: 'View by created date',
    });
    await expect(deliveryBtn).toBeVisible({ timeout: 15000 });
    await expect(createdBtn).toBeVisible({ timeout: 15000 });
    await createdBtn.click();
    await expect(calendarSection()).toBeVisible({ timeout: 10000 });
    await deliveryBtn.click();
    await expect(calendarSection()).toBeVisible({ timeout: 10000 });
  });
});
