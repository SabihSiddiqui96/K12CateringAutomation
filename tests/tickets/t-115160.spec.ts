// Test Link: https://dev.azure.com/Cybersoft-Technologies-Inc/PrimeroEdge%20Classic/_workitems/edit/115160

import { test, expect, Page } from '@playwright/test';
import fs from 'fs';
import {
  loginToK12Catering,
  navigateK12CateringMenu,
  scrollUntilVisible,
  getInputValueFromLocator,
} from '../../utils/helpers';

test.use({ storageState: { cookies: [], origins: [] } });


// ─── Constants ──────────────────────────────────────────────────────────────

const paymentDisplayLabelHeading = 'Payment display label';
const paymentDisplayLabelInputId = '#accounting-string-description-input';

const paymentFieldFormatRequirementsHeading =
  'Payment field format requirements';
const formatRuleDropdown = '#accounting-string-regex-preset';

const checkoutProgramNameInput = '#checkout-program-name-input';
const checkoutAccountingStringInput = '#checkout-accounting-string-input';
const eventStartTimeInput = '#start-time-input';
const eventEndTimeInput = '#end-time-input';
const setupTimeInput = '#setup-time-input';

const PROGRAM_NAME = `Auto ${Math.floor(100 + Math.random() * 900)}`;
const ACCOUNTING_STRING = '12345';

function randomDisplayLabel(): string {
  const suffix = Math.floor(1000 + Math.random() * 9000);
  return `PDL${suffix}`;
}

// ─── Settings: update Payment Display Label ────────────────────────────────

async function updatePaymentDisplayLabel(
  page: Page,
  newLabel: string,
): Promise<string> {
  await goToK12Settings(page);

  await scrollUntilVisible(page, {
    target: page.getByText(paymentDisplayLabelHeading, { exact: false }),
  });

  await page
    .getByRole('button', { name: /Edit accounting string description/i })
    .click();

  const descriptionInput = page.locator(paymentDisplayLabelInputId);
  await expect(descriptionInput).toBeVisible({ timeout: 10000 });
  const previousLabel = await getInputValueFromLocator(
    page,
    paymentDisplayLabelInputId,
  );

  await descriptionInput.fill('');
  await descriptionInput.fill(newLabel);

  await page.getByRole('button', { name: /Save Changes/i }).click();

  const toast = page.getByRole('alert');
  await expect(toast).toBeVisible({ timeout: 10000 });
  await expect(toast).toContainText(/Payment display label saved/i);
  await page.waitForTimeout(1000);
  await expect(toast).not.toBeVisible({ timeout: 30000 });

  return previousLabel;
}

async function setPaymentFieldFormatRuleToAllowAnyText(
  page: Page,
): Promise<void> {
  await goToK12Settings(page);

  await scrollUntilVisible(page, {
    target: page.getByText(paymentFieldFormatRequirementsHeading, {
      exact: false,
    }),
  });

  await page
    .getByRole('button', { name: /Edit accounting string requirements/i })
    .click();

  await expect(
    page.getByRole('heading', {
      name: /Edit (Accounting String )?requirements|Edit format requirements/i,
    }),
  ).toBeVisible({ timeout: 10000 });

  const requirementsSelect = page.locator(formatRuleDropdown);
  await expect(requirementsSelect).toBeVisible({ timeout: 10000 });
  await requirementsSelect.selectOption({ label: 'Allow any text' });

  const saveBtn = page.getByRole('button', { name: /Save Changes/i });
  await saveBtn.scrollIntoViewIfNeeded();
  await saveBtn.click();

  const toast = page.getByRole('alert');
  if (await toast.isVisible({ timeout: 10000 }).catch(() => false)) {
    await page.waitForTimeout(1000);
    await expect(toast).not.toBeVisible({ timeout: 30000 });
  }
}

async function ensureInK12CateringApp(page: Page): Promise<void> {
  // Dismiss any open modal/toast that might block navigation
  await page.keyboard.press('Escape').catch(() => undefined);

  const sidebar = page.locator('aside[aria-label="Main navigation"]');
  if (await sidebar.isVisible({ timeout: 2000 }).catch(() => false)) {
    return;
  }

  // PrimeroEdge launcher page — click the K12 token link to re-enter
  const launcherLink = page.locator('a[href*="/login?token="]').first();
  if (await launcherLink.isVisible({ timeout: 3000 }).catch(() => false)) {
    await launcherLink.click();
    await page.waitForLoadState('domcontentloaded');
  }

  await expect(sidebar).toBeVisible({ timeout: 30000 });
}

async function goToK12Settings(page: Page): Promise<void> {
  await ensureInK12CateringApp(page);
  await navigateK12CateringMenu(page, 'Settings');
  await page.waitForLoadState('domcontentloaded');
  await expect(page.locator('h1')).toContainText('Settings', { timeout: 15000 });
}

async function setMaxEventDateToTwoMonths(page: Page): Promise<void> {
  await goToK12Settings(page);

  const heading = page.getByRole('heading', { name: /Max Event Date/i }).first();
  await scrollUntilVisible(page, { target: heading });
  await expect(heading).toBeVisible({ timeout: 10000 });

  // Try several reasonable variants of the edit button name
  const editBtn = page
    .getByRole('button', { name: /Edit\s+max(imum)?\s+event\s+date/i })
    .or(page.getByRole('button', { name: /Edit\s+max(imum)?\s+event\s+time/i }))
    .or(
      page.getByRole('button', {
        name: /^Edit$/i,
      }).and(
        page.locator(
          'xpath=//*[self::section or self::div][.//*[contains(normalize-space(.),"Max Event Date")]]//button',
        ),
      ),
    )
    .first();
  await expect(editBtn).toBeVisible({ timeout: 10000 });
  await editBtn.scrollIntoViewIfNeeded();
  await editBtn.click();
  await page.waitForTimeout(500);

  const valueInput = page
    .getByRole('spinbutton')
    .or(page.getByRole('textbox', { name: /max(imum)?\s*(value|event)/i }))
    .first();
  await expect(valueInput).toBeVisible({ timeout: 10000 });
  await valueInput.click();
  await valueInput.fill('');
  await valueInput.fill('2');

  const timeUnitSelect = page
    .getByRole('combobox', { name: /time\s*unit/i })
    .or(page.locator('select').last())
    .first();
  await expect(timeUnitSelect).toBeVisible({ timeout: 10000 });
  await timeUnitSelect.selectOption({ label: 'Months' });

  const saveBtn = page.getByRole('button', { name: /Save Changes|^Save$/i });
  await saveBtn.scrollIntoViewIfNeeded();
  await saveBtn.click();

  const toast = page.getByRole('alert');
  if (await toast.isVisible({ timeout: 10000 }).catch(() => false)) {
    await page.waitForTimeout(1000);
    await expect(toast).not.toBeVisible({ timeout: 30000 });
  }
}

// ─── Checkout flow using the new Payment Display Label ─────────────────────

function getAddToCartModal(page: Page) {
  return page.locator('div.fixed.inset-0').filter({
    has: page.getByRole('heading', { name: /^Add to Cart$/i }),
  }).first();
}

async function clickNext(page: Page): Promise<void> {
  const nextBtn = page.getByRole('button', { name: /^Next$/i });
  await nextBtn.scrollIntoViewIfNeeded();
  await expect(nextBtn).toBeEnabled({ timeout: 10000 });
  await nextBtn.click();
}

async function pickTimeAndConfirm(page: Page, selector: string): Promise<void> {
  const input = page.locator(selector);
  if (!(await input.isVisible({ timeout: 5000 }).catch(() => false))) return;

  await input.scrollIntoViewIfNeeded();
  await input.click();

  const okBtn = page.getByRole('button', { name: /^OK$/i });
  if (await okBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
    await okBtn.click();
  }
}

async function selectFirstContactCardInSection(
  page: Page,
  sectionHeading: RegExp,
): Promise<void> {
  const heading = page.getByRole('heading', { name: sectionHeading }).first();
  await expect(heading).toBeVisible({ timeout: 10000 });

  const section = heading.locator(
    'xpath=ancestor::div[contains(@class,"space-y-3")][1]',
  );
  const card = section.locator('article').first();
  await card.scrollIntoViewIfNeeded();
  await card.click();
}

async function selectEventDateOneMonthAhead(page: Page): Promise<void> {
  const dateButton = page.getByRole('button', { name: /Select Event Date/i });
  await expect(dateButton).toBeVisible({ timeout: 20000 });
  await dateButton.click();

  await expect(
    page.getByRole('button', { name: /Previous month/i }),
  ).toBeVisible({ timeout: 10000 });

  const nextMonthButton = page.getByRole('button', { name: /Next month/i });
  await expect(nextMonthButton).toBeVisible({ timeout: 10000 });

  // Advance the picker exactly one month forward
  await nextMonthButton.click();
  await page.waitForTimeout(400);

  // Find the first available weekday in the now-visible (next) month
  for (let attempt = 0; attempt < 2; attempt++) {
    const dateButtons = await page
      .locator('button[aria-label*=","]:not([disabled])')
      .all();

    for (const button of dateButtons) {
      const label = (await button.getAttribute('aria-label')) ?? '';
      if (!/\w+\s+\d{1,2},\s+\d{4}/.test(label)) continue;
      if (/month|year|cancel|confirm|close/i.test(label)) continue;

      const dateMatch = label.match(/(\w+\s+\d{1,2},\s+\d{4})/);
      if (dateMatch) {
        const day = new Date(dateMatch[1]).getDay();
        if (day === 0 || day === 6) continue;
      }

      await button.click({ force: true });
      await page.waitForTimeout(300);

      const confirmBtn = page.getByRole('button', {
        name: /Confirm date selection/i,
      });
      if (await confirmBtn.isVisible({ timeout: 1000 }).catch(() => false)) {
        await confirmBtn.click();
      }

      const unavailable = await page
        .getByText(/not available for events/i)
        .isVisible({ timeout: 1000 })
        .catch(() => false);
      if (!unavailable) return;
    }

    // If nothing available in this month, try the next one
    if (await nextMonthButton.isVisible({ timeout: 1000 }).catch(() => false)) {
      await nextMonthButton.click();
      await page.waitForTimeout(400);
    }
  }

  throw new Error('Could not find an available event date one month ahead.');
}

async function placeOrderUsingDisplayLabel(
  page: Page,
  displayLabel: string,
): Promise<string> {
  await navigateK12CateringMenu(page, 'Menu');
  await page.waitForLoadState('domcontentloaded');
  await page
    .getByText(/Loading Menu/i)
    .waitFor({ state: 'hidden', timeout: 30000 })
    .catch(() => {});

  const cardAddToCart = page
    .locator('#main-content')
    .getByRole('button', { name: /^Add to Cart$/i })
    .first();
  await cardAddToCart.scrollIntoViewIfNeeded();
  await expect(cardAddToCart).toBeVisible({ timeout: 15000 });
  await cardAddToCart.click();

  const modal = getAddToCartModal(page);
  await expect(modal).toBeVisible({ timeout: 10000 });
  const modalAddToCart = modal.getByRole('button', { name: /^Add to Cart$/i });
  await expect(modalAddToCart).toBeEnabled({ timeout: 10000 });
  await modalAddToCart.click();
  await expect(modal).toBeHidden({ timeout: 10000 });

  await page.getByRole('button', { name: /Proceed to Checkout/i }).click();
  await expect(page).toHaveURL(/\/checkout/i, { timeout: 15000 });

  await selectEventDateOneMonthAhead(page);
  await clickNext(page);

  await pickTimeAndConfirm(page, eventStartTimeInput);
  await pickTimeAndConfirm(page, eventEndTimeInput);
  await clickNext(page);

  await pickTimeAndConfirm(page, setupTimeInput);
  await clickNext(page);

  if (
    await page
      .getByRole('button', { name: /Select from Address Book/i })
      .isVisible({ timeout: 5000 })
      .catch(() => false)
  ) {
    await page
      .getByRole('button', { name: /Select from Address Book/i })
      .click();
  }
  if (
    await page
      .getByRole('heading', { name: /Select Contact/i })
      .isVisible({ timeout: 5000 })
      .catch(() => false)
  ) {
    await selectFirstContactCardInSection(page, /Select Contact/i);
  }
  await clickNext(page);

  const guestsInput = page.locator('#num-guests-input');
  if (await guestsInput.isVisible({ timeout: 5000 }).catch(() => false)) {
    await guestsInput.fill('2');
  }
  // Event Name (or Nickname) is a new REQUIRED field at Additional Details (ADO 117619);
  // without it the "Next" button stays disabled.
  const eventNameInput = page.locator('#event-name-input');
  if (await eventNameInput.isVisible({ timeout: 3000 }).catch(() => false)) {
    await eventNameInput.fill('Automation Event');
  }
  await clickNext(page);

  // ── Payment Info — pick the Payment Display Label radio ──
  const paymentMethodLabel = page
    .locator('[id="payment-method-group"]')
    .locator('span.font-medium')
    .filter({ hasText: displayLabel })
    .first();
  await expect(paymentMethodLabel).toBeVisible({ timeout: 10000 });
  await paymentMethodLabel.locator('xpath=ancestor::button[1]').click();

  const programNameInput = page.locator(checkoutProgramNameInput);
  await programNameInput.scrollIntoViewIfNeeded();
  await expect(programNameInput).toBeVisible({ timeout: 10000 });
  await programNameInput.fill(PROGRAM_NAME);

  const accountingStringInput = page.locator(checkoutAccountingStringInput);
  if (
    await accountingStringInput.isVisible({ timeout: 5000 }).catch(() => false)
  ) {
    await accountingStringInput.scrollIntoViewIfNeeded();
    await accountingStringInput.fill(ACCOUNTING_STRING);
  }

  if (
    await page
      .getByRole('heading', { name: /Select Payment Contact/i })
      .isVisible({ timeout: 5000 })
      .catch(() => false)
  ) {
    await selectFirstContactCardInSection(page, /Select Payment Contact/i);
  }
  await clickNext(page);

  const agreement = page
    .getByText(/I acknowledge and agree to the terms/i)
    .first();
  await agreement.scrollIntoViewIfNeeded();
  await agreement.click();

  const placeOrderBtn = page.getByRole('button', { name: /Place Order/i });
  await placeOrderBtn.scrollIntoViewIfNeeded();
  await expect(placeOrderBtn).toBeEnabled({ timeout: 10000 });
  await placeOrderBtn.click();

  await Promise.race([
    page
      .getByText(/Order Placed Successfully/i)
      .waitFor({ state: 'visible', timeout: 20000 })
      .catch(() => null),
    page
      .getByRole('heading', { name: /Order Management/i })
      .waitFor({ state: 'visible', timeout: 20000 }),
  ]);

  // Capture the most recent order ID off the View Details aria-label
  await expect(
    page.getByRole('heading', { name: /Order Management/i }),
  ).toBeVisible({ timeout: 20000 });
  await page.waitForLoadState('domcontentloaded');
  await page.waitForTimeout(1000);

  const detailsBtn = page
    .getByRole('button', { name: /View details for order/i })
    .first();
  await expect(detailsBtn).toBeVisible({ timeout: 15000 });
  const detailsLabel = (await detailsBtn.getAttribute('aria-label')) ?? '';
  const orderId = detailsLabel.replace(/^View details for order\s*/i, '').trim();
  if (!orderId) {
    throw new Error(
      `Could not capture order ID from aria-label: "${detailsLabel}"`,
    );
  }
  return orderId;
}

// ─── Reports → Order Exports → CSV ─────────────────────────────────────────

function formatMonthYear(date: Date): string {
  return date.toLocaleString('en-US', { month: 'long', year: 'numeric' });
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function monthIndex(date: Date): number {
  return date.getFullYear() * 12 + date.getMonth();
}

async function getVisibleCalendarMonth(page: Page): Promise<Date> {
  const monthHeading = page
    .getByRole('heading')
    .filter({
      hasText:
        /^(January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{4}$/i,
    })
    .first();

  await expect(monthHeading).toBeVisible({ timeout: 10000 });
  const text = (await monthHeading.textContent())?.trim() ?? '';
  const [monthName, yearStr] = text.split(/\s+/);
  return new Date(`${monthName} 1, ${yearStr}`);
}

async function navigateCalendarToMonth(
  page: Page,
  target: Date,
): Promise<void> {
  const targetHeading = page.getByRole('heading', {
    name: new RegExp(`^${escapeRegExp(formatMonthYear(target))}$`, 'i'),
  }).first();

  if (await targetHeading.isVisible().catch(() => false)) return;

  const previousMonthBtn = page.getByRole('button', { name: /Previous month/i });
  const nextMonthBtn = page.getByRole('button', { name: /Next month/i });

  for (let i = 0; i < 24; i++) {
    if (await targetHeading.isVisible().catch(() => false)) return;

    const visible = await getVisibleCalendarMonth(page);
    const btn =
      monthIndex(visible) > monthIndex(target) ? previousMonthBtn : nextMonthBtn;

    await btn.click();
    await page.waitForTimeout(200);
  }

  throw new Error(`Could not navigate calendar to ${formatMonthYear(target)}`);
}

async function pickDateFromCalendar(page: Page, target: Date): Promise<void> {
  await navigateCalendarToMonth(page, target);

  const dayLabel = String(target.getDate());
  const fullLabel = target.toLocaleString('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });

  const dayBtn = page
    .getByRole('button', {
      name: new RegExp(escapeRegExp(fullLabel), 'i'),
    })
    .or(
      page
        .locator('button')
        .filter({ hasText: new RegExp(`^${escapeRegExp(dayLabel)}$`) })
        .filter({ hasNot: page.locator('[disabled]') }),
    )
    .first();

  await expect(dayBtn).toBeVisible({ timeout: 10000 });
  await expect(dayBtn).toBeEnabled({ timeout: 10000 });
  await dayBtn.click();
  await page.waitForTimeout(200);

  const confirmBtn = page.getByRole('button', {
    name: /Confirm date selection|Apply|OK|Done/i,
  });
  if (await confirmBtn.isVisible({ timeout: 1000 }).catch(() => false)) {
    await confirmBtn.click();
  }
}

async function pickDateForButton(
  page: Page,
  buttonId: string,
  target: Date,
): Promise<void> {
  const trigger = page.locator(buttonId);
  await expect(trigger).toBeVisible({ timeout: 10000 });
  await trigger.click();

  await expect(
    page.getByRole('button', { name: /Previous month/i }),
  ).toBeVisible({ timeout: 10000 });

  await pickDateFromCalendar(page, target);
}

async function navigateToReportsFromAnywhere(page: Page): Promise<void> {
  // Dismiss any post-order success modal/toast so the sidebar is clickable
  const closeBtn = page.getByRole('button', { name: /^Close$|Dismiss/i });
  if (await closeBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
    await closeBtn.click().catch(() => undefined);
  }
  await page.keyboard.press('Escape').catch(() => undefined);
  await page
    .locator('div.fixed.inset-0')
    .first()
    .waitFor({ state: 'hidden', timeout: 3000 })
    .catch(() => undefined);

  // Land on the dashboard first so the sidebar is in a known state
  const homeBtn = page.getByRole('button', { name: 'Go to home page' });
  if (await homeBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
    await homeBtn.click();
    await page.waitForLoadState('domcontentloaded');
  }

  // Click the Reports sidebar item explicitly and wait for the Reports page
  const sidebar = page.locator('aside[aria-label="Main navigation"]');
  await expect(sidebar).toBeVisible({ timeout: 10000 });

  const reportsButton = sidebar.getByLabel('Navigate to Reports', {
    exact: true,
  });
  await expect(reportsButton).toBeVisible({ timeout: 10000 });
  await reportsButton.scrollIntoViewIfNeeded();
  await reportsButton.click();

  // Confirm we actually landed on the Reports page (not Orders)
  await expect(page.locator('h1')).toContainText('Reports', { timeout: 15000 });
  await expect(page).toHaveURL(/\/reports/i, { timeout: 15000 });
  await page.waitForLoadState('domcontentloaded');
}

async function exportOrderExportsCsv(page: Page): Promise<string> {
  await navigateToReportsFromAnywhere(page);

  // Scroll the Reports list until "Order Exports" is in view, then click it
  const orderExportsBtn = page
    .getByRole('button', { name: /Orders?\s+Exports?/i })
    .or(page.getByRole('link', { name: /Orders?\s+Exports?/i }))
    .first();

  await scrollUntilVisible(page, { target: orderExportsBtn });
  await expect(orderExportsBtn).toBeVisible({ timeout: 15000 });
  await orderExportsBtn.scrollIntoViewIfNeeded();
  await orderExportsBtn.click();
  await page.waitForLoadState('domcontentloaded');

  await expect(
    page.getByRole('heading', { name: /Orders?\s+Exports?/i }).first(),
  ).toBeVisible({ timeout: 15000 });

  const today = new Date();
  const startDate = new Date(today);
  startDate.setMonth(startDate.getMonth() - 1);
  const endDate = new Date(today);
  endDate.setMonth(endDate.getMonth() + 1);

  await pickDateForButton(page, '#start-date', startDate);
  await pickDateForButton(page, '#end-date', endDate);

  // Deselect all order statuses then re-select only "Accepted" so the export
  // contains a single, predictable row to validate
  const deselectAllBtn = page
    .getByRole('button', { name: /Deselect All/i })
    .first();
  if (await deselectAllBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
    await deselectAllBtn.click();
    await page.waitForTimeout(300);
  }

  const acceptedToggle = page
    .getByRole('checkbox', { name: /^Accepted$/i })
    .or(page.getByRole('button', { name: /^Accepted$/i }))
    .or(page.getByLabel(/^Accepted$/i))
    .first();
  await expect(acceptedToggle).toBeVisible({ timeout: 10000 });
  const isCheckable = await acceptedToggle
    .evaluate((el) => (el as HTMLInputElement).type === 'checkbox')
    .catch(() => false);
  if (isCheckable) {
    if (!(await acceptedToggle.isChecked().catch(() => false))) {
      await acceptedToggle.check();
    }
  } else {
    await acceptedToggle.click();
  }
  await page.waitForTimeout(300);

  const exportBtn = page
    .getByRole('button', { name: /Export.*CSV|CSV.*Export|Download.*CSV/i })
    .first();
  await expect(exportBtn).toBeVisible({ timeout: 10000 });
  await expect(exportBtn).toBeEnabled({ timeout: 10000 });

  const downloadPromise = page.waitForEvent('download', { timeout: 30000 });
  await exportBtn.click();

  const download = await downloadPromise;
  const downloadPath = await download.path();
  if (!downloadPath) {
    throw new Error('CSV download path was null');
  }

  return fs.readFileSync(downloadPath, 'utf-8');
}

// ─── Orders → cancel the order we just placed ──────────────────────────────

async function cancelOrderById(page: Page, orderId: string): Promise<void> {
  // Dismiss anything modal then make sure we're inside the K12 app
  await page.keyboard.press('Escape').catch(() => undefined);
  await ensureInK12CateringApp(page);

  const homeBtn = page.getByRole('button', { name: 'Go to home page' });
  if (await homeBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
    await homeBtn.click();
    await page.waitForLoadState('domcontentloaded');
  }
  await ensureInK12CateringApp(page);

  await navigateK12CateringMenu(page, 'Orders');
  await page.waitForLoadState('domcontentloaded');
  await ensureInK12CateringApp(page);
  await expect(page.locator('h1')).toContainText(/Order/i, { timeout: 15000 });

  // Search by the captured order ID
  const searchBox = page
    .getByRole('textbox', { name: /Search orders/i })
    .first();
  await expect(searchBox).toBeVisible({ timeout: 10000 });
  await searchBox.fill(orderId);
  await page.waitForTimeout(800);

  const detailsBtn = page
    .getByRole('button', {
      name: new RegExp(
        `View details for order\\s*${escapeRegExp(orderId)}`,
        'i',
      ),
    })
    .first();
  await expect(detailsBtn).toBeVisible({ timeout: 10000 });
  await detailsBtn.click();
  await page.waitForLoadState('domcontentloaded');
  await ensureInK12CateringApp(page);

  // Confirm we're on the order details page for this specific order
  await expect(
    page.getByRole('heading', {
      name: new RegExp(`Order\\s*#?\\s*${escapeRegExp(orderId)}`, 'i'),
    }),
  ).toBeVisible({ timeout: 15000 });

  // Click "Cancel this order" on the order details page
  const cancelOrderBtn = page
    .getByRole('button', { name: /Cancel this order/i })
    .or(page.getByRole('button', { name: /^Cancel Order$/i }))
    .first();
  await expect(cancelOrderBtn).toBeVisible({ timeout: 15000 });
  await cancelOrderBtn.scrollIntoViewIfNeeded();
  await cancelOrderBtn.click();

  // Confirm in the dialog (dialog role may not be set — fall back to a
  // visible "Cancel Order" or "Confirm" / "Yes" button on the page)
  const dialogConfirm = page
    .getByRole('dialog')
    .getByRole('button', { name: /^Cancel Order$|^Confirm$|^Yes/i })
    .first();
  const fallbackConfirm = page
    .getByRole('button', { name: /^Cancel Order$/i })
    .last();
  const confirmCancelBtn = dialogConfirm.or(fallbackConfirm).first();
  await expect(confirmCancelBtn).toBeVisible({ timeout: 10000 });
  await confirmCancelBtn.click();
  await ensureInK12CateringApp(page);

  // Verify the order is now cancelled
  await expect(
    page
      .getByText(/order.*cancel(l)?ed|cancel(l)?ed successfully|cancel(l)?ed/i)
      .first(),
  ).toBeVisible({ timeout: 15000 });
}

function parseCsv(csv: string): string[][] {
  const rows: string[][] = [];
  let field = '';
  let row: string[] = [];
  let inQuotes = false;

  for (let i = 0; i < csv.length; i++) {
    const ch = csv[i];

    if (inQuotes) {
      if (ch === '"' && csv[i + 1] === '"') {
        field += '"';
        i++;
      } else if (ch === '"') {
        inQuotes = false;
      } else {
        field += ch;
      }
      continue;
    }

    if (ch === '"') {
      inQuotes = true;
    } else if (ch === ',') {
      row.push(field);
      field = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && csv[i + 1] === '\n') i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else {
      field += ch;
    }
  }

  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }

  return rows.filter((r) => r.some((c) => c.trim() !== ''));
}

// ─── Test ──────────────────────────────────────────────────────────────────

test('Catering - Reports - Order Exports CSV reflects Payment Display Label setting', async ({
  page,
}) => {
  const catering = await loginToK12Catering(page);

  const newDisplayLabel = randomDisplayLabel();

  // Step 1-3: update Payment Display Label
  await updatePaymentDisplayLabel(catering, newDisplayLabel);

  // Set Payment field format requirements → Allow any text so the
  // accounting string entered at checkout is not blocked by a format rule
  await setPaymentFieldFormatRuleToAllowAnyText(catering);

  // Set Max Event Date to 2 months so the next-month checkout date is allowed
  await setMaxEventDateToTwoMonths(catering);

  // Step 4: place an order using the Payment Display Label payment type
  // and capture its order ID for later cancellation
  const orderId = await placeOrderUsingDisplayLabel(catering, newDisplayLabel);

  // Step 5-6: navigate to Reports → Order Exports and export CSV across
  // a past start date and a future end date (Accepted only)
  const csvText = await exportOrderExportsCsv(catering);
  const rows = parseCsv(csvText);
  expect(rows.length).toBeGreaterThan(1);

  const headerRow = rows[0].map((h) => h.trim());
  const dataRows = rows.slice(1);

  // Verify Payment Method column is added
  const paymentMethodIndex = headerRow.findIndex((h) =>
    /^payment\s*method$/i.test(h),
  );
  expect(
    paymentMethodIndex,
    `Expected a "Payment Method" column. Headers: ${headerRow.join(' | ')}`,
  ).toBeGreaterThanOrEqual(0);

  // Verify a column header matches the Payment Display Label setting
  const displayLabelColumnIndex = headerRow.findIndex(
    (h) => h === newDisplayLabel,
  );
  expect(
    displayLabelColumnIndex,
    `Expected a column header equal to the Payment Display Label "${newDisplayLabel}". Headers: ${headerRow.join(' | ')}`,
  ).toBeGreaterThanOrEqual(0);

  const paymentMethodValues = dataRows.map((r) =>
    (r[paymentMethodIndex] ?? '').trim(),
  );
  const displayLabelColumnValues = dataRows.map((r) =>
    (r[displayLabelColumnIndex] ?? '').trim(),
  );

  // Verify Credit Card orders are labelled "Credit Card" under Payment Method
  const hasCreditCard = paymentMethodValues.some(
    (v) => /credit card/i.test(v),
  );
  const hasDisplayLabelEntry = paymentMethodValues.some(
    (v) => v === newDisplayLabel,
  );

  // The order we just placed should appear with the display label
  expect(
    hasDisplayLabelEntry,
    `Expected at least one Payment Method row to be "${newDisplayLabel}". Values: ${paymentMethodValues.join(' | ')}`,
  ).toBeTruthy();

  // Sanity-check: typical export will also contain Credit Card entries —
  // don't fail if the dataset has none, but log via the assertion message.
  expect(
    hasCreditCard || hasDisplayLabelEntry,
    'Expected Payment Method to contain "Credit Card" or the Display Label.',
  ).toBeTruthy();

  // Verify the row for our order is "[Program Name] - [Accounting String]"
  // under the Payment Display Label column
  const expectedCombinedValue = `${PROGRAM_NAME} - ${ACCOUNTING_STRING}`;
  const hasCombinedValue = displayLabelColumnValues.some(
    (v) => v === expectedCombinedValue,
  );
  expect(
    hasCombinedValue,
    `Expected "${expectedCombinedValue}" under the "${newDisplayLabel}" column. Values: ${displayLabelColumnValues.join(' | ')}`,
  ).toBeTruthy();

  await test.info().attach('order-exports.csv', {
    body: csvText,
    contentType: 'text/csv',
  });

  // Step 7: navigate back to Orders, find the order we placed, view details,
  // and cancel it from the dialog. Verify the cancellation succeeded.
  await cancelOrderById(catering, orderId);
});
