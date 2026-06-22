// Test Link: https://dev.azure.com/Cybersoft-Technologies-Inc/PrimeroEdge%20Classic/_workitems/edit/117621

import { test, expect, Page } from '@playwright/test';
import { loginToK12Catering } from '../../utils/helpers';
import { ensureInK12CateringApp, clickSidebarItem } from '../../utils/dataSync';
import { resetCustomerPasswordFromAccounts } from '../../utils/accountFlow';
import { getK12CateringUrl, getK12CateringLoginUrl } from '../../utils/baseUrl';

const CUSTOMER_EMAIL = 'SabihQATesting@outlook.com';
const CUSTOMER_PASSWORD = 'Password1!';

test.use({ storageState: { cookies: [], origins: [] } });

const EMAIL_RE = /[\w.+-]+@[\w.-]+\.\w+/g;

// The inbox shows one user email per item, so the email count is a reliable
// "visible items" proxy (cards/charts contain no emails).
async function inboxItemCount(page: Page): Promise<number> {
  const txt = (await page.locator('main').first().innerText().catch(() => '')) ?? '';
  return (txt.match(EMAIL_RE) || []).length;
}

// Parse the count a chip declares, e.g. "All (4)" -> 4, "🐛 Bugs (1)" -> 1.
async function chipCount(page: Page, name: RegExp): Promise<number> {
  const label = (await page.getByRole('button', { name }).first().innerText().catch(() => '')) ?? '';
  const m = label.match(/\((\d+)\)/);
  return m ? Number(m[1]) : -1;
}

async function openDashboard(page: Page): Promise<void> {
  await ensureInK12CateringApp(page);
  await clickSidebarItem(page, 'User Feedback');
  await ensureInK12CateringApp(page);
  await expect(page).toHaveURL(/\/admin\/feedback/, { timeout: 20000 });
  await expect(page.getByRole('heading', { name: 'User Feedback' })).toBeVisible({ timeout: 20000 });
  await page.getByText(/Loading/i).first().waitFor({ state: 'hidden', timeout: 15000 }).catch(() => { });
}

test('Catering - User Feedback - Cybersoft Admin dashboard: cards, charts, inbox filters, CSV export', async ({
  page,
}) => {
  test.setTimeout(4 * 60 * 1000);

  const c = await loginToK12Catering(page);

  // AC2: the "User Feedback" item is in the left nav for a Cybersoft Admin.
  await expect(
    c.locator('aside[aria-label="Main navigation"]').getByLabel('Navigate to User Feedback'),
  ).toBeVisible({ timeout: 15000 });

  // AC1: open it -> /admin/feedback with the "Cybersoft Admin Only" badge.
  await openDashboard(c);
  await expect(c.getByText(/Cybersoft Admin Only/i).first()).toBeVisible({ timeout: 10000 });

  // AC3: four summary metric cards.
  for (const card of [/Total Responses/i, /Positive Sentiment/i, /Bug Reports/i, /Ideas Submitted/i]) {
    await expect(c.getByRole('button', { name: card }).first()).toBeVisible({ timeout: 10000 });
  }

  // AC4 / AC5: the charts are present.
  await expect(c.getByRole('heading', { name: /Weekly Volume/i })).toBeVisible();
  await expect(c.getByRole('heading', { name: /Breakdown by Type/i })).toBeVisible();
  await expect(c.getByRole('heading', { name: /Feedback by Page/i })).toBeVisible();

  // AC4: weekly range selector — changing it must not reload the page.
  const weekRange = c.getByRole('combobox', { name: /Select week range/i });
  await expect(weekRange).toBeVisible();
  await weekRange.selectOption({ label: 'Last 4 weeks' });
  await weekRange.selectOption({ label: 'Last 12 weeks' });
  await expect(c).toHaveURL(/\/admin\/feedback/); // still on the same page (client-side)
  await expect(c.getByRole('heading', { name: 'User Feedback' })).toBeVisible();

  // AC5: page-breakdown limit selector present.
  await expect(c.getByRole('combobox', { name: /Select page limit/i })).toBeVisible();

  // AC6: inbox shows the same number of items as the "All (N)" chip declares.
  const allCount = await chipCount(c, /^All \(\d+\)/i);
  expect(allCount).toBeGreaterThan(0);
  await expect.poll(() => inboxItemCount(c), { timeout: 10000 }).toBe(allCount);

  // AC6: a chip filters the list to its declared count, and "All" restores it.
  const bugsCount = await chipCount(c, /Bugs \(\d+\)/i);
  await c.getByRole('button', { name: /Bugs \(\d+\)/i }).first().click();
  await expect.poll(() => inboxItemCount(c), { timeout: 10000 }).toBe(bugsCount);
  await c.getByRole('button', { name: /^All \(\d+\)/i }).first().click();
  await expect.poll(() => inboxItemCount(c), { timeout: 10000 }).toBe(allCount);

  // AC3: clicking the "Bug Reports" CARD filters the inbox like the Bugs chip AND
  // syncs the chip (its style changes to active). Clicking the card again clears it.
  const bugsChip = c.getByRole('button', { name: /Bugs \(\d+\)/i }).first();
  const chipClassBefore = await bugsChip.getAttribute('class');
  await c.getByRole('button', { name: /Bug Reports/i }).first().click();
  await expect.poll(() => inboxItemCount(c), { timeout: 10000 }).toBe(bugsCount);
  await expect.poll(async () => (await bugsChip.getAttribute('class')) !== chipClassBefore).toBe(true);
  // Clear the filter via the All chip. (Per AC3 the card filters the inbox and
  // syncs the chip; clearing is done with the All chip — the "click the active
  // card again to clear" requirement was dropped from the AC.)
  await c.getByRole('button', { name: /^All \(\d+\)/i }).first().click();
  await expect.poll(() => inboxItemCount(c), { timeout: 10000 }).toBe(allCount);

  // AC6: the page filter narrows the inbox.
  const pageFilter = c.getByRole('combobox', { name: /Filter by page/i });
  await expect(pageFilter).toBeVisible();
  const pageOptions = await pageFilter.locator('option').count();
  if (pageOptions > 1) {
    await pageFilter.selectOption({ index: 1 });
    await expect.poll(() => inboxItemCount(c), { timeout: 10000 }).toBeLessThanOrEqual(allCount);
    await pageFilter.selectOption({ index: 0 }); // back to All pages
  }

  // "Send Digest Now" -> confirm the reworded confirmation dialog body, then Cancel
  // (do NOT confirm — "Send Now" would email all Cybersoft Admins). ADO 117622 reword.
  await c.getByRole('button', { name: /Send Digest Now/i }).click();
  const digestDialog = c.getByRole('dialog').first();
  await expect(digestDialog).toContainText(
    /This will immediately send the weekly feedback summary email to all Cybersoft admins who are opted-in\. Continue\?/i,
  );
  await digestDialog.getByRole('button', { name: /^Cancel$/i }).click();
  await expect(digestDialog).toBeHidden({ timeout: 8000 });

  // AC7 + the "today's feedback" fix: submit a uniquely-marked feedback via the
  // widget, Refresh, then Export CSV and confirm it downloads with the right columns
  // AND includes the just-submitted (current-day) feedback row.
  const marker = `SabihTesting CSV-check ${Date.now()}`;
  await c.getByRole('button', { name: /Open feedback menu/i }).click();
  await c.getByText('This is helpful').first().click();
  await c.locator('textarea:visible').first().fill(marker);
  await c.getByRole('button', { name: /^Send feedback$/i }).click();
  await expect(c.getByText(/Thank you for your feedback/i).first()).toBeVisible({ timeout: 10000 });
  await c.getByRole('button', { name: /^Refresh$/i }).first().click().catch(() => { });
  await c.waitForTimeout(1500);

  const downloadPromise = c.waitForEvent('download', { timeout: 20000 });
  await c.getByRole('button', { name: /Export CSV/i }).first().click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toMatch(/^catering-feedback-\d{4}-\d{2}-\d{2}\.csv$/);
  const fs = await import('fs');
  const csv = fs.readFileSync((await download.path())!, 'utf8');
  const header = (csv.split(/\r?\n/)[0] || '').replace(/"/g, '').toLowerCase();
  // AC7 columns (the "id" column was dropped from the AC):
  // type, sentiment, comment, page_name, user_email, created_at.
  for (const col of ['type', 'sentiment', 'comment', 'page_name', 'user_email', 'created_at']) {
    expect(header).toContain(col);
  }
  // today's submission is included in the export.
  expect(csv).toContain(marker);
});

test('Catering - User Feedback - a non-Cybersoft-Admin cannot see or access the dashboard', async ({
  page,
  browser,
}) => {
  test.setTimeout(4 * 60 * 1000);

  // As a Cybersoft Admin, set a known password for the customer so we can sign in.
  const admin = await loginToK12Catering(page);
  await resetCustomerPasswordFromAccounts(admin, CUSTOMER_EMAIL, CUSTOMER_PASSWORD);

  const ctx = await browser.newContext();
  const cust = await ctx.newPage();
  try {
    await cust.goto(getK12CateringLoginUrl());
    await cust.waitForLoadState('domcontentloaded');
    // The customer portal login uses #email-input / #password-input (the password
    // field has no textbox role, so target by id).
    await expect(cust.locator('#email-input')).toBeVisible({ timeout: 20000 });
    await cust.locator('#email-input').fill(CUSTOMER_EMAIL);
    await cust.locator('#password-input').fill(CUSTOMER_PASSWORD);
    await cust.getByRole('button', { name: /^Sign In$/i }).click();
    await cust.waitForLoadState('networkidle');
    await expect(cust).not.toHaveURL(/login/i, { timeout: 15000 });

    // AC2: a non-Cybersoft-Admin must NOT see the "User Feedback" nav item.
    await expect(cust.getByLabel('Navigate to User Feedback')).toHaveCount(0);

    // AC1: navigating directly to /admin/feedback is blocked (no dashboard renders).
    await cust.goto(getK12CateringUrl().replace(/\/$/, '') + '/admin/feedback');
    await cust.waitForLoadState('domcontentloaded');
    await cust.waitForTimeout(2500);
    await expect(cust.getByText(/Cybersoft Admin Only/i)).toHaveCount(0);
    await expect(cust.getByRole('heading', { name: 'User Feedback' })).toHaveCount(0);
  } finally {
    await ctx.close();
  }
});
