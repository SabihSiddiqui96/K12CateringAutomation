import { test, expect, Page } from '@playwright/test';
import {
  loginToK12Catering,
  navigateK12CateringMenu,
} from '../../utils/helpers';

test.use({ storageState: { cookies: [], origins: [] } });

test.describe('Notifications', () => {
  let catering: Page;

  test.beforeAll(async ({ browser }) => {
    const context = await browser.newContext();
    const page = await context.newPage();
    catering = await loginToK12Catering(page);
  });

  test.beforeEach(async () => {
    await navigateK12CateringMenu(catering, 'Notifications');
    await catering.waitForLoadState('domcontentloaded');
  });

  test('Notifications - Page heading, filter buttons and count badge are visible', async () => {
    await expect(catering.locator('h1')).toContainText('Notifications', { timeout: 10000 });
    await expect(catering.getByRole('heading', { name: /^\d+$/ }).first()).toBeVisible();
    await expect(catering.getByRole('button', { name: /Filter by all/i })).toBeVisible();
    await expect(catering.getByRole('button', { name: /Filter by unread/i })).toBeVisible();
    await expect(catering.getByRole('button', { name: /Filter by read/i })).toBeVisible();
    await expect(catering.getByText(/Error Code: 404|something went wrong/i)).not.toBeVisible();
  });

  test('Notifications - Notification list shows count summary and pagination', async () => {
    await expect(catering.getByText(/Showing \d+ to \d+ of \d+ notification/i)).toBeVisible({ timeout: 10000 });
    await expect(catering.getByRole('button', { name: /Previous page/i })).toBeVisible();
    await expect(catering.getByRole('button', { name: /Next page/i })).toBeVisible();
  });

  test('Notifications - Unread and Read filter buttons show results or empty state', async () => {
    await catering.getByRole('button', { name: /Filter by unread/i }).click();
    await catering.waitForTimeout(500);
    await expect(
      catering.getByText(/All caught up|Showing \d+ to \d+ of \d+/i).first(),
    ).toBeVisible({ timeout: 10000 });

    await catering.getByRole('button', { name: /Filter by read/i }).click();
    await catering.waitForTimeout(500);
    await expect(
      catering.getByText(/All caught up|Showing \d+ to \d+ of \d+|No notifications/i).first(),
    ).toBeVisible({ timeout: 10000 });

    await catering.getByRole('button', { name: /Filter by all/i }).click();
  });

  test('Notifications - Time Period and Type filter combos have expected options', async () => {
    const timePeriodSelect = catering.getByRole('combobox', { name: /Filter by time period/i });
    await expect(timePeriodSelect).toBeVisible({ timeout: 10000 });
    const timeOptions = await timePeriodSelect.locator('option').allTextContents();
    expect(timeOptions).toContain('Last 3 Months');
    expect(timeOptions).toContain('All Time');

    const typeSelect = catering.getByRole('combobox', { name: /Filter by notification type/i });
    await expect(typeSelect).toBeVisible();
    const typeOptions = await typeSelect.locator('option').allTextContents();
    expect(typeOptions).toContain('All Types');
    expect(typeOptions).toContain('Info');
    expect(typeOptions).toContain('Warning');
  });

  test('Notifications - Combining read filter and type filter returns results or empty state', async () => {
    await catering.getByRole('button', { name: /Filter by read/i }).click();
    await catering.waitForTimeout(300);

    const typeSelect = catering.getByRole('combobox', { name: /Filter by notification type/i });
    await typeSelect.selectOption({ label: 'Info' });
    await catering.waitForTimeout(600);

    await expect(
      catering.getByText(/Showing \d+ to \d+ of \d+ notification/i).or(catering.getByText(/No notifications/i)).first(),
    ).toBeVisible({ timeout: 10000 });

    await catering.getByRole('button', { name: /Filter by all/i }).click();
    await typeSelect.selectOption({ label: 'All Types' });
  });

  test('Notifications - Unread filter shows badge count or All caught up', async () => {
    await catering.getByRole('button', { name: /Filter by unread/i }).click();
    await catering.waitForTimeout(500);

    const hasAllCaughtUp = await catering.getByText(/All caught up/i).first().isVisible({ timeout: 5000 }).catch(() => false);
    const hasUnreadList = await catering.getByText(/Showing \d+ to \d+ of \d+ notification/i).first().isVisible({ timeout: 5000 }).catch(() => false);
    expect(hasAllCaughtUp || hasUnreadList).toBe(true);

    await catering.getByRole('button', { name: /Filter by all/i }).click();
  });
});
