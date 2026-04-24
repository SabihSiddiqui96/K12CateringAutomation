import { test, expect, Page } from '@playwright/test';
import {
  loginToK12Catering,
  navigateK12CateringMenu,
} from '../../utils/helpers';

test.use({ storageState: { cookies: [], origins: [] } });

test.describe("What's New", () => {
  let catering: Page;

  test.beforeAll(async ({ browser }) => {
    const context = await browser.newContext();
    const page = await context.newPage();
    catering = await loginToK12Catering(page);
  });

  test.beforeEach(async () => {
    await navigateK12CateringMenu(catering, "What's New?");
    await catering.waitForLoadState('domcontentloaded');
  });

  test("What's New - Page heading and tabs are visible", async () => {
    await expect(catering.locator('h1')).toContainText("What's New", { timeout: 10000 });
    await expect(catering.getByRole('tab', { name: /Release Notes/i })).toBeVisible();
    await expect(catering.getByRole('tab', { name: /Resources/i })).toBeVisible();
    await expect(catering.getByText(/Error Code: 404|something went wrong/i)).not.toBeVisible();
  });

  test("What's New - Release Notes tab shows content or empty state", async () => {
    await catering.getByRole('tab', { name: /Release Notes/i }).click();
    await catering.waitForTimeout(500);

    const hasReleases = await catering.getByRole('article').first().isVisible({ timeout: 3000 }).catch(() => false);
    const hasEmptyState = await catering.getByText(/No releases/i).first().isVisible({ timeout: 3000 }).catch(() => false);
    expect(hasReleases || hasEmptyState).toBe(true);
  });

  test("What's New - Resources tab switches content and sidebar sections are visible", async () => {
    await catering.getByRole('tab', { name: /Resources/i }).click();
    await catering.waitForTimeout(500);
    await expect(catering.locator('main, [role="main"], #main-content').first()).toBeVisible({ timeout: 10000 });
    await expect(catering.getByRole('heading', { name: /^Resources$/i })).toBeVisible({ timeout: 10000 });
    await expect(catering.getByText(/Quick reference guides and documentation/i)).toBeVisible();
    await expect(catering.getByText(/Customer Quick Reference/i).first()).toBeVisible();
    await expect(catering.getByText(/Latest/i).first()).toBeVisible();
  });
});
