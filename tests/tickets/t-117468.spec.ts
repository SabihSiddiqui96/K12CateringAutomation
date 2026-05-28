// Test Link: https://dev.azure.com/Cybersoft-Technologies-Inc/PrimeroEdge%20Classic/_workitems/edit/117501
// T-117468 — Editing an order logs an "Order edited" entry under Order Activity.

import { test, expect, Page } from '@playwright/test';
import {
  loginToK12Catering,
  navigateK12CateringMenu,
} from '../../utils/helpers';

test.use({ storageState: { cookies: [], origins: [] } });

const orderEditedActivity =
  /Order edited:\s*Guest count or special instructions updated/i;

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

    await expect(page.getByRole('heading', { name: /Order\s*#/i })).toBeVisible({
      timeout: 15000,
    });
    return;
  }

  throw new Error('No non-cancelled order found to edit.');
}

test('Catering - Orders - Editing an order records an Order Edited entry in Order Activity', async ({
  page,
}) => {
  const catering = await loginToK12Catering(page);
  await navigateK12CateringMenu(catering, 'Orders');
  await catering.waitForLoadState('domcontentloaded');

  await openFirstNonCancelledOrder(catering);

  // Order Activity section exists on the detail page; capture the baseline
  // count of "Order edited" entries so we can confirm a new one is appended.
  await expect(
    catering.getByRole('heading', { name: 'Order Activity' }),
  ).toBeVisible({ timeout: 15000 });
  const editedEntriesBefore = await catering
    .getByText(orderEditedActivity)
    .count();

  // Step 5 — open the order editor.
  await catering.getByRole('button', { name: 'Edit Order' }).click();
  await expect(catering).toHaveURL(/\/orders\/edit/, { timeout: 15000 });

  // Step 6 — edit the "Guest count and special instructions" section. We change
  // only the special-instructions text (a unique value) so the edit always
  // registers without altering order pricing.
  await catering
    .getByRole('button', { name: /Guest count and special instructions/i })
    .click();

  const specialInstructions = catering.locator(
    '#edit-special-instructions-textarea',
  );
  await expect(specialInstructions).toBeVisible({ timeout: 10000 });
  await specialInstructions.fill(`QA regression edit ${Date.now()}`);

  await catering.getByRole('button', { name: /^Next$/i }).click();

  const confirmButton = catering.getByRole('button', {
    name: /Confirm Changes/i,
  });
  await expect(confirmButton).toBeVisible({ timeout: 10000 });
  await confirmButton.click();

  // Saving returns to the order detail page.
  await expect(catering).toHaveURL(/\/orders\/details/, { timeout: 20000 });
  await expect(
    catering.getByRole('heading', { name: 'Order Activity' }),
  ).toBeVisible({ timeout: 15000 });

  // Step 7 — Order Activity shows the new "Order edited" entry.
  const editedEntry = catering.getByText(orderEditedActivity).first();
  await expect(editedEntry).toBeVisible({ timeout: 15000 });

  await expect
    .poll(() => catering.getByText(orderEditedActivity).count(), {
      timeout: 15000,
    })
    .toBeGreaterThan(editedEntriesBefore);
});
