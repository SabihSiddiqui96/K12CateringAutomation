import { test, expect, type Locator } from '@playwright/test';
import { loginToK12Catering, navigateK12CateringMenu } from '../../utils/helpers';
import { escapeRegExp, ensureInK12CateringApp } from '../../utils/dataSync';
import {
  startOrderToAdditionalDetails,
  selectPaymentAndContinue,
  reviewAndPlaceOrder,
  exportOrdersCsvText,
  clickNext,
} from '../../utils/orders';

/**
 * Catering - Orders - 'Event Name' + 'Paid' status (ADO PBI 117619).
 *
 * ONE test covering the whole feature on a single placed order: the required Event
 * Name at checkout (shown on Review, persisted to list + details), the Payment
 * Status field + "All Payments" filter, Mark as Paid (-> Payment Accepted) with
 * delivery/payment decoupling, and the Orders Export CSV containing the Event Name.
 * Manual (out of band): the payment-received email landing in the contacts' inboxes.
 *
 * The Payment-Status FILTER check runs LAST, because selecting a status leaves the
 * list filtered and would hide our (Pending) order from the earlier steps.
 */

test.use({ storageState: { cookies: [], origins: [] } });

test.describe('Orders - Event Name & Payment Status [ADO 117619]', () => {
  test('Event Name checkout + Payment Status + Mark as Paid + Export (full feature)', async ({ browser }) => {
    test.setTimeout(10 * 60 * 1000);
    const ctx = await browser.newContext();
    const cat = await loginToK12Catering(await ctx.newPage());
    const eventName = `AutoFull ${Date.now().toString().slice(-6)}`;

    // Open OUR order's details (re-auth via the launcher link if the long flow tripped
    // the token refresh). No filter is applied before this, so find it by Event Name.
    async function openOurOrderDetails(): Promise<void> {
      if (await cat.getByRole('heading', { name: /Admin Actions/i }).first().isVisible({ timeout: 1500 }).catch(() => false)) return;
      await ensureInK12CateringApp(cat);
      await navigateK12CateringMenu(cat, 'Orders');
      await cat.waitForTimeout(2500);
      const card = cat.locator('article').filter({ hasText: eventName }).first();
      await expect(card).toBeVisible({ timeout: 20000 });
      await card.getByRole('button', { name: /View Details/i }).first().click();
      await cat.getByRole('heading', { name: /Admin Actions/i }).first().waitFor({ state: 'visible', timeout: 15000 }).catch(() => undefined);
      await cat.waitForTimeout(800);
    }

    // Click the first VISIBLE admin button (matched by aria-label, e.g. "Mark this
    // order as paid"; skip the hidden mobile duplicate), then confirm in the popup.
    async function adminAction(name: RegExp, confirmText?: RegExp): Promise<void> {
      let btn: Locator | null = null;
      await expect(async () => {
        const all = cat.getByRole('button', { name });
        const c = await all.count();
        for (let i = 0; i < c; i++) {
          if (await all.nth(i).isVisible().catch(() => false)) { btn = all.nth(i); return; }
        }
        throw new Error(`no visible admin button matching ${name} yet`);
      }).toPass({ timeout: 15000, intervals: [500, 1000, 2000, 3000] });
      await btn!.scrollIntoViewIfNeeded().catch(() => undefined);
      await btn!.click();
      const dialog = cat.getByRole('dialog').first();
      await expect(dialog).toBeVisible({ timeout: 8000 });
      if (confirmText) await expect(dialog).toContainText(confirmText, { timeout: 5000 });
      await dialog.getByRole('button', { name: /^Yes|Confirm|Proceed|mark.*paid|mark.*delivered/i }).last().click();
      await cat.waitForTimeout(2500);
    }

    try {
      // ── 1) Checkout: Event Name required → Review shows it → Place Order ──
      const eventDate = await startOrderToAdditionalDetails(cat);
      const evName = cat.locator('#event-name-input');
      await expect(evName).toBeVisible({ timeout: 10000 });
      await cat.locator('#num-guests-input').fill('2');
      const nextBtn = cat.getByRole('button', { name: 'Next' });
      await expect(nextBtn).toBeDisabled(); // Event Name required
      await evName.fill(eventName);
      await evName.blur().catch(() => undefined);
      await expect(nextBtn).toBeEnabled({ timeout: 6000 });
      await clickNext(cat);
      await selectPaymentAndContinue(cat);
      await expect(cat.getByText(new RegExp(escapeRegExp(eventName), 'i')).first()).toBeVisible({ timeout: 10000 }); // Review shows it
      await reviewAndPlaceOrder(cat);

      // ── 2) Orders list: Payment Status field present; Event Name shown (unfiltered) ──
      await ensureInK12CateringApp(cat);
      await navigateK12CateringMenu(cat, 'Orders');
      await cat.waitForTimeout(2500);
      await expect(cat.getByText(/Payment Status/i).first()).toBeVisible({ timeout: 15000 });
      await expect(cat.getByText(eventName, { exact: false }).first()).toBeVisible({ timeout: 20000 });

      // ── 3) Order Details: Payment Information + Event Name + Payment Pending ──
      await openOurOrderDetails();
      await expect(cat.getByText(/Payment Information/i).first()).toBeVisible({ timeout: 10000 });
      await expect(cat.getByText(eventName, { exact: false }).first()).toBeVisible({ timeout: 10000 });
      await expect(cat.getByText(/Payment Pending/i).first()).toBeVisible({ timeout: 10000 });

      // ── 4) Mark As Delivered doesn't change payment; Mark as Paid → Payment Accepted ──
      const deliver = cat.getByRole('button', { name: /mark.*delivered/i });
      const dCount = await deliver.count();
      let canDeliver = false;
      for (let j = 0; j < dCount; j++) {
        if (await deliver.nth(j).isVisible({ timeout: 500 }).catch(() => false)) { canDeliver = true; break; }
      }
      if (canDeliver) {
        await adminAction(/mark.*delivered/i);
        await openOurOrderDetails();
        await expect(cat.getByText(/Payment Pending/i).first()).toBeVisible({ timeout: 10000 });
      }
      await openOurOrderDetails();
      await adminAction(/mark.*paid/i, /Payment Accepted/i);
      await openOurOrderDetails();
      await expect(cat.getByText(/Payment Accepted/i).first()).toBeVisible({ timeout: 10000 });

      // ── 5) Orders Export (CSV) for the event date contains the Event Name ──
      await ensureInK12CateringApp(cat);
      await navigateK12CateringMenu(cat, 'Orders');
      await cat.waitForTimeout(2000);
      const csv = await exportOrdersCsvText(cat, eventDate);
      expect(csv).toMatch(/Event Name/i);
      expect(csv).toContain(eventName);

      // ── 6) Payment Status FILTER (LAST - leaves the list filtered) ──
      await ensureInK12CateringApp(cat);
      await navigateK12CateringMenu(cat, 'Orders');
      await cat.waitForTimeout(2000);
      const payFilter = cat.getByRole('button').filter({ hasText: /All Payments/i }).first();
      await expect(payFilter).toBeVisible({ timeout: 10000 });
      await payFilter.click();
      await cat.waitForTimeout(700);
      const statusOption = cat
        .getByRole('option', { name: /Pending|Accepted|Paid|Unpaid|Refund|Failed|Declined/i })
        .or(cat.getByRole('menuitem', { name: /Pending|Accepted|Paid|Unpaid|Refund|Failed|Declined/i }))
        .first();
      await expect(statusOption).toBeVisible({ timeout: 8000 });
      await statusOption.click();
      await cat.waitForTimeout(1200);
      await expect(cat.getByRole('button').filter({ hasText: /All Payments/i })).toHaveCount(0, { timeout: 8000 });
    } finally {
      await ctx.close();
    }
  });
});
