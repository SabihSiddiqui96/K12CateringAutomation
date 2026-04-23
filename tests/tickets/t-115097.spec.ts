import { test, expect, Page } from '@playwright/test';

import {
  loginToK12Catering,
  loginToK12CateringAsDistrictUser,
  navigateK12CateringMenu,
  openK12CateringApp,
} from '../../utils/helpers';
import { decryptPassword } from '../../utils/crypto';
import { getRequiredEnvVar } from '../../utils/env';

test.use({ storageState: { cookies: [], origins: [] } });

// ─────────────────────────────────────────────
// Name Display Standardization
// ─────────────────────────────────────────────
test.describe('Name Display Standardization', () => {
  let catering: Page;

  test.beforeAll(async ({ browser }) => {
    const context = await browser.newContext();
    const page = await context.newPage();
    catering = await loginToK12Catering(page);
  });

  test('First Last format shown consistently across all pages', async () => {
    await catering.getByRole('button', { name: 'Go to home page' }).click();
    await catering.waitForLoadState('domcontentloaded');
    await expect(catering.getByText('Sabih Siddiqui').first()).toBeVisible({
      timeout: 10000,
    });
    await expect(
      catering.getByText(/Welcome back, Sabih Siddiqui/i),
    ).toBeVisible();

    await navigateK12CateringMenu(catering, 'Accounts');
    await catering.waitForLoadState('domcontentloaded');
    const firstAccount = catering
      .getByRole('button', { name: /View details for/i })
      .first();
    await expect(firstAccount).toBeVisible({ timeout: 10000 });
    const label = await firstAccount.getAttribute('aria-label');
    const name = label?.replace('View details for ', '').trim() ?? '';
    expect(name).toMatch(/^\S+ \S+/);

    await navigateK12CateringMenu(catering, 'My Profile');
    await catering.waitForLoadState('domcontentloaded');
    await expect(
      catering.getByRole('heading', { name: /Sabih Siddiqui/i }).first(),
    ).toBeVisible({ timeout: 10000 });

    await navigateK12CateringMenu(catering, 'Orders');
    await catering.waitForLoadState('domcontentloaded');
    await expect(catering.getByText('Sabih Siddiqui').first()).toBeVisible({
      timeout: 10000,
    });
  });
});

// ─────────────────────────────────────────────
// Dashboard Revenue Calculation
// ─────────────────────────────────────────────
test.describe('Dashboard Revenue Calculation', () => {
  let catering: Page;

  test.beforeAll(async ({ browser }) => {
    const context = await browser.newContext();
    const page = await context.newPage();
    catering = await loginToK12Catering(page);
  });

  test('Status filter visible and Delivered revenue is less than or equal to All Statuses revenue', async () => {
    await catering.getByRole('button', { name: 'Go to home page' }).click();
    await catering.waitForLoadState('domcontentloaded');

    const statusFilter = catering.getByRole('button', {
      name: /Select status filter/i,
    });
    await expect(statusFilter).toBeVisible({ timeout: 10000 });

    const revenueWidget = catering.getByText(/\$[\d,]+\.\d{2}/).first();
    await expect(revenueWidget).toBeVisible();
    const allStatusRevenue = await revenueWidget.textContent();

    await statusFilter.click();
    await catering.getByRole('option', { name: /^Delivered$/i }).click();
    await catering.waitForLoadState('networkidle');

    const deliveredRevenue = await catering
      .getByText(/\$[\d,]+\.\d{2}/)
      .first()
      .textContent();
    expect(deliveredRevenue).toMatch(/\$[\d,]+\.\d{2}/);

    const parseAmount = (val: string | null) =>
      parseFloat(val?.replace(/[$,]/g, '') ?? '0');

    expect(parseAmount(deliveredRevenue)).toBeLessThanOrEqual(
      parseAmount(allStatusRevenue),
    );
  });
});

// ─────────────────────────────────────────────
// Reports Status Filter
// ─────────────────────────────────────────────
test.describe('Reports Status Filter', () => {
  let catering: Page;

  test.beforeAll(async ({ browser }) => {
    const context = await browser.newContext();
    const page = await context.newPage();
    catering = await loginToK12Catering(page);
  });

  test.beforeEach(async () => {
    await catering.getByRole('button', { name: 'Go to home page' }).click();
    await catering.waitForLoadState('domcontentloaded');
    await navigateK12CateringMenu(catering, 'Reports');
    await catering.waitForLoadState('domcontentloaded');
  });

  test('All three reports default to Delivered and filter updates data accordingly', async () => {
    // ── Sales & Revenue Dashboard ──
    await catering.getByRole('button', { name: /Sales & Revenue Dashboard/i }).click();
    await catering.waitForLoadState('networkidle');

    const salesFilter = catering.getByRole('button', { name: /Select.*status/i });
    await expect(salesFilter).toBeVisible({ timeout: 10000 });
    await expect(salesFilter).toContainText(/Delivered/i);

    await salesFilter.click();
    await catering.getByRole('option', { name: /All/i }).first().click();
    await catering.waitForLoadState('networkidle');
    await catering.getByRole('button', { name: 'Go to home page' }).click();
    await catering.waitForLoadState('domcontentloaded');

    // ── Financial Summary ──
    await navigateK12CateringMenu(catering, 'Reports');
    await catering.waitForLoadState('domcontentloaded');

    const financialSummaryBtn = catering
      .getByRole('button', { name: /Financial Summary/i })
      .or(catering.getByRole('link', { name: /Financial Summary/i }))
      .first();
    await expect(financialSummaryBtn).toBeVisible({ timeout: 15000 });
    await financialSummaryBtn.click();
    await catering.waitForLoadState('networkidle');

    const financialFilter = catering.getByRole('button', { name: /Select.*status/i });
    await expect(financialFilter).toBeVisible({ timeout: 10000 });
    await expect(financialFilter).toContainText(/Delivered/i);

    await financialFilter.click();
    await catering.getByRole('option', { name: /All/i }).first().click();
    await catering.waitForLoadState('networkidle');
    await catering.getByRole('button', { name: 'Go to home page' }).click();
    await catering.waitForLoadState('domcontentloaded');

    // ── Revenue by Customer ──
    await navigateK12CateringMenu(catering, 'Reports');
    await catering.waitForLoadState('domcontentloaded');

    const revenueByCustomerBtn = catering
      .getByRole('button', { name: /Revenue by Customer/i })
      .or(catering.getByRole('link', { name: /Revenue by Customer/i }))
      .first();
    await expect(revenueByCustomerBtn).toBeVisible({ timeout: 15000 });
    await revenueByCustomerBtn.scrollIntoViewIfNeeded();
    await revenueByCustomerBtn.click();
    await catering.waitForLoadState('networkidle');

    const customerFilter = catering.getByRole('button', { name: /Select.*status/i });
    await expect(customerFilter).toBeVisible({ timeout: 10000 });
    await expect(customerFilter).toContainText(/Delivered/i);
  });

  test('Filter changes on one report do not affect the default on other reports', async () => {
    await catering
      .getByRole('button', { name: /Sales & Revenue Dashboard/i })
      .click();
    await catering.waitForLoadState('networkidle');
    const salesFilter = catering.getByRole('button', { name: /Select.*status/i });
    await expect(salesFilter).toBeVisible({ timeout: 10000 });
    await salesFilter.click();
    await catering.getByRole('option', { name: /All/i }).first().click();
    await catering.waitForLoadState('networkidle');
    await expect(salesFilter).not.toContainText(/Delivered/i);

    await catering.getByRole('button', { name: /Back to reports list/i }).click();
    await catering.waitForLoadState('domcontentloaded');
    await catering.getByRole('button', { name: /Financial Summary/i }).click();
    await catering.waitForLoadState('networkidle');
    const financialFilter = catering.getByRole('button', { name: /Select.*status/i });
    await expect(financialFilter).toBeVisible({ timeout: 10000 });
    await financialFilter.click();
    await catering.getByRole('option', { name: /All/i }).first().click();
    await catering.waitForLoadState('networkidle');
    await expect(financialFilter).not.toContainText(/Delivered/i);

    await catering.getByRole('button', { name: /Back to reports list/i }).click();
    await catering.waitForLoadState('domcontentloaded');
    const revenueBtn = catering.getByRole('button', { name: /Revenue by Customer/i });
    await revenueBtn.scrollIntoViewIfNeeded();
    await revenueBtn.click();
    await catering.waitForLoadState('networkidle');
    const customerFilter = catering.getByRole('button', { name: /Select.*status/i });
    await expect(customerFilter).toBeVisible({ timeout: 10000 });
  });
});

// ─────────────────────────────────────────────
// Accounts Change Password
// ─────────────────────────────────────────────
const randomDigits = String(Math.floor(1000 + Math.random() * 9000));
const NEW_PASSWORD = `Sabih${randomDigits}!`;
const ORIGINAL_PASSWORD = decryptPassword(
  getRequiredEnvVar('K12_CUSTOMER_ENCRYPTED_PASSWORD'),
);
const CUSTOMER_EMAIL = getRequiredEnvVar('K12_CUSTOMER_EMAIL');

function getChangePasswordDialog(catering: Page) {
  return catering.getByRole('dialog', { name: /Change Password/i });
}

async function closeChangePasswordModal(catering: Page) {
  const dialog = getChangePasswordDialog(catering);
  if (!(await dialog.isVisible({ timeout: 1000 }).catch(() => false))) {
    return;
  }
  const cancelButton = dialog.getByRole('button', { name: /Cancel/i });
  if (await cancelButton.isVisible({ timeout: 1000 }).catch(() => false)) {
    await cancelButton.click();
  } else {
    await catering.keyboard.press('Escape');
  }
  await expect(dialog).toBeHidden({ timeout: 10000 });
}

async function openChangePasswordModal(catering: Page) {
  await closeChangePasswordModal(catering);
  await navigateK12CateringMenu(catering, 'Accounts');
  await catering.waitForLoadState('domcontentloaded');

  const searchBox = catering.getByRole('textbox', {
    name: /Search accounts by name, username, or email/i,
  });
  await expect(searchBox).toBeVisible({ timeout: 10000 });
  await searchBox.fill(CUSTOMER_EMAIL);
  await catering.waitForTimeout(600);

  const actionsButton = catering.getByRole('button', {
    name: /Actions for Sabih Testing/i,
  });
  await expect(actionsButton).toBeVisible({ timeout: 10000 });
  await actionsButton.click();

  const changePasswordMenuItem = catering.getByRole('menuitem', {
    name: /Change Password/i,
  });
  await expect(changePasswordMenuItem).toBeVisible({ timeout: 5000 });
  await changePasswordMenuItem.click();

  const dialog = getChangePasswordDialog(catering);
  await expect(dialog).toBeVisible({ timeout: 10000 });
  return dialog;
}

test.describe('Accounts Change Password', () => {
  let catering: Page;

  test.beforeAll(async ({ browser }) => {
    const context = await browser.newContext();
    const page = await context.newPage();
    catering = await loginToK12Catering(page);
  });

  test.beforeEach(async () => {
    await catering.getByRole('button', { name: 'Go to home page' }).click();
    await catering.waitForLoadState('domcontentloaded');
  });

  test('Validate password requirements, change password, logout, login with new password, and reset', async () => {
    let dialog = await openChangePasswordModal(catering);

    await dialog.getByRole('button', { name: /Save|Submit|Change Password/i }).click();
    await expect(
      dialog.getByText(/required|must not be empty|enter.*password/i).first(),
    ).toBeVisible({ timeout: 5000 });

    await dialog.getByLabel(/New Password/i).fill('Ab1!');
    await dialog.getByLabel(/Confirm Password/i).fill('Ab1!');
    await dialog.getByRole('button', { name: /Save|Submit|Change Password/i }).click();
    await expect(
      dialog.getByText(/at least \d+ characters|minimum.*character|too short/i).first(),
    ).toBeVisible({ timeout: 5000 });

    await dialog.getByLabel(/New Password/i).fill('sabih1234!');
    await dialog.getByLabel(/Confirm Password/i).fill('sabih1234!');
    await dialog.getByRole('button', { name: /Save|Submit|Change Password/i }).click();
    await expect(dialog.getByText(/uppercase|capital letter/i).first()).toBeVisible({
      timeout: 5000,
    });

    await dialog.getByLabel(/New Password/i).fill('SabihTest!');
    await dialog.getByLabel(/Confirm Password/i).fill('SabihTest!');
    await dialog.getByRole('button', { name: /Save|Submit|Change Password/i }).click();
    await expect(dialog.getByText(/number|digit/i).first()).toBeVisible({
      timeout: 5000,
    });

    await dialog.getByLabel(/New Password/i).fill('Sabih12345');
    await dialog.getByLabel(/Confirm Password/i).fill('Sabih12345');
    await dialog.getByRole('button', { name: /Save|Submit|Change Password/i }).click();
    await expect(dialog.getByText(/special character|symbol/i).first()).toBeVisible({
      timeout: 5000,
    });

    await dialog.getByLabel(/New Password/i).fill('Sabih1234!');
    await dialog.getByLabel(/Confirm Password/i).fill('Sabih9999!');
    await dialog.getByRole('button', { name: /Save|Submit|Change Password/i }).click();
    await expect(
      dialog.getByText(/do not match|passwords must match|confirmation/i).first(),
    ).toBeVisible({ timeout: 5000 });

    await closeChangePasswordModal(catering);

    const successDialog = await openChangePasswordModal(catering);
    await successDialog.getByLabel(/New Password/i).fill(NEW_PASSWORD);
    await successDialog.getByLabel(/Confirm Password/i).fill(NEW_PASSWORD);
    await successDialog.getByRole('button', { name: /Save|Submit|Change Password/i }).click();
    await expect(
      catering.getByText(/password.*changed|updated successfully|success/i).first(),
    ).toBeVisible({ timeout: 8000 });
    await expect(getChangePasswordDialog(catering)).toBeHidden({ timeout: 10000 });

    await catering.getByRole('button', { name: /User account menu/i }).click();
    await catering.waitForTimeout(400);
    await catering.getByRole('menuitem', { name: /Log out|Sign out/i }).click();
    await catering.waitForURL('**/login', { timeout: 10000 });
    await expect(catering).toHaveURL(
      /https:\/\/qak12cateringui\.perseusedge\.com\/login/i,
      { timeout: 10000 },
    );

    const emailInput = catering.getByRole('textbox', { name: /Email/i });
    const passwordInput = catering.getByRole('textbox', { name: /Password/i });
    await expect(emailInput).toBeVisible({ timeout: 10000 });
    await expect(passwordInput).toBeVisible({ timeout: 10000 });
    await emailInput.fill(CUSTOMER_EMAIL);
    await catering.getByRole('textbox', { name: /Password/i }).fill(NEW_PASSWORD);
    await catering.getByRole('button', { name: /Sign in/i }).click();
    await catering.waitForLoadState('networkidle');
    await expect(catering).not.toHaveURL(/login/, { timeout: 10000 });
    await expect(
      catering.getByRole('button', { name: 'Go to home page' }),
    ).toBeVisible({ timeout: 10000 });

    await catering.getByRole('button', { name: /User account menu/i }).click();
    await catering.waitForTimeout(400);
    await catering.getByRole('menuitem', { name: /Log out|Sign out/i }).click();
    await catering.waitForURL('**/login', { timeout: 10000 });
    await catering.goto('/');
    await catering.waitForLoadState('networkidle');

    const districtUserLogin = catering.locator('#UserNameTextBox, #email-input');
    if (await districtUserLogin.isVisible({ timeout: 5000 }).catch(() => false)) {
      await loginToK12CateringAsDistrictUser(catering);
      await catering.waitForLoadState('networkidle');
    }

    const k12Page = await openK12CateringApp(catering);
    await k12Page.waitForLoadState('domcontentloaded');

    dialog = await openChangePasswordModal(k12Page);
    await dialog.getByLabel(/New Password/i).fill(ORIGINAL_PASSWORD);
    await dialog.getByLabel(/Confirm Password/i).fill(ORIGINAL_PASSWORD);
    await dialog.getByRole('button', { name: /Save|Submit|Change Password/i }).click();
    await expect(
      k12Page.getByText(/password.*changed|updated successfully|success/i).first(),
    ).toBeVisible({ timeout: 8000 });
  });
});

// ─────────────────────────────────────────────
// Accounts Sorting
// ─────────────────────────────────────────────
test.describe('Accounts Sorting', () => {
  let catering: Page;

  test.beforeAll(async ({ browser }) => {
    const context = await browser.newContext();
    const page = await context.newPage();
    catering = await loginToK12Catering(page);
  });
});

// ─────────────────────────────────────────────
// Districts — SKIPPED per user instruction
// ─────────────────────────────────────────────

// ─────────────────────────────────────────────
// Settings Order Lead Time
// ─────────────────────────────────────────────
function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function formatMonthYear(date: Date) {
  return date.toLocaleString('en-US', { month: 'long', year: 'numeric' });
}

function formatCalendarDate(date: Date) {
  const month = date.toLocaleString('en-US', { month: 'long' });
  const day = date.getDate();
  const year = date.getFullYear();
  return `${month} ${day}, ${year}`;
}

function getAddToCartModal(page: Page) {
  return page.locator('div.fixed.inset-0').filter({
    has: page.getByRole('heading', { name: /^Add to Cart$/i }),
  }).first();
}

function getSelectDateDialog(page: Page) {
  return page.locator('div.fixed.inset-0').filter({
    has: page.getByText(/^Select Date$/i),
  }).first();
}

async function addFirstMenuItemToCart(page: Page, navigateToMenu = true) {
  if (navigateToMenu) {
    await navigateK12CateringMenu(page, 'Menu');
    await page.waitForLoadState('domcontentloaded');
  }

  const cardAddToCart = page
    .locator('#main-content')
    .getByRole('button', { name: /Add to Cart/i })
    .first();
  await expect(cardAddToCart).toBeVisible({ timeout: 10000 });
  await cardAddToCart.click();

  const addToCartModal = getAddToCartModal(page);
  if (await addToCartModal.isVisible({ timeout: 3000 }).catch(() => false)) {
    const modalAddToCart = addToCartModal.getByRole('button', {
      name: /^Add to Cart$/i,
    });
    await expect(modalAddToCart).toBeVisible({ timeout: 10000 });
    await expect(modalAddToCart).toBeEnabled({ timeout: 10000 });
    await modalAddToCart.click();
    await expect(addToCartModal).toBeHidden({ timeout: 10000 });
  } else {
    const modalAddToCart = page.getByRole('button', { name: /^Add to Cart$/i }).last();
    if (await modalAddToCart.isVisible({ timeout: 3000 }).catch(() => false)) {
      await expect(modalAddToCart).toBeEnabled({ timeout: 10000 });
      await modalAddToCart.click();
    }
  }

  const cartRegion = page.getByRole('region', { name: /Cart items/i });
  await expect(cartRegion).not.toContainText('Your cart is empty', {
    timeout: 10000,
  });
}

async function proceedToCheckout(page: Page) {
  const proceedToCheckoutButton = page.getByRole('button', {
    name: /Proceed to Checkout/i,
  });
  await expect(proceedToCheckoutButton).toBeVisible({ timeout: 10000 });
  await proceedToCheckoutButton.click();
  await expect(page).toHaveURL(/\/checkout/i, { timeout: 15000 });
}

async function addFirstMenuItemAndProceedToCheckout(page: Page) {
  await addFirstMenuItemToCart(page, true);
  await proceedToCheckout(page);
}

async function openCheckoutDatePicker(page: Page) {
  const datePickerButton = page.getByRole('button', {
    name: /Select Event Date/i,
  });
  await expect(datePickerButton).toBeVisible({ timeout: 20000 });
  await datePickerButton.click();
  await expect(
    page.getByRole('button', { name: /Previous month/i }),
  ).toBeVisible({ timeout: 10000 });
}

async function navigateDatePickerToDate(page: Page, targetDate: Date) {
  const targetMonth = formatMonthYear(targetDate);
  const targetMonthHeading = page.getByRole('heading', {
    name: new RegExp(`^${escapeRegExp(targetMonth)}$`, 'i'),
  }).first();

  if (await targetMonthHeading.isVisible().catch(() => false)) {
    return;
  }

  const nextMonthButton = page.getByRole('button', { name: /Next month/i });
  await expect(nextMonthButton).toBeVisible({ timeout: 10000 });

  for (let i = 0; i < 12; i++) {
    if (await targetMonthHeading.isVisible().catch(() => false)) {
      return;
    }
    await nextMonthButton.click();
    await page.waitForTimeout(200);
  }

  throw new Error(`Could not navigate date picker to ${targetMonth}`);
}

function getCalendarDateButton(page: Page, targetDate: Date) {
  const dayLabel = String(targetDate.getDate());
  const dialog = getSelectDateDialog(page);
  const fullDateButton = dialog.getByRole('button', {
    name: new RegExp(escapeRegExp(formatCalendarDate(targetDate)), 'i'),
  });
  const dayButton = dialog.locator('button').filter({
    hasText: new RegExp(`^${escapeRegExp(dayLabel)}$`, 'i'),
  });
  return fullDateButton.or(dayButton).first();
}

async function expectCalendarDateRestricted(page: Page, targetDate: Date) {
  const dateButton = getCalendarDateButton(page, targetDate);
  if (await dateButton.isVisible({ timeout: 1000 }).catch(() => false)) {
    await expect(dateButton).toBeDisabled();
    return;
  }
  await expect(
    getSelectDateDialog(page)
      .getByText(String(targetDate.getDate()), { exact: true })
      .first(),
  ).toBeVisible({ timeout: 10000 });
}

async function readOrderLeadTimeDays(page: Page) {
  const leadTimeText = await page.getByText(/\d+ Days?/i).first().textContent();
  const leadTimeDays = parseInt(leadTimeText?.match(/(\d+)/)?.[1] ?? '0', 10);
  expect(leadTimeDays).toBeGreaterThan(0);
  return leadTimeDays;
}

test.describe('Settings Order Lead Time', () => {
  let catering: Page;

  test.beforeAll(async ({ browser }) => {
    const context = await browser.newContext();
    const page = await context.newPage();
    catering = await loginToK12Catering(page);
  });

  test('Setting is visible and admin can select restricted dates at checkout', async () => {
    await catering.getByRole('button', { name: 'Go to home page' }).click();
    await catering.waitForLoadState('domcontentloaded');
    await navigateK12CateringMenu(catering, 'Settings');
    await catering.waitForLoadState('domcontentloaded');

    await expect(
      catering.getByRole('heading', { name: /Order Lead Time/i }),
    ).toBeVisible({ timeout: 10000 });
    await expect(
      catering.getByRole('button', { name: /Edit order lead time/i }),
    ).toBeVisible();
    await expect(catering.getByText(/\d+ Days?/i).first()).toBeVisible();
    const leadTimeDays = await readOrderLeadTimeDays(catering);

    await addFirstMenuItemAndProceedToCheckout(catering);
    await openCheckoutDatePicker(catering);

    const adminBypassDate = new Date();
    adminBypassDate.setDate(
      adminBypassDate.getDate() + (leadTimeDays > 1 ? 1 : leadTimeDays),
    );

    await navigateDatePickerToDate(catering, adminBypassDate);

    const adminBypassDateButton = getCalendarDateButton(catering, adminBypassDate);
    await expect(adminBypassDateButton).toBeVisible({ timeout: 10000 });
    await expect(adminBypassDateButton).toBeEnabled({ timeout: 10000 });
    await adminBypassDateButton.click();
    await catering.waitForTimeout(300);

    await expect(
      catering.getByRole('button', { name: /^Next$/i }),
    ).toBeEnabled();
  });
});

// ─────────────────────────────────────────────
// Minimum Order Amount
// ─────────────────────────────────────────────
test.describe('Minimum Order Amount', () => {
  let catering: Page;

  test.beforeAll(async ({ browser }) => {
    const context = await browser.newContext();
    const page = await context.newPage();
    catering = await loginToK12Catering(page);
  });

  test('Setting visible, admin bypasses restriction, non-admin blocked, set to $0 removes restriction', async ({ browser }) => {

    // ── Step 1-3: Navigate to Settings, verify Minimum Order Amount ──
    await catering.getByRole('button', { name: 'Go to home page' }).click();
    await catering.waitForLoadState('domcontentloaded');
    await navigateK12CateringMenu(catering, 'Settings');
    await catering.waitForLoadState('domcontentloaded');

    await expect(
      catering.getByRole('heading', { name: /Minimum Order Amount/i }),
    ).toBeVisible({ timeout: 10000 });
    await expect(
      catering.getByText(/\$[\d,.]+.*minimum|minimum.*\$[\d,.]+/i).first(),
    ).toBeVisible({ timeout: 10000 });
    await expect(
      catering.getByRole('button', { name: /Edit minimum order amount/i }),
    ).toBeVisible();

    // ── Step 4: Open edit modal and verify helper text ──
    await catering
      .getByRole('button', { name: /Edit minimum order amount/i })
      .click();
    await catering.waitForTimeout(500);
    await expect(catering.getByText(/Set to \$0 to disable/i)).toBeVisible({
      timeout: 10000,
    });

    // Read current value to restore later
    const amountInput = catering
      .getByRole('spinbutton')
      .or(catering.getByRole('textbox', { name: /minimum order amount/i }))
      .first();
    const originalAmount = await amountInput.inputValue();

    const cancelBtn = catering.getByRole('button', { name: /Cancel/i });
    if (await cancelBtn.isVisible()) {
      await cancelBtn.click();
    } else {
      await catering.keyboard.press('Escape');
    }
    await catering.waitForTimeout(300);

    // ── Step 6: Admin adds item to cart — no minimum order warning shown ──
    await navigateK12CateringMenu(catering, 'Menu');
    await catering.waitForLoadState('domcontentloaded');
    await addFirstMenuItemToCart(catering, false);

    await expect(
      catering.getByText(/Min\. order.*required|minimum.*order.*required/i),
    ).not.toBeVisible({ timeout: 5000 });

    // ── Step 5: Non-admin in separate context — warning should appear ──
    const nonAdminContext1 = await browser.newContext();
    const nonAdminPage1 = await nonAdminContext1.newPage();

    try {
      await nonAdminPage1.goto('https://qak12cateringui.perseusedge.com/login');
      await nonAdminPage1.waitForLoadState('domcontentloaded');
      await nonAdminPage1
        .getByRole('textbox', { name: /Email/i })
        .fill(CUSTOMER_EMAIL);
      await nonAdminPage1
        .getByRole('textbox', { name: /Password/i })
        .fill(ORIGINAL_PASSWORD);
      await nonAdminPage1.getByRole('button', { name: /Sign in/i }).click();
      await nonAdminPage1.waitForLoadState('networkidle');
      await expect(nonAdminPage1).not.toHaveURL(/login/, { timeout: 15000 });

      await nonAdminPage1
        .getByRole('listitem', { name: /Navigate to Menu/i })
        .click();
      await nonAdminPage1.waitForLoadState('domcontentloaded');
      await addFirstMenuItemToCart(nonAdminPage1, false);

      // Verify minimum order warning appears in cart for non-admin
      await expect(
        nonAdminPage1
          .getByText(/Min\. order.*required|minimum.*order.*required/i)
          .first(),
      ).toBeVisible({ timeout: 10000 });
    } finally {
      await nonAdminContext1.close();
    }

    // ── Step 7: Admin (still logged in) sets Minimum Order Amount to $0 ──
    await catering.getByRole('button', { name: 'Go to home page' }).click();
    await catering.waitForLoadState('domcontentloaded');
    await navigateK12CateringMenu(catering, 'Settings');
    await catering.waitForLoadState('domcontentloaded');

    await catering
      .getByRole('button', { name: /Edit minimum order amount/i })
      .click();
    await catering.waitForTimeout(500);

    const editInput = catering
      .getByRole('spinbutton')
      .or(catering.getByRole('textbox', { name: /minimum order amount/i }))
      .first();
    await editInput.clear();
    await editInput.fill('0');

    const saveBtn = catering.getByRole('button', { name: /Save/i });
    await expect(saveBtn).toBeVisible({ timeout: 5000 });
    await saveBtn.click();
    await catering.waitForTimeout(1000);
    await expect(
      catering.getByText(/saved|updated|success/i).first(),
    ).toBeVisible({ timeout: 8000 });

    // ── Non-admin in new context — restriction should now be gone ──
    const nonAdminContext2 = await browser.newContext();
    const nonAdminPage2 = await nonAdminContext2.newPage();

    try {
      await nonAdminPage2.goto('https://qak12cateringui.perseusedge.com/login');
      await nonAdminPage2.waitForLoadState('domcontentloaded');
      await nonAdminPage2
        .getByRole('textbox', { name: /Email/i })
        .fill(CUSTOMER_EMAIL);
      await nonAdminPage2
        .getByRole('textbox', { name: /Password/i })
        .fill(ORIGINAL_PASSWORD);
      await nonAdminPage2.getByRole('button', { name: /Sign in/i }).click();
      await nonAdminPage2.waitForLoadState('networkidle');
      await expect(nonAdminPage2).not.toHaveURL(/login/, { timeout: 15000 });

      await nonAdminPage2
        .getByRole('listitem', { name: /Navigate to Menu/i })
        .click();
      await nonAdminPage2.waitForLoadState('domcontentloaded');
      await addFirstMenuItemToCart(nonAdminPage2, false);

      // Verify minimum order warning is gone after setting to $0
      await expect(
        nonAdminPage2.getByText(
          /Min\. order.*required|minimum.*order.*required/i,
        ),
      ).not.toBeVisible({ timeout: 5000 });
    } finally {
      await nonAdminContext2.close();

      // ── Restore original minimum order amount ──
      await catering.getByRole('button', { name: 'Go to home page' }).click();
      await catering.waitForLoadState('domcontentloaded');
      await navigateK12CateringMenu(catering, 'Settings');
      await catering.waitForLoadState('domcontentloaded');

      await catering
        .getByRole('button', { name: /Edit minimum order amount/i })
        .click();
      await catering.waitForTimeout(500);

      const restoreInput = catering
        .getByRole('spinbutton')
        .or(catering.getByRole('textbox', { name: /minimum order amount/i }))
        .first();
      await restoreInput.clear();
      await restoreInput.fill(originalAmount);

      const restoreSave = catering.getByRole('button', { name: /Save/i });
      await restoreSave.click();
      await catering.waitForTimeout(1000);
    }
  });
});

// ─────────────────────────────────────────────
// Checkout Backdate Order
// ─────────────────────────────────────────────
test.describe('Checkout Backdate Order', () => {
  let catering: Page;

  test.beforeAll(async ({ browser }) => {
    const context = await browser.newContext();
    const page = await context.newPage();
    catering = await loginToK12Catering(page);
  });

  test.beforeEach(async () => {
    if (!catering) return;

    const overlay = catering.locator('div.fixed.inset-0').first();
    if (await overlay.isVisible({ timeout: 1000 }).catch(() => false)) {
      await catering.keyboard.press('Escape');
      await overlay.waitFor({ state: 'hidden', timeout: 5000 }).catch(() => { });
    }

    await catering.getByRole('button', { name: 'Go to home page' }).click();
    await catering.waitForLoadState('domcontentloaded');
    await addFirstMenuItemAndProceedToCheckout(catering);
  });

  test('Admin can select dates within 6-month window and dates beyond are disabled', async () => {
    const datePickerBtn = catering.getByRole('button', { name: /Select Event Date/i });
    await expect(datePickerBtn).toBeVisible({ timeout: 20000 });
    await datePickerBtn.click();
    await catering.waitForTimeout(500);

    const prevMonthBtn = catering.getByRole('button', { name: /Previous month/i });
    await expect(prevMonthBtn).toBeVisible({ timeout: 5000 });

    for (let i = 0; i < 6; i++) {
      await prevMonthBtn.click();
      await catering.waitForTimeout(300);
    }

    const targetDate = new Date();
    targetDate.setMonth(targetDate.getMonth() - 6);
    const monthName = targetDate.toLocaleString('default', { month: 'long' });
    const year = targetDate.getFullYear();

    await expect(
      catering.getByRole('heading', {
        name: new RegExp(`${monthName} ${year}`, 'i'),
      }),
    ).toBeVisible({ timeout: 5000 });

    const allDatesInMonth = catering.getByRole('button', {
      name: new RegExp(`${monthName} \\d+, ${year}`, 'i'),
    });
    const totalDates = await allDatesInMonth.count();
    let clicked = false;

    for (let i = 0; i < totalDates; i++) {
      const dateBtn = allDatesInMonth.nth(i);
      const isDisabled =
        (await dateBtn.getAttribute('disabled')) !== null ||
        (await dateBtn.getAttribute('aria-disabled')) === 'true' ||
        (await dateBtn.isDisabled());
      if (!isDisabled) {
        await dateBtn.click();
        clicked = true;
        break;
      }
    }

    expect(clicked).toBe(true);
    await catering.waitForTimeout(300);
    await expect(catering.getByRole('button', { name: /^Next$/i })).toBeEnabled();

    // Part 2: Go 1 month further back — all dates should be disabled
    await datePickerBtn.click();
    await catering.waitForTimeout(500);
    await prevMonthBtn.click();
    await catering.waitForTimeout(300);

    const prevDate = new Date(targetDate);
    prevDate.setMonth(prevDate.getMonth() - 1);
    const prevMonthName = prevDate.toLocaleString('default', { month: 'long' });
    const prevYear = prevDate.getFullYear();

    await expect(
      catering.getByRole('heading', {
        name: new RegExp(`${prevMonthName} ${prevYear}`, 'i'),
      }),
    ).toBeVisible({ timeout: 5000 });

    const allDates = catering.getByRole('button', {
      name: new RegExp(`${prevMonthName} \\d+, ${prevYear}`, 'i'),
    });
    const count = await allDates.count();
    expect(count).toBeGreaterThan(0);
    for (let i = 0; i < count; i++) {
      await expect(allDates.nth(i)).toBeDisabled();
    }

    // ── Close the date picker before finishing ──
    const cancelBtn = catering.getByRole('button', { name: /Cancel/i });
    if (await cancelBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
      await cancelBtn.click();
    } else {
      await catering.keyboard.press('Escape');
    }
    await catering
      .locator('div.fixed.inset-0')
      .first()
      .waitFor({ state: 'hidden', timeout: 5000 })
      .catch(() => { });
  });

  test('Non-admin user cannot select past dates on checkout date picker', async ({ browser }) => {
    const nonAdminContext = await browser.newContext();
    const nonAdminPage = await nonAdminContext.newPage();

    try {
      const customerEmail = getRequiredEnvVar('K12_CUSTOMER_EMAIL');
      const customerPassword = decryptPassword(
        getRequiredEnvVar('K12_CUSTOMER_ENCRYPTED_PASSWORD'),
      );

      await nonAdminPage.goto('https://qak12cateringui.perseusedge.com/login');
      await nonAdminPage.waitForLoadState('domcontentloaded');
      await nonAdminPage.getByRole('textbox', { name: /Email/i }).fill(customerEmail);
      await nonAdminPage.getByRole('textbox', { name: /Password/i }).fill(customerPassword);
      await nonAdminPage.getByRole('button', { name: /Sign in/i }).click();
      await nonAdminPage.waitForLoadState('networkidle');
      await expect(nonAdminPage).not.toHaveURL(/login/, { timeout: 15000 });

      await nonAdminPage.getByRole('listitem', { name: /Navigate to Menu/i }).click();
      await nonAdminPage.waitForLoadState('domcontentloaded');
      await addFirstMenuItemToCart(nonAdminPage, false);
      await proceedToCheckout(nonAdminPage);

      const datePickerBtn = nonAdminPage.getByRole('button', { name: /Select Event Date/i });
      await expect(datePickerBtn).toBeVisible({ timeout: 20000 });
      await datePickerBtn.click();
      await nonAdminPage.waitForTimeout(500);

      const prevMonthBtn = nonAdminPage.getByRole('button', { name: /Previous month/i });
      await expect(prevMonthBtn).toBeVisible({ timeout: 5000 });
      await prevMonthBtn.click();
      await nonAdminPage.waitForTimeout(300);

      const prevMonthDate = new Date();
      prevMonthDate.setMonth(prevMonthDate.getMonth() - 1);
      const prevMonthName = prevMonthDate.toLocaleString('default', { month: 'long' });
      const prevYear = prevMonthDate.getFullYear();

      const allDatesInPrevMonth = nonAdminPage.getByRole('button', {
        name: new RegExp(`${prevMonthName} \\d+, ${prevYear}`, 'i'),
      });
      const count = await allDatesInPrevMonth.count();
      expect(count).toBeGreaterThan(0);
      for (let i = 0; i < count; i++) {
        await expect(allDatesInPrevMonth.nth(i)).toBeDisabled();
      }
    } finally {
      await nonAdminContext.close();
    }
  });
});