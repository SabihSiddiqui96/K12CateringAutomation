import { test, expect, Page } from '@playwright/test';
import {
  loginToK12Catering,
  navigateK12CateringMenu,
} from '../../utils/helpers';

test.use({ storageState: { cookies: [], origins: [] } });

test.describe('Reports', () => {
  let catering: Page;

  test.beforeAll(async ({ browser }) => {
    const context = await browser.newContext();
    const page = await context.newPage();
    catering = await loginToK12Catering(page);
  });

  test.beforeEach(async () => {
    await navigateK12CateringMenu(catering, 'Reports');
    await catering.waitForLoadState('domcontentloaded');
  });

  test('Reports - Page heading, count, search and filter controls are visible', async () => {
    await expect(catering.locator('h1')).toContainText('Reports', { timeout: 10000 });
    await expect(catering.getByRole('heading', { name: /^\d+$/ }).first()).toBeVisible();
    await expect(catering.getByRole('textbox', { name: /Search reports/i })).toBeVisible();
    await expect(catering.getByRole('button', { name: /Select time period/i })).toBeVisible();
    await expect(catering.getByRole('button', { name: /Select date type/i })).toBeVisible();
  });

  test('Reports - All report categories and key report buttons are visible', async () => {
    await expect(catering.getByRole('heading', { name: /Sales & Revenue/i }).first()).toBeVisible({ timeout: 10000 });
    await expect(catering.getByRole('button', { name: /Sales & Revenue Dashboard/i }).first()).toBeVisible();
    await expect(catering.getByRole('button', { name: /Financial Summary/i }).first()).toBeVisible();
    await expect(catering.getByRole('heading', { name: /^Orders$/i }).first()).toBeVisible();
    await expect(catering.getByRole('button', { name: /Order Status Summary/i }).first()).toBeVisible();
    await expect(catering.getByRole('heading', { name: /^Menu$/i }).first()).toBeVisible();
    await expect(catering.getByRole('button', { name: /Top Selling Menu Items/i }).first()).toBeVisible();
    await expect(catering.getByRole('button', { name: /Revenue by Customer/i }).first()).toBeVisible();
    await expect(catering.getByRole('button', { name: /Allergen Compliance Report/i }).first()).toBeVisible();
  });

  test('Reports - Search filters list and shows empty state for no match', async () => {
    const searchInput = catering.getByRole('textbox', { name: /Search reports/i });
    await searchInput.fill('Revenue');
    await catering.waitForTimeout(600);
    await expect(catering.getByRole('button', { name: /Revenue by Customer/i }).first()).toBeVisible({ timeout: 10000 });

    await searchInput.fill('ZZZNoMatchXXX99999');
    await catering.waitForTimeout(600);
    await expect(catering.getByRole('button', { name: /Sales & Revenue Dashboard/i }).first()).not.toBeVisible({ timeout: 5000 });

    await searchInput.clear();
    await catering.waitForTimeout(400);
    await expect(catering.getByRole('button', { name: /Order Status Summary/i }).first()).toBeVisible({ timeout: 10000 });
  });

  test('Reports - Sales & Revenue Dashboard opens with Delivered default and Back button', async () => {
    await catering.getByRole('button', { name: /Sales & Revenue Dashboard/i }).first().click();
    await catering.waitForLoadState('networkidle');
    await expect(catering.getByRole('heading', { name: /Sales & Revenue Dashboard/i }).first()).toBeVisible({ timeout: 10000 });
    const statusFilter = catering.getByRole('button', { name: /Select.*status/i });
    await expect(statusFilter).toContainText(/Delivered/i);
    await expect(catering.getByRole('button', { name: /Back to reports list/i })).toBeVisible();
    await catering.getByRole('button', { name: /Back to reports list/i }).click();
    await catering.waitForLoadState('domcontentloaded');
    await expect(catering.getByRole('button', { name: /Sales & Revenue Dashboard/i }).first()).toBeVisible({ timeout: 10000 });
  });

  test('Reports - Financial Summary and Revenue by Customer default to Delivered status', async () => {
    const financialBtn = catering.getByRole('button', { name: /Financial Summary/i }).first();
    await expect(financialBtn).toBeVisible({ timeout: 15000 });
    await financialBtn.click();
    await catering.waitForLoadState('networkidle');
    await expect(catering.getByRole('button', { name: /Select.*status/i })).toContainText(/Delivered/i, { timeout: 10000 });
    await catering.getByRole('button', { name: /Back to reports list/i }).click();
    await catering.waitForLoadState('domcontentloaded');

    const revenueBtn = catering.getByRole('button', { name: /Revenue by Customer/i }).first();
    await revenueBtn.scrollIntoViewIfNeeded();
    await revenueBtn.click();
    await catering.waitForLoadState('networkidle');
    await expect(catering.getByRole('button', { name: /Select.*status/i })).toContainText(/Delivered/i, { timeout: 10000 });
    await expect(catering.getByRole('button', { name: /Back to reports list/i })).toBeVisible();
  });
});
