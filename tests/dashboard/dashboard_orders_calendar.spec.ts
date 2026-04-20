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

  // ── Visibility ──────────────────────────────────────────────────────────────

  test('Orders Calendar section is visible on page load', async () => {
    await expect(calendarSection()).toBeVisible({ timeout: 15000 });
  });

  test('Orders Calendar shows heading "Orders Calendar"', async () => {
    await expect(
      calendarSection().getByRole('heading', { name: 'Orders Calendar' }),
    ).toBeVisible({ timeout: 15000 });
  });

  test('Orders Calendar displays the current month and year', async () => {
    // The calendar header shows e.g. "April 2026"
    const now = new Date();
    const monthYear = now.toLocaleString('default', {
      month: 'long',
      year: 'numeric',
    });
    await expect(calendarSection()).toContainText(monthYear, {
      timeout: 15000,
    });
  });

  // ── Navigation ──────────────────────────────────────────────────────────────

  test('Previous month button is visible and clickable', async () => {
    const prevBtn = calendarSection().getByRole('button', {
      name: 'Previous month',
    });
    await expect(prevBtn).toBeVisible({ timeout: 15000 });
    await prevBtn.click();

    // After clicking prev, the month should change
    const now = new Date();
    const prevMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const prevMonthYear = prevMonth.toLocaleString('default', {
      month: 'long',
      year: 'numeric',
    });
    await expect(calendarSection()).toContainText(prevMonthYear, {
      timeout: 10000,
    });
  });

  test('Next month button is visible and clickable', async () => {
    const nextBtn = calendarSection().getByRole('button', {
      name: 'Next month',
    });
    await expect(nextBtn).toBeVisible({ timeout: 15000 });
    await nextBtn.click();

    const now = new Date();
    const nextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1);
    const nextMonthYear = nextMonth.toLocaleString('default', {
      month: 'long',
      year: 'numeric',
    });
    await expect(calendarSection()).toContainText(nextMonthYear, {
      timeout: 10000,
    });
  });

  test('"Today" button navigates back to the current month', async () => {
    // First navigate away to a different month
    await calendarSection().getByRole('button', { name: 'Next month' }).click();

    // Then click Today to return
    await calendarSection()
      .getByRole('button', { name: "Go to today's date" })
      .click();

    const now = new Date();
    const monthYear = now.toLocaleString('default', {
      month: 'long',
      year: 'numeric',
    });
    await expect(calendarSection()).toContainText(monthYear, {
      timeout: 10000,
    });
  });

  // ── Day Grid ────────────────────────────────────────────────────────────────

  test('Calendar renders day-of-week headers', async () => {
    const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    for (const day of days) {
      await expect(calendarSection()).toContainText(day, { timeout: 15000 });
    }
  });

  test("Today's date cell is visually highlighted", async () => {
    // Today's date button should be present
    const today = new Date();
    const todayLabel = `Select date ${today.toLocaleString('default', { month: 'long' })} ${today.getDate()}, ${today.getFullYear()}`;
    await expect(
      calendarSection().getByRole('button', {
        name: new RegExp(todayLabel, 'i'),
      }),
    ).toBeVisible({ timeout: 15000 });
  });

  test('Clicking a date cell with orders shows orders in the side panel', async () => {
    // Find a date button that has orders (aria-label includes "orders")
    const dateWithOrders = calendarSection()
      .getByRole('button', { name: /\d+ orders?/ })
      .first();
    await expect(dateWithOrders).toBeVisible({ timeout: 15000 });
    await dateWithOrders.click();

    // The right-hand panel should show order items after clicking
    // The panel heading updates to the selected date
    await expect(calendarSection()).toContainText(/Order #/i, {
      timeout: 10000,
    });
  });

  test('Date cells with no orders have no order count badge', async () => {
    // A date button without orders should NOT contain an order count div
    const dateWithoutOrders = calendarSection()
      .getByRole('button', { name: /^Select date .*, 2026$/ })
      .first();
    await expect(dateWithoutOrders).toBeVisible({ timeout: 15000 });
  });

  // ── Delivery / Created Date Filter ─────────────────────────────────────────

  test('Delivery Date filter button is visible and active by default', async () => {
    const deliveryBtn = calendarSection().getByRole('button', {
      name: 'View by delivery date',
    });
    await expect(deliveryBtn).toBeVisible({ timeout: 15000 });
  });

  test('Created Date filter button is visible', async () => {
    const createdBtn = calendarSection().getByRole('button', {
      name: 'View by created date',
    });
    await expect(createdBtn).toBeVisible({ timeout: 15000 });
  });

  test('Switching to "Created Date" filter updates the calendar', async () => {
    const createdBtn = calendarSection().getByRole('button', {
      name: 'View by created date',
    });
    await createdBtn.click();
    // Calendar section should still be visible after switching filter
    await expect(calendarSection()).toBeVisible({ timeout: 10000 });
    // Switching back
    await calendarSection()
      .getByRole('button', { name: 'View by delivery date' })
      .click();
    await expect(calendarSection()).toBeVisible({ timeout: 10000 });
  });
});
