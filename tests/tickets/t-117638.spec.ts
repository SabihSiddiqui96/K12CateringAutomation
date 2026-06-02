// Test Link: https://dev.azure.com/Cybersoft-Technologies-Inc/PrimeroEdge%20Classic/_workitems/edit/117740

import { test, expect, Page } from '@playwright/test';
import {
  loginToK12Catering,
  navigateK12CateringMenu,
  scrollUntilVisible,
  getInputValueFromLocator,
} from '../../utils/helpers';

test.use({ storageState: { cookies: [], origins: [] } });

// ─── Constants (locators shared with the Settings Payment Display Label flow) ─
const paymentDisplayLabelHeading = 'Payment display label';
const paymentDisplayLabelInputId = '#accounting-string-description-input';

function newDisplayLabel(): string {
  return `AutoPA ${Date.now()}`;
}

// ─── Navigation helpers (mirror the repo's existing Reports/Settings flows) ───

async function ensureInK12CateringApp(page: Page): Promise<void> {
  await page.keyboard.press('Escape').catch(() => undefined);
  const sidebar = page.locator('aside[aria-label="Main navigation"]');
  if (await sidebar.isVisible({ timeout: 2000 }).catch(() => false)) return;
  const launcherLink = page.locator('a[href*="/login?token="]').first();
  if (await launcherLink.isVisible({ timeout: 3000 }).catch(() => false)) {
    await launcherLink.click();
    await page.waitForLoadState('domcontentloaded');
  }
  await expect(sidebar).toBeVisible({ timeout: 30000 });
}

async function goToSettings(page: Page): Promise<void> {
  await ensureInK12CateringApp(page);
  await navigateK12CateringMenu(page, 'Settings');
  await page.waitForLoadState('domcontentloaded');
  await expect(page.locator('h1')).toContainText('Settings', { timeout: 15000 });
}

async function goToReports(page: Page): Promise<void> {
  await page.keyboard.press('Escape').catch(() => undefined);
  const homeBtn = page.getByRole('button', { name: 'Go to home page' });
  if (await homeBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
    await homeBtn.click();
    await page.waitForLoadState('domcontentloaded');
  }
  const sidebar = page.locator('aside[aria-label="Main navigation"]');
  await expect(sidebar).toBeVisible({ timeout: 10000 });
  const reportsButton = sidebar.getByLabel('Navigate to Reports', { exact: true });
  await expect(reportsButton).toBeVisible({ timeout: 10000 });
  await reportsButton.scrollIntoViewIfNeeded();
  await reportsButton.click();
  await expect(page.locator('h1')).toContainText('Reports', { timeout: 15000 });
  await page.waitForLoadState('domcontentloaded');
}

// Open Reports → Payment Analysis and wait for the report to render.
async function goToPaymentAnalysis(page: Page): Promise<void> {
  await goToReports(page);
  const tile = page
    .getByRole('button', { name: /Payment Analysis/i })
    .or(page.getByRole('link', { name: /Payment Analysis/i }))
    .first();
  await scrollUntilVisible(page, { target: tile });
  await expect(tile).toBeVisible({ timeout: 15000 });
  await tile.scrollIntoViewIfNeeded();
  await tile.click();
  await page.waitForLoadState('domcontentloaded');
  await expect(
    page.getByRole('heading', { name: /^Payment Analysis$/i }).first(),
  ).toBeVisible({ timeout: 20000 });
  // Tables hydrate a beat after the heading.
  await page.waitForTimeout(1500);
}

// The two tables are plain <table>s distinguished by their column headers:
//   Payment Method Usage  → has "Payment Method" AND "Percentage" columns
//   Outstanding Payments  → has the "Days Outstanding" column
function paymentMethodUsageTable(page: Page) {
  return page
    .locator('table')
    .filter({ has: page.locator('th', { hasText: /Payment Method/i }) })
    .filter({ has: page.locator('th', { hasText: /Percentage/i }) });
}

function outstandingPaymentsTable(page: Page) {
  return page
    .locator('table')
    .filter({ has: page.locator('th', { hasText: /Days Outstanding/i }) });
}

// Settings → edit the Payment Display Label. Returns the previous value so the
// test can restore it afterward (keeps the shared QA setting clean).
async function setPaymentDisplayLabel(page: Page, label: string): Promise<string> {
  await goToSettings(page);
  await scrollUntilVisible(page, {
    target: page.getByText(paymentDisplayLabelHeading, { exact: false }),
  });
  await page
    .getByRole('button', { name: /Edit accounting string description/i })
    .click();

  const input = page.locator(paymentDisplayLabelInputId);
  await expect(input).toBeVisible({ timeout: 10000 });
  const previous = await getInputValueFromLocator(page, paymentDisplayLabelInputId);

  await input.fill('');
  await input.fill(label);
  await page.getByRole('button', { name: /Save Changes/i }).click();

  const toast = page.getByRole('alert');
  await expect(toast).toBeVisible({ timeout: 10000 });
  await expect(toast).toContainText(/Payment display label saved/i);
  await page.waitForTimeout(1000);
  await expect(toast).not.toBeVisible({ timeout: 30000 });

  return previous;
}

test('Catering - Reports - Payment Analysis reflects the Payment Display Label in both tables', async ({
  page,
}) => {
  test.setTimeout(5 * 60 * 1000);

  const catering = await loginToK12Catering(page, { navigateTo: 'Reports' });
  await catering.waitForLoadState('domcontentloaded');
  await expect(catering.locator('h1')).toContainText('Reports', { timeout: 15000 });

  // ── Step 1-2: Reports → Payment Analysis ──
  await goToPaymentAnalysis(catering);

  // ── Step 3: Payment Method Usage title + table are displayed ──
  await expect(
    catering.getByRole('heading', { name: /Payment Method Usage/i }).first(),
  ).toBeVisible({ timeout: 15000 });
  const usageTable = paymentMethodUsageTable(catering);
  await expect(usageTable.first()).toBeVisible({ timeout: 15000 });

  // ── Step 4: Outstanding Payments table shows the accounting-string label in
  //    its Payment Method column. Capture the current label to confirm it later
  //    changes in both tables. ──
  await expect(
    catering.getByRole('heading', { name: /Outstanding Payments/i }).first(),
  ).toBeVisible({ timeout: 15000 });
  const outstandingTable = outstandingPaymentsTable(catering);
  await expect(outstandingTable.first()).toBeVisible({ timeout: 15000 });
  await expect(
    outstandingTable.locator('th', { hasText: /Payment Method/i }).first(),
  ).toBeVisible();

  let previousLabel = '';

  try {
    // ── Step 5: Settings → change the Payment Display Label to a new name ──
    const updatedLabel = newDisplayLabel();
    previousLabel = await setPaymentDisplayLabel(catering, updatedLabel);
    expect(updatedLabel).not.toBe(previousLabel);

    // ── Step 6: Back to Reports → Payment Analysis; the updated label is
    //    reflected in BOTH the Payment Method Usage and Outstanding Payments
    //    tables' Payment Method column. ──
    await goToPaymentAnalysis(catering);

    const usageAfter = paymentMethodUsageTable(catering);
    await expect(usageAfter.first()).toBeVisible({ timeout: 15000 });
    await expect(
      usageAfter.getByRole('cell', { name: updatedLabel, exact: true }).first(),
    ).toBeVisible({ timeout: 15000 });

    const outstandingAfter = outstandingPaymentsTable(catering);
    await expect(outstandingAfter.first()).toBeVisible({ timeout: 15000 });
    await expect(
      outstandingAfter.getByRole('cell', { name: updatedLabel, exact: true }).first(),
    ).toBeVisible({ timeout: 15000 });
  } finally {
    // Restore the original label so the shared QA setting isn't left mutated.
    if (previousLabel) {
      await setPaymentDisplayLabel(catering, previousLabel).catch(() => undefined);
    }
  }
});
