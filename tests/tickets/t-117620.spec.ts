// Test Link: https://dev.azure.com/Cybersoft-Technologies-Inc/PrimeroEdge%20Classic/_workitems/edit/117620

import { test, expect, Page } from '@playwright/test';
import { loginToK12Catering } from '../../utils/helpers';
import { ensureInK12CateringApp } from '../../utils/dataSync';

test.use({ storageState: { cookies: [], origins: [] } });

const ACTIONS = ['This is helpful', "Something's off", 'Report a bug', 'Share an idea'];

async function openMenu(page: Page): Promise<void> {
  const fab = page.getByRole('button', { name: /Open feedback menu/i });
  if (await fab.isVisible({ timeout: 5000 }).catch(() => false)) await fab.click();
  await expect(page.getByText('Share an idea').first()).toBeVisible({ timeout: 8000 });
}

async function closeForm(page: Page): Promise<void> {
  const x = page.getByRole('button', { name: /Close feedback form/i }).first();
  if (await x.isVisible({ timeout: 2000 }).catch(() => false)) {
    await x.click();
    await page.waitForTimeout(400);
  }
}

test('Catering - User Feedback - feedback widget: expand, flyouts, validation, submit toast', async ({
  page,
}) => {
  test.setTimeout(4 * 60 * 1000);

  const c = await loginToK12Catering(page);
  await ensureInK12CateringApp(c);

  // AC1: the lightbulb feedback FAB is present (every authenticated page).
  await expect(c.getByRole('button', { name: /Open feedback menu/i })).toBeVisible({ timeout: 15000 });

  // AC2: clicking it reveals the four labelled action buttons.
  await openMenu(c);
  for (const a of ACTIONS) {
    await expect(c.getByText(a).first()).toBeVisible();
  }

  // AC2: clicking the FAB again (now "Close feedback menu") collapses them.
  await c.getByRole('button', { name: /Close feedback menu/i }).first().click();
  await expect(c.getByText('Share an idea').first()).toBeHidden({ timeout: 8000 });

  // AC2: clicking outside the widget also collapses it.
  await openMenu(c);
  await c.getByRole('heading', { name: 'Dashboard' }).first().click();
  await expect(c.getByText('Share an idea').first()).toBeHidden({ timeout: 8000 });

  // AC3: "This is helpful" -> rate flyout (Helpful/Confusing toggle, optional
  // comment, Send feedback, the "may not receive a direct response" footer).
  await openMenu(c);
  await c.getByText('This is helpful').first().click();
  await expect(c.getByRole('button', { name: /^Send feedback$/i })).toBeVisible({ timeout: 8000 });
  await expect(c.getByRole('button', { name: /Helpful/i }).first()).toBeVisible();
  await expect(c.getByRole('button', { name: /Confusing/i }).first()).toBeVisible();
  await expect(c.getByText(/may not receive a direct response/i).first()).toBeVisible();
  // toggle sentiment without closing the flyout
  await c.getByRole('button', { name: /Confusing/i }).first().click();
  await c.getByRole('button', { name: /Helpful/i }).first().click();
  await closeForm(c);

  // AC3: "Report a bug" -> bug flyout with the required textarea + "Report bug".
  await openMenu(c);
  await c.getByText('Report a bug').first().click();
  await expect(c.getByRole('button', { name: /^Report bug$/i })).toBeVisible({ timeout: 8000 });
  await expect(c.locator('textarea:visible').first()).toHaveAttribute('placeholder', /What happened/i);
  // only one flyout at a time: the rate flyout's "Send feedback" is gone.
  await expect(c.getByRole('button', { name: /^Send feedback$/i })).toHaveCount(0);
  // AC3: submitting the bug with an empty textarea shows a validation error and
  // does NOT submit (no toast).
  await c.getByRole('button', { name: /^Report bug$/i }).click();
  await expect(
    c.getByText(/required|please|can.?t be (blank|empty)|enter|provide/i).first(),
  ).toBeVisible({ timeout: 8000 });
  await expect(c.getByText(/Thank you for your feedback/i)).toHaveCount(0);
  await closeForm(c);

  // AC3: "Share an idea" -> idea flyout; the × close closes the flyout.
  await openMenu(c);
  await c.getByText('Share an idea').first().click();
  await expect(c.getByRole('button', { name: /^Submit idea$/i })).toBeVisible({ timeout: 8000 });
  await closeForm(c);
  await expect(c.getByRole('button', { name: /^Submit idea$/i })).toHaveCount(0); // flyout closed

  // AC4: submit an idea -> the "Thank you for your feedback" toast appears and the
  // widget collapses back to the FAB.
  await openMenu(c);
  await c.getByText('Share an idea').first().click();
  await c.locator('textarea:visible').first().fill(`QA automation ${Date.now()}`);
  await c.getByRole('button', { name: /^Submit idea$/i }).click();
  await expect(c.getByText(/Thank you for your feedback/i).first()).toBeVisible({ timeout: 10000 });
  await expect(c.getByRole('button', { name: /Open feedback menu/i })).toBeVisible({ timeout: 8000 });
});
