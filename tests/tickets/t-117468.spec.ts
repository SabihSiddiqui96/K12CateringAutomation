// Test Link… T-117468 — Editing an order logs an "Order edited" entry under Order Activity.

import { test, expect, Page } from '@playwright/test';
import {
  loginToK12Catering,
  navigateK12CateringMenu,
} from '../../utils/helpers';

test.use({ storageState: { cookies: [], origins: [] } });

// The activity message now reads "Order edited
const orderEditedActivity = /Order edited:.*special instructions updated/i;

// Re-auth through the PrimeroEdge launcher (token-refresh) page if it took over
async function reauthIfLauncher(page: Page): Promise<void> {
  const link = page.locator('a[href*="/login?token="]').first();
  if (await link.isVisible({ timeout: 1500 }).catch(() => false)) {
    await link.click();
    await page.waitForLoadState('domcontentloaded');
    await expect(
      page.locator('aside[aria-label="Main navigation"]'),
    ).toBeVisible({ timeout: 30000 });
  }
}

function orderCards(page: Page) {
  return page.locator('article').filter({
    has: page.getByRole('button', { name: /View details for order/i }),
  });
}

async function openFirstNonCancelledOrder(page: Page): Promise<void> {
  await expect(
    page.getByRole('heading', { name: 'Order Management' }),
  ).toBeVisible({ timeout: 20000 });

  const cards = orderCards(page);
  await expect(cards.first()).toBeVisible({ timeout: 20000 });

  const count = await cards.count();
  for (let i = 0; i < count; i++) {
    const card = cards.nth(i);
    const text = (await card.textContent()) ?? '';
    if (/cancelled/i.test(text)) continue;

    await card
      .getByRole('button', { name: /View details for order/i })
      .click();

    await page.waitForLoadState('domcontentloaded');
    await page
      .getByText(/Loading order details/i)
      .waitFor({ state: 'hidden', timeout: 30000 })
      .catch(() => {});

    // Confirm the order DETAILS opened via its "Order Summary" heading.
    await expect(page.getByRole('heading', { name: /Order Summary/i }).first()).toBeVisible({
      timeout: 15000,
    });
    return;
  }

  throw new Error('No non-cancelled order found to edit.');
}

test('Catering - Orders - Editing an order records an Order Edited entry in Order Activity', async ({
  page,
}) => {
  // The edit/verify is wrapped in a launcher-aware retry (re-doing the whole edit if the
  test.setTimeout(7 * 60 * 1000);

  const catering = await loginToK12Catering(page);
  await navigateK12CateringMenu(catering, 'Orders');
  await catering.waitForLoadState('domcontentloaded');

  await openFirstNonCancelledOrder(catering);
  const detailsUrl = catering.url();

  // Steps 5-7 — edit the order's special instructions and confirm a NEW "Order edited" entry
  await expect(async () => {
    await reauthIfLauncher(catering);
    if (!/\/orders\/details/.test(catering.url())) {
      await catering.goto(detailsUrl);
      await catering.waitForLoadState('domcontentloaded');
      await reauthIfLauncher(catering);
    }
    await expect(
      catering.getByRole('heading', { name: 'Order Activity' }),
    ).toBeVisible();
    const before = await catering.getByText(orderEditedActivity).count();

    // Open the editor and change only the special-instructions text (a unique value
    await catering.getByRole('button', { name: 'Edit Order' }).click();
    await expect(catering).toHaveURL(/\/orders\/edit/);
    await reauthIfLauncher(catering);
    await catering
      .getByRole('button', { name: /Guest count and special instructions/i })
      .click();
    const specialInstructions = catering.locator(
      '#edit-special-instructions-textarea',
    );
    await expect(specialInstructions).toBeVisible();
    await specialInstructions.fill(`QA regression edit ${Date.now()}`);
    await catering.getByRole('button', { name: /^Next$/i }).click();
    const confirmButton = catering.getByRole('button', {
      name: /Confirm Changes/i,
    });
    await expect(confirmButton).toBeVisible();
    await confirmButton.click();

    // Back on the detail page (recover through the launcher if it fired on save).
    await reauthIfLauncher(catering);
    if (!/\/orders\/details/.test(catering.url())) {
      await catering.goto(detailsUrl);
      await catering.waitForLoadState('domcontentloaded');
      await reauthIfLauncher(catering);
    }
    await expect(
      catering.getByRole('heading', { name: 'Order Activity' }),
    ).toBeVisible();
    const after = await catering.getByText(orderEditedActivity).count();
    expect(after).toBeGreaterThan(before);
  }).toPass({ timeout: 360000, intervals: [5000, 8000, 12000] });
});
