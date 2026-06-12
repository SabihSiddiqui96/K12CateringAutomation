/**
 * Reusable K12 Catering order / checkout helpers, extracted from the proven
 * place-order flow in tests/tickets/t-80926.spec.ts (add to cart -> checkout ->
 * event date/times -> contacts -> additional details -> payment -> review ->
 * place order). Locators are kept identical to that test.
 */
import { expect, Page } from '@playwright/test';
import { navigateK12CateringMenu } from './helpers';

export const ORDER = {
  nextBtn: 'Next',
  okBtn: 'OK',
  addToCartBtn: 'Add to Cart',
  proceedToCheckoutBtn: 'Proceed to Checkout',
  selectEventDate: 'Select Event Date *',
  placeOrderBtn: 'Place Order',
  eventStartTime: '#start-time-input',
  eventEndTime: '#end-time-input',
  setupTimeInput: '#setup-time-input',
  numGuestsInput: '#num-guests-input',
  programNameInput: '#checkout-program-name-input',
};

export async function clickNext(page: Page): Promise<void> {
  const nextButton = page.getByRole('button', { name: ORDER.nextBtn });
  await nextButton.scrollIntoViewIfNeeded();
  await nextButton.click();
}

export async function pickTimeAndConfirm(page: Page, inputSelector: string): Promise<void> {
  const input = page.locator(inputSelector);
  await input.scrollIntoViewIfNeeded();
  await input.click();
  await page.getByRole('button', { name: ORDER.okBtn }).click();
}

export async function selectFirstContactCardInSection(page: Page, sectionHeading: RegExp | string): Promise<void> {
  const heading = page.getByRole('heading', { name: sectionHeading }).first();
  await expect(heading).toBeVisible({ timeout: 10000 });
  const section = heading.locator('xpath=ancestor::div[contains(@class,"space-y-3")][1]');
  const contactCard = section.locator('article').first();
  await contactCard.scrollIntoViewIfNeeded();
  await expect(contactCard).toBeVisible({ timeout: 10000 });
  await contactCard.click();
}

/** Picks an available (future, weekday) event date and returns it as e.g. "June 13, 2026".
 *  Iterates from the LAST available date so we get a clearly-future date, not today. */
export async function selectAvailableEventDate(page: Page): Promise<string> {
  await page.getByRole('button', { name: ORDER.selectEventDate }).click();
  const allDateButtons = page.locator('button[aria-label*=", 2026"]:not([disabled])');
  const count = await allDateButtons.count();
  for (let i = count - 1; i >= 0; i--) {
    const btn = allDateButtons.nth(i);
    const label = (await btn.getAttribute('aria-label')) ?? '';
    const dateMatch = label.match(/\w+,\s+(\w+\s+\d+,\s+\d+)/);
    if (dateMatch) {
      const day = new Date(dateMatch[1]).getDay();
      if (day === 0 || day === 6) continue; // skip weekends
    }
    await btn.click({ force: true });
    await page.waitForTimeout(300);
    const hasError = await page.getByText(/not available for events/i).isVisible().catch(() => false);
    if (!hasError) return dateMatch ? dateMatch[1] : '';
  }
  throw new Error('Could not find an available event date');
}

export async function downloadAndReadPdfText(page: Page, downloadButtonName: RegExp | string): Promise<string> {
  const fs = await import('fs');
  const { PDFParse } = await import('pdf-parse');
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: downloadButtonName }).click();
  const download = await downloadPromise;
  const downloadPath = await download.path();
  if (!downloadPath) throw new Error('Download path is null');
  const pdfBuffer = fs.readFileSync(downloadPath);
  const parser = new PDFParse({ data: pdfBuffer });
  const pdfData = await parser.getText();
  await parser.destroy();
  return pdfData.text;
}

/**
 * Add the first menu item to the cart and drive the checkout wizard up to the
 * "Additional Details" step (event date/times/setup/delivery contact done).
 * Leaves the page on Additional Details, where the Event Name field lives.
 */
export async function startOrderToAdditionalDetails(page: Page): Promise<string> {
  await navigateK12CateringMenu(page, 'Menu');
  await page.waitForLoadState('domcontentloaded');

  const firstAddToCart = page.getByRole('button', { name: ORDER.addToCartBtn }).first();
  await expect(firstAddToCart).toBeVisible({ timeout: 15000 });
  await firstAddToCart.click();

  const addToCartModal = page
    .getByText('Add to Cart', { exact: true })
    .locator("xpath=ancestor::div[contains(@class,'rounded-lg')][1]");
  await expect(addToCartModal.getByRole('button', { name: ORDER.addToCartBtn }).first()).toBeVisible();
  await addToCartModal.getByRole('button', { name: ORDER.addToCartBtn }).first().click();

  await page.getByRole('button', { name: ORDER.proceedToCheckoutBtn }).click();

  // Event Date (future weekday) - capture it for later (e.g. the Orders export range).
  const eventDate = await selectAvailableEventDate(page);
  await expect(page.getByText(/not available for events/i)).not.toBeVisible();
  await clickNext(page);

  // Event Time + Setup Time
  await pickTimeAndConfirm(page, ORDER.eventStartTime);
  await pickTimeAndConfirm(page, ORDER.eventEndTime);
  await clickNext(page);
  await pickTimeAndConfirm(page, ORDER.setupTimeInput);
  await clickNext(page);

  // Delivery Contact
  await page.getByRole('button', { name: /Select from Address Book/i }).click();
  await selectFirstContactCardInSection(page, /Select Contact/i);
  await clickNext(page);

  // Now on the Additional Details step.
  await expect(page.locator(ORDER.numGuestsInput)).toBeVisible({ timeout: 15000 });
  return eventDate;
}

/**
 * On the Payment Information step: pick the first payment type, fill the program
 * name / accounting string if they appear (they are only required for some payment
 * types), skip the optional payment contact, and continue to Review.
 */
export async function selectPaymentAndContinue(page: Page): Promise<void> {
  await expect(page.getByRole('heading', { name: /Payment Information/i }).first()).toBeVisible({ timeout: 15000 });
  const firstType = page.locator('#payment-method-group button').first();
  await firstType.scrollIntoViewIfNeeded();
  await firstType.click();
  await page.waitForTimeout(800);

  const program = page.locator(ORDER.programNameInput);
  if (await program.isVisible({ timeout: 3000 }).catch(() => false)) {
    await program.fill('Automation Program');
    await program.blur().catch(() => undefined);
  }
  const acct = page.locator('#checkout-accounting-string-input');
  if (await acct.isVisible({ timeout: 2000 }).catch(() => false)) {
    await acct.fill('AUTO-123');
    await acct.blur().catch(() => undefined);
  }
  await page.waitForTimeout(500);
  // Next enables once the payment requirements are satisfied.
  await expect(page.getByRole('button', { name: ORDER.nextBtn })).toBeEnabled({ timeout: 8000 });
  await clickNext(page);
}

/**
 * Full place-order flow with a given Event Name: drive the wizard, fill guests +
 * Event Name, pick payment, accept and place. Leaves the page on Order Management.
 */
export async function placeOrderWithEventName(page: Page, eventName: string): Promise<string> {
  const eventDate = await startOrderToAdditionalDetails(page);
  await page.locator(ORDER.numGuestsInput).fill('2');
  const evName = page.locator('#event-name-input');
  await evName.fill(eventName);
  await evName.blur().catch(() => undefined);
  await expect(page.getByRole('button', { name: ORDER.nextBtn })).toBeEnabled({ timeout: 6000 });
  await clickNext(page);
  await selectPaymentAndContinue(page);
  await reviewAndPlaceOrder(page);
  return eventDate;
}

/**
 * Open the Orders "Export Orders" dialog, set the Start + End date to `dateStr`
 * (e.g. "June 13, 2026"), download the CSV, and return its text. The date pickers
 * use the same calendar component as the event date (aria-label contains the date).
 */
export async function exportOrdersCsvText(page: Page, dateStr: string): Promise<string> {
  await page.getByRole('button', { name: /Export Orders/i }).first().click();
  await expect(page.getByRole('heading', { name: /Export Orders/i })).toBeVisible({ timeout: 10000 });

  async function pickInCalendar(): Promise<void> {
    const target = page.locator(`button[aria-label*="${dateStr}"]:not([disabled])`).first();
    for (let i = 0; i < 18; i++) {
      if (await target.isVisible({ timeout: 800 }).catch(() => false)) {
        await target.click({ force: true });
        await page.waitForTimeout(300);
        return;
      }
      const next = page.getByRole('button', { name: /next month|go to next month|^next$/i }).first();
      if (!(await next.isVisible({ timeout: 500 }).catch(() => false))) break;
      await next.click();
      await page.waitForTimeout(300);
    }
    throw new Error(`Could not pick date "${dateStr}" in the export calendar`);
  }

  // Filter by Event Date (the date we set) instead of the default Delivery Date,
  // if that option exists.
  const filterTrigger = page.getByText(/Filter By/i).first().locator('xpath=following::button[1]');
  if (await filterTrigger.isVisible({ timeout: 3000 }).catch(() => false)) {
    await filterTrigger.click().catch(() => undefined);
    await page.waitForTimeout(300);
    await page
      .getByRole('option', { name: /Event Date/i })
      .or(page.getByText(/^Event Date$/i))
      .first()
      .click({ timeout: 2000 })
      .catch(() => undefined);
    await page.waitForTimeout(300);
  }

  // Set BOTH Start Date and End Date to dateStr, each targeted via its own label
  // (the trigger button right after the "Start Date" / "End Date" text).
  for (const labelRe of [/Start Date/i, /End Date/i]) {
    const trigger = page.getByText(labelRe).first().locator('xpath=following::button[1]');
    await trigger.scrollIntoViewIfNeeded().catch(() => undefined);
    await trigger.click();
    await page.waitForTimeout(400);
    await pickInCalendar();
    await page.waitForTimeout(400);
  }

  await page.getByRole('button', { name: /^CSV$/i }).first().click().catch(() => undefined);
  const downloadPromise = page.waitForEvent('download', { timeout: 30000 });
  await page.getByRole('button', { name: /Export CSV/i }).click();
  const download = await downloadPromise;
  const p = await download.path();
  if (!p) return '';
  const fs = await import('fs');
  return fs.readFileSync(p, 'utf8');
}

/** On the Review step: accept the agreement and click Place Order; wait for success. */
export async function reviewAndPlaceOrder(page: Page): Promise<void> {
  const agreement = page
    .getByText(/I acknowledge and agree to the terms/i)
    .first();
  await agreement.scrollIntoViewIfNeeded();
  await agreement.click();

  const placeBtn = page.getByRole('button', { name: ORDER.placeOrderBtn });
  await placeBtn.scrollIntoViewIfNeeded();
  await expect(placeBtn).toBeVisible();
  await placeBtn.click();

  await Promise.race([
    page.getByText(/Order Placed Successfully/i).waitFor({ state: 'visible', timeout: 15000 }).catch(() => null),
    page.getByRole('heading', { name: /Order Management/i }).waitFor({ state: 'visible', timeout: 20000 }),
  ]);
}
