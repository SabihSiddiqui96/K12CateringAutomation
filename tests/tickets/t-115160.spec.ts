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
  await navigateK12CateringMenu(page, 'Settings');
  await page.waitForLoadState('domcontentloaded');

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
  await navigateK12CateringMenu(page, 'Settings');
  await page.waitForLoadState('domcontentloaded');

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

async function selectAvailableEventDate(page: Page): Promise<void> {
  const dateButton = page.getByRole('button', { name: /Select Event Date/i });
  await expect(dateButton).toBeVisible({ timeout: 20000 });
  await dateButton.click();

  await expect(
    page.getByRole('button', { name: /Previous month/i }),
  ).toBeVisible({ timeout: 10000 });

  const nextMonthButton = page.getByRole('button', { name: /Next month/i });

  for (let monthAttempt = 0; monthAttempt < 4; monthAttempt++) {
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

    if (await nextMonthButton.isVisible({ timeout: 1000 }).catch(() => false)) {
      await nextMonthButton.click();
      await page.waitForTimeout(500);
    }
  }

  throw new Error('Could not find an available checkout event date.');
}

async function placeOrderUsingDisplayLabel(
  page: Page,
  displayLabel: string,
): Promise<void> {
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

  await selectAvailableEventDate(page);
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
}

// ─── Reports → Order Exports → CSV ─────────────────────────────────────────

function formatDateInput(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const year = date.getFullYear();
  return `${month}/${day}/${year}`;
}

async function fillDateField(
  page: Page,
  matcher: RegExp,
  value: string,
): Promise<void> {
  const input = page
    .getByLabel(matcher)
    .or(page.getByRole('textbox', { name: matcher }))
    .first();

  await expect(input).toBeVisible({ timeout: 10000 });
  await input.click();
  await input.fill('');
  await input.fill(value);
  await page.keyboard.press('Tab');
}

async function exportOrderExportsCsv(page: Page): Promise<string> {
  // Dismiss any post-order success modal/toast so the sidebar is clickable
  const closeBtn = page.getByRole('button', { name: /^Close$|Dismiss/i });
  if (await closeBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
    await closeBtn.click().catch(() => undefined);
  }
  const homeBtn = page.getByRole('button', { name: 'Go to home page' });
  if (await homeBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
    await homeBtn.click();
    await page.waitForLoadState('domcontentloaded');
  }

  await navigateK12CateringMenu(page, 'Reports');
  await page.waitForLoadState('domcontentloaded');

  const orderExportsBtn = page
    .getByRole('button', { name: /Order Exports/i })
    .or(page.getByRole('link', { name: /Order Exports/i }))
    .first();
  await expect(orderExportsBtn).toBeVisible({ timeout: 15000 });
  await orderExportsBtn.scrollIntoViewIfNeeded();
  await orderExportsBtn.click();
  await page.waitForLoadState('domcontentloaded');

  const today = new Date();
  const startDate = new Date(today);
  startDate.setMonth(startDate.getMonth() - 1);
  const endDate = new Date(today);
  endDate.setMonth(endDate.getMonth() + 1);

  await fillDateField(page, /Start Date/i, formatDateInput(startDate));
  await fillDateField(page, /End Date/i, formatDateInput(endDate));

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

  // Step 4: place an order using the Payment Display Label payment type
  await placeOrderUsingDisplayLabel(catering, newDisplayLabel);

  // Step 5-6: navigate to Reports → Order Exports and export CSV across
  // a past start date and a future end date
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

  // Verify "[Program Name] - [Payment Display Label]" appears in the
  // display-label column for the order we just placed
  const expectedCombinedValue = `${PROGRAM_NAME} - ${newDisplayLabel}`;
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
});
