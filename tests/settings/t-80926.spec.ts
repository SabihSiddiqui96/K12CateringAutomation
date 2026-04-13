// Test Link: https://dev.azure.com/Cybersoft-Technologies-Inc/PrimeroEdge%20Classic/_workitems/edit/80926

import { test, expect, Page } from '@playwright/test';
import fs from 'fs';
import { PDFParse } from 'pdf-parse';
import {
  loginToK12Catering,
  loginToK12CateringAsDistrictUser,
  navigateK12CateringMenu,
  scrollUntilVisible,
  getTextFromLocator,
  getInputValueFromLocator,
} from '../../utils/helpers';

test.use({ storageState: { cookies: [], origins: [] } });

// ─── Selectors ───────────────────────────────────────────────────────────────

const paymentDisplayLabel = 'Payment display label';
const paymentFieldFormatRequirementsLabel = 'Payment field format requirements';
const editFormatRequirementsDialogTitle =
  /Edit (Accounting String )?requirements|Edit format requirements/i;
const formatRuleDropdown = '#accounting-string-regex-preset';
const formatRuleDescriptionText = '#accounting-string-regex-preset-desc';
const customPatternHintText = '#accounting-string-regex-custom-hint';
const customPatternInput = '#accounting-string-regex-input';
const customPatternError = '#accounting-string-regex-error';
const checkoutAccountingStringInput = '#checkout-accounting-string-input';
const checkoutProgramNameInput = '#checkout-program-name-input';
const accountingStringValidationMessage =
  '#accounting-string-validation-message';
const eventStartTime = '#start-time-input';
const eventEndTime = '#end-time-input';
const setupTimeBtn = '#setup-time-input';

// ─── Button / Label Constants ─────────────────────────────────────────────────

const saveChangesBtn = 'Save Changes';
const nextBtn = 'Next';
const okBtn = 'OK';
const addToCardBtn = 'Add to Cart';
const proceedToCheckoutBtn = 'Proceed to Checkout';
const selectEventDate = 'Select Event Date *';
const placeOrderBtn = 'Place Order';
const standardProgramName = 'Sabih Testing';
const selectPaymentContactCard = 'Sabih Testing';
const orderAgreementCheckbox =
  'I acknowledge and agree to the terms stated in the order disclaimer above. ';
const viewShoppingCartBtn = /View shopping cart/i;
const viewDetailsForOrderBtn = /View Details for order/i;
const downloadInvoiceBtn = /Download Invoice/i;

// ─── Toast Messages ───────────────────────────────────────────────────────────

const updateRequirementsSuccessTitle = 'Format rules saved';
const updateRequirementsSuccessBody = 'Validation rules for';
const updateDescriptionSuccessTitle = 'Payment display label saved';
const updateDescriptionSuccessBody =
  'will be shown wherever this payment type appears for your district.';
const orderPlacedSuccessTitle = 'Order Placed Successfully!';

// ─── Custom Validation Messages ───────────────────────────────────────────────

const exactly9DigitsCustomMessage =
  'Exactly 9 digits custom validation message';
const exactly10DigitsCustomMessage =
  'Exactly 10 digits custom validation message';
const lettersAndNumbersOnlyCustomMessage =
  'Letters and numbers only custom validation message';
const lettersNumbersAndSpacesCustomMessage =
  'Letters, numbers, and spaces custom validation message';
const digitsWithOptionalDashesCustomMessage =
  'Digits with optional dashes custom validation message';
const customPatternCustomMessage = 'Custom pattern validation message';
const customRegexPattern = '^[0-9]{3}-[0-9]{3}$';

// ─── Types ────────────────────────────────────────────────────────────────────

type RuleValidationCase = {
  ruleName: string;
  customMessage: string;
  validValue: string;
  invalidValue?: string;
  customRegex?: string;
};

// ─── Data ─────────────────────────────────────────────────────────────────────

const formatRuleOptionsToVerify = [
  {
    optionName: 'Exactly 9 digits',
    expectedDescription: 'Numbers only, length 9 (e.g. 123456789).',
    expectedStoredPattern: '^[0-9]{9}$',
  },
  {
    optionName: 'Exactly 10 digits',
    expectedDescription: 'Numbers only, length 10 (e.g. 0123456789).',
    expectedStoredPattern: '^[0-9]{10}$',
  },
  {
    optionName: 'Letters and numbers only',
    expectedDescription: 'No spaces or symbols—A–Z, a–z, 0–9 only.',
    expectedStoredPattern: '^[A-Za-z0-9]+$',
  },
  {
    optionName: 'Letters, numbers, and spaces',
    expectedDescription:
      'Letters, digits, and spaces only—no other symbols (e.g. ACCT 12345, Dept 7A).',
    expectedStoredPattern: '^[A-Za-z0-9 ]+$',
  },
  {
    optionName: 'Digits with optional dashes',
    expectedDescription:
      'Digits, optionally grouped with dashes (e.g. 12-345-678 or 12345).',
    expectedStoredPattern: '^[0-9]+(-[0-9]+)*$',
  },
];

const ruleValidationCases: RuleValidationCase[] = [
  {
    ruleName: 'Exactly 9 digits',
    customMessage: exactly9DigitsCustomMessage,
    validValue: '123456789',
    invalidValue: '12345',
  },
  {
    ruleName: 'Exactly 10 digits',
    customMessage: exactly10DigitsCustomMessage,
    validValue: '1234567890',
    invalidValue: '123456789',
  },
  {
    ruleName: 'Letters and numbers only',
    customMessage: lettersAndNumbersOnlyCustomMessage,
    validValue: 'ABC123',
    invalidValue: 'ABC 123',
  },
  {
    ruleName: 'Letters, numbers, and spaces',
    customMessage: lettersNumbersAndSpacesCustomMessage,
    validValue: 'ACCT 12345',
    invalidValue: 'ACCT-123',
  },
  {
    ruleName: 'Digits with optional dashes',
    customMessage: digitsWithOptionalDashesCustomMessage,
    validValue: '12-345-678',
    invalidValue: 'ABC-123',
  },
  {
    ruleName: 'Custom pattern (advanced)',
    customMessage: customPatternCustomMessage,
    validValue: '123-456',
    invalidValue: '123456',
    customRegex: customRegexPattern,
  },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function generateRandomAccountingStringDescription(): string {
  const randomNumber = Math.floor(100000 + Math.random() * 900000);
  return `Sabih Testing ${randomNumber}`;
}

function getSettingsRow(page: Page, settingLabel: string) {
  return page
    .locator(
      `xpath=//*[self::div or self::section or self::tr][.//*[normalize-space(text())="${settingLabel}"]]`,
    )
    .first();
}

async function clickEditButtonForSetting(
  page: Page,
  settingLabel: string,
  editButtonLabel: string,
) {
  const row = getSettingsRow(page, settingLabel);
  await expect(row).toBeVisible();
  await row.getByLabel(editButtonLabel, { exact: true }).click();
}

async function clickNext(page: Page) {
  const nextButton = page.getByRole('button', { name: nextBtn });
  await nextButton.scrollIntoViewIfNeeded();
  await nextButton.click();
}

async function pickTimeAndConfirm(page: Page, inputSelector: string) {
  const input = page.locator(inputSelector);
  await input.scrollIntoViewIfNeeded();
  await input.click();
  await page.getByRole('button', { name: okBtn }).click();
}

async function downloadAndReadPdfText(
  page: Page,
  downloadButtonName: RegExp | string,
): Promise<string> {
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

async function saveAccountingStringRequirementsRule(
  page: Page,
  ruleName: string,
  customerMessage = '',
  customRegex?: string,
) {
  await navigateK12CateringMenu(page, 'Settings');

  await scrollUntilVisible(page, {
    target: page.getByText(paymentFieldFormatRequirementsLabel, {
      exact: false,
    }),
  });

  await clickEditButtonForSetting(
    page,
    paymentFieldFormatRequirementsLabel,
    'Edit accounting string requirements',
  );

  await expect(
    page.getByRole('heading', { name: editFormatRequirementsDialogTitle }),
  ).toBeVisible();

  const requirementsSelect = page.locator(formatRuleDropdown);
  await expect(requirementsSelect).toBeVisible();
  await requirementsSelect.selectOption({ label: ruleName });

  const validationMessageInput = page.locator(
    accountingStringValidationMessage,
  );
  if (await validationMessageInput.isVisible().catch(() => false)) {
    await validationMessageInput.fill('');
    if (customerMessage) await validationMessageInput.fill(customerMessage);
  }

  if (ruleName === 'Custom pattern (advanced)') {
    const regexInput = page.locator(customPatternInput);
    await expect(regexInput).toBeVisible();
    await regexInput.fill('');
    await regexInput.fill(customRegex ?? customRegexPattern);
  }

  const saveBtn = page.getByRole('button', { name: saveChangesBtn });
  await saveBtn.scrollIntoViewIfNeeded();
  await saveBtn.click();

  const toast = page.getByRole('alert');
  await expect(toast).toBeVisible({ timeout: 10000 });
  await expect(toast).toContainText(updateRequirementsSuccessTitle);
  await expect(toast).toContainText(updateRequirementsSuccessBody);
  await page.waitForTimeout(1000);
  await expect(toast).not.toBeVisible({ timeout: 30000 });
}

async function returnToPaymentInformation(
  page: Page,
  accountingStringDescriptionValue: string,
) {
  const cartButton = page.getByLabel(viewShoppingCartBtn);
  await scrollUntilVisible(page, { target: cartButton });
  await expect(cartButton).toBeVisible();
  await cartButton.click();

  await expect(
    page.getByRole('heading', { name: /Payment Information/i }),
  ).toBeVisible();

  const paymentMethodLabel = page
    .locator('[id="payment-method-group"]')
    .locator('span.font-medium')
    .filter({ hasText: accountingStringDescriptionValue })
    .first();

  await expect(paymentMethodLabel).toBeVisible();
  await paymentMethodLabel.locator('xpath=ancestor::button[1]').click();

  const programNameInput = page.locator(checkoutProgramNameInput);
  await programNameInput.scrollIntoViewIfNeeded();
  await expect(programNameInput).toBeVisible();
  await programNameInput.fill(standardProgramName);
}

async function verifyAccountingStringInput(
  page: Page,
  validValue: string,
  invalidValue?: string,
  expectedMessage?: string,
) {
  const programNameInput = page.locator(checkoutProgramNameInput);
  const accountingStringInput = page.locator(checkoutAccountingStringInput);

  await accountingStringInput.scrollIntoViewIfNeeded();
  await expect(accountingStringInput).toBeVisible();

  if (invalidValue) {
    await accountingStringInput.fill(invalidValue);
    await programNameInput.click();
    if (expectedMessage) {
      await expect(
        page.getByText(expectedMessage, { exact: false }).first(),
      ).toBeVisible();
    }
  }

  await accountingStringInput.fill('');
  await programNameInput.click();
  await accountingStringInput.fill(validValue);
  await programNameInput.click();
  await expect(accountingStringInput).toHaveValue(validValue);
}

async function selectAvailableEventDate(page: Page) {
  await page.getByRole('button', { name: selectEventDate }).click();

  const allDateButtons = page.locator(
    'button[aria-label*=", 2026"]:not([disabled])',
  );
  const count = await allDateButtons.count();

  for (let i = 0; i < count; i++) {
    const btn = allDateButtons.nth(i);
    const label = (await btn.getAttribute('aria-label')) ?? '';

    const dateMatch = label.match(/\w+,\s+(\w+\s+\d+,\s+\d+)/);
    if (dateMatch) {
      const day = new Date(dateMatch[1]).getDay();
      if (day === 0 || day === 6) continue; // skip weekends
    }

    await btn.click({ force: true });
    await page.waitForTimeout(300);

    const hasError = await page
      .getByText(/not available for events/i)
      .isVisible()
      .catch(() => false);
    if (!hasError) return;
  }

  throw new Error('Could not find an available event date');
}

// ─── Test ─────────────────────────────────────────────────────────────────────

test('Catering - Settings - Add district customization settings for Payment display label and requirements', async ({
  page,
}) => {
  const catering = await loginToK12Catering(page, { navigateTo: 'Settings' });

  // ── Payment Display Label ──────────────────────────────────────────────────

  await scrollUntilVisible(catering, {
    target: catering.getByText(paymentDisplayLabel, { exact: false }),
  });

  await expect(
    catering.getByText(paymentDisplayLabel, { exact: false }),
  ).toBeVisible();
  await expect(
    catering.getByText(paymentFieldFormatRequirementsLabel, { exact: false }),
  ).toBeVisible();

  const accountingStringDescriptionRow = catering
    .locator('h3', { hasText: paymentDisplayLabel })
    .locator("xpath=ancestor::div[contains(@class, 'flex')][2]");

  const originalDisplayedValue = await getTextFromLocator(
    catering,
    accountingStringDescriptionRow.locator('p').first(),
  );

  await clickEditButtonForSetting(
    catering,
    paymentDisplayLabel,
    'Edit accounting string description',
  );

  const originalInputValue = await getInputValueFromLocator(
    catering,
    '#accounting-string-description-input',
  );
  expect(originalInputValue).toBe(originalDisplayedValue);

  const newAccountingStringDescriptionValue =
    generateRandomAccountingStringDescription();
  const descriptionInput = catering.locator(
    '#accounting-string-description-input',
  );
  await descriptionInput.fill('');
  await descriptionInput.fill(newAccountingStringDescriptionValue);

  expect(
    await getInputValueFromLocator(
      catering,
      '#accounting-string-description-input',
    ),
  ).toBe(newAccountingStringDescriptionValue);

  await catering.getByRole('button', { name: saveChangesBtn }).click();

  const descriptionToast = catering.getByRole('alert');
  await expect(descriptionToast).toBeVisible({ timeout: 10000 });
  await expect(descriptionToast).toContainText(updateDescriptionSuccessTitle);
  await expect(descriptionToast).toContainText(updateDescriptionSuccessBody);
  await catering.waitForTimeout(1000);
  await expect(descriptionToast).not.toBeVisible({ timeout: 30000 });

  const descriptionSection = catering
    .getByLabel('Edit accounting string description')
    .locator(
      "xpath=ancestor::div[.//h3[contains(normalize-space(),'Payment display label')]][1]",
    );

  expect(
    await getTextFromLocator(catering, descriptionSection.locator('p').first()),
  ).toBe(newAccountingStringDescriptionValue);

  // ── Format Requirements ───────────────────────────────────────────────────

  await clickEditButtonForSetting(
    catering,
    paymentFieldFormatRequirementsLabel,
    'Edit accounting string requirements',
  );

  await expect(
    catering.getByRole('heading', {
      name: editFormatRequirementsDialogTitle,
      exact: false,
    }),
  ).toBeVisible();

  const requirementsSelect = catering.locator(formatRuleDropdown);
  await expect(requirementsSelect).toBeVisible();

  // Reset to known state
  await requirementsSelect.selectOption({ label: 'Allow any text' });
  await expect(catering.locator(formatRuleDescriptionText)).toContainText(
    'No format check',
  );

  // Verify all dropdown options exist
  const options = (
    await requirementsSelect.locator('option').allTextContents()
  ).map((o) => o.trim());
  expect(options).toEqual([
    'Allow any text',
    'Exactly 9 digits',
    'Exactly 10 digits',
    'Letters and numbers only',
    'Letters, numbers, and spaces',
    'Digits with optional dashes',
    'Custom pattern (advanced)',
  ]);

  // Verify each option's description and stored pattern
  for (const option of formatRuleOptionsToVerify) {
    await requirementsSelect.selectOption({ label: option.optionName });
    await expect(catering.locator(formatRuleDescriptionText)).toContainText(
      option.expectedDescription,
    );

    if (option.expectedStoredPattern) {
      const storedPatternLabel = catering
        .getByText('Stored pattern', { exact: false })
        .first();
      await expect(storedPatternLabel).toBeVisible();

      await expect
        .poll(
          async () =>
            (
              (await storedPatternLabel.locator('xpath=..').textContent()) ?? ''
            ).trim(),
          {
            timeout: 5000,
            intervals: [250, 500, 1000],
          },
        )
        .toContain(option.expectedStoredPattern);
    }
  }

  // Verify custom pattern option
  await requirementsSelect.selectOption({ label: 'Custom pattern (advanced)' });
  await expect(catering.locator(formatRuleDescriptionText)).toContainText(
    'Enter a valid JavaScript regular expression below (required)',
  );
  await expect(catering.locator(customPatternHintText)).toBeVisible();
  await expect(catering.locator(customPatternInput)).toBeVisible();

  // Verify error shown when saving without regex
  const saveButton = catering.getByRole('button', { name: saveChangesBtn });
  await saveButton.scrollIntoViewIfNeeded();
  await saveButton.click();
  await expect(catering.locator(customPatternError)).toBeVisible();

  // Reset to Allow any text and save
  await requirementsSelect.selectOption({ label: 'Allow any text' });
  await saveButton.scrollIntoViewIfNeeded();
  await saveButton.click();

  const requirementsToast = catering.getByRole('alert');
  await expect(requirementsToast).toBeVisible({ timeout: 10000 });
  await expect(requirementsToast).toContainText(updateRequirementsSuccessTitle);
  await expect(requirementsToast).toContainText(updateRequirementsSuccessBody);
  await catering.waitForTimeout(1000);
  await expect(requirementsToast).not.toBeVisible({ timeout: 30000 });

  // ── Verify Payment Type in Orders ─────────────────────────────────────────

  await navigateK12CateringMenu(catering, 'Orders');

  const paymentTypeInOrders = await getTextFromLocator(
    catering,
    catering
      .locator('article')
      .first()
      .getByText('Payment Type', { exact: true })
      .locator('xpath=following-sibling::p[1]'),
  );
  expect(paymentTypeInOrders).toBe(newAccountingStringDescriptionValue);

  // ── Add to Cart ───────────────────────────────────────────────────────────

  await navigateK12CateringMenu(catering, 'Menu');

  const firstAddToCartButton = catering
    .getByRole('button', { name: addToCardBtn })
    .first();
  await expect(firstAddToCartButton).toBeVisible();
  await firstAddToCartButton.click();

  const addToCartModal = catering
    .getByText('Add to Cart', { exact: true })
    .locator("xpath=ancestor::div[contains(@class,'rounded-lg')][1]");

  await expect(
    addToCartModal.getByRole('button', { name: addToCardBtn }).first(),
  ).toBeVisible();
  await addToCartModal
    .getByRole('button', { name: addToCardBtn })
    .first()
    .click();

  await catering.getByRole('button', { name: proceedToCheckoutBtn }).click();

  // ── Event Date ────────────────────────────────────────────────────────────

  await selectAvailableEventDate(catering);
  await expect(
    catering.getByText(/not available for events/i),
  ).not.toBeVisible();
  await clickNext(catering);

  // ── Event Time ────────────────────────────────────────────────────────────

  await pickTimeAndConfirm(catering, eventStartTime);
  await pickTimeAndConfirm(catering, eventEndTime);
  await clickNext(catering);

  // ── Setup Time ────────────────────────────────────────────────────────────

  await pickTimeAndConfirm(catering, setupTimeBtn);
  await clickNext(catering);

  // ── Delivery Contact ──────────────────────────────────────────────────────

  await catering
    .getByRole('button', { name: /Select from Address Book/i })
    .click();

  const savedAddressBookCard = catering
    .locator('article', { hasText: 'Sabih Testing' })
    .first();
  await scrollUntilVisible(catering, { target: savedAddressBookCard });
  await expect(savedAddressBookCard).toBeVisible();
  await savedAddressBookCard.click();

  await clickNext(catering);

  // ── Additional Details ────────────────────────────────────────────────────

  const numGuestsInput = catering.locator('#num-guests-input');
  await expect(numGuestsInput).toBeVisible();
  await numGuestsInput.fill('2');
  await clickNext(catering);

  // ── Payment Info ──────────────────────────────────────────────────────────

  const paymentMethodLabel = catering
    .locator('[id="payment-method-group"]')
    .locator('span.font-medium')
    .filter({ hasText: newAccountingStringDescriptionValue })
    .first();

  await expect(paymentMethodLabel).toBeVisible();
  expect(await getTextFromLocator(catering, paymentMethodLabel)).toBe(
    newAccountingStringDescriptionValue,
  );
  await paymentMethodLabel.locator('xpath=ancestor::button[1]').click();

  const programNameInput = catering.locator(checkoutProgramNameInput);
  await programNameInput.scrollIntoViewIfNeeded();
  await expect(programNameInput).toBeVisible();
  await programNameInput.fill(standardProgramName);

  // Verify Allow any text accepts any value
  await verifyAccountingStringInput(catering, 'ABC-123@#');

  // Verify each format rule
  for (const ruleCase of ruleValidationCases) {
    await saveAccountingStringRequirementsRule(
      catering,
      ruleCase.ruleName,
      ruleCase.customMessage,
      ruleCase.customRegex,
    );
    await returnToPaymentInformation(
      catering,
      newAccountingStringDescriptionValue,
    );
    await verifyAccountingStringInput(
      catering,
      ruleCase.validValue,
      ruleCase.invalidValue,
      ruleCase.customMessage,
    );
  }

  // ── Payment Contact ───────────────────────────────────────────────────────

  const paymentContactCard = catering
    .locator('article', { hasText: selectPaymentContactCard })
    .first();
  await scrollUntilVisible(catering, { target: paymentContactCard });
  await expect(paymentContactCard).toBeVisible();
  await paymentContactCard.click();
  await clickNext(catering);

  // ── Review & Place Order ──────────────────────────────────────────────────

  const agreementCheckbox = catering
    .getByText(orderAgreementCheckbox, { exact: false })
    .first();
  await agreementCheckbox.scrollIntoViewIfNeeded();
  await expect(agreementCheckbox).toBeVisible();
  await agreementCheckbox.click();

  const placeOrderButton = catering.getByRole('button', {
    name: placeOrderBtn,
  });
  await placeOrderButton.scrollIntoViewIfNeeded();
  await expect(placeOrderButton).toBeVisible();
  await placeOrderButton.click();

  await Promise.race([
    catering
      .getByText(orderPlacedSuccessTitle, { exact: false })
      .waitFor({ state: 'visible', timeout: 10000 })
      .catch(() => null),
    catering
      .getByRole('heading', { name: /Order Management/i })
      .waitFor({ state: 'visible', timeout: 15000 }),
  ]);

  // ── Verify Order in Orders List ───────────────────────────────────────────

  await expect(
    catering.getByRole('heading', { name: /Order Management/i }),
  ).toBeVisible({ timeout: 15000 });
  await catering.waitForLoadState('domcontentloaded');
  await catering.waitForTimeout(2000);

  const latestOrderCard = catering.locator('article').first();
  await expect(latestOrderCard).toBeVisible();

  const latestOrderPaymentType = await getTextFromLocator(
    catering,
    latestOrderCard
      .getByText('Payment Type', { exact: true })
      .locator('xpath=following-sibling::p[1]'),
  );
  expect(latestOrderPaymentType).toBe(newAccountingStringDescriptionValue);

  const viewDetailsButton = latestOrderCard
    .getByRole('button', { name: viewDetailsForOrderBtn })
    .first();
  await expect(viewDetailsButton).toBeVisible();
  await viewDetailsButton.click();

  const invoiceText = await downloadAndReadPdfText(
    catering,
    downloadInvoiceBtn,
  );
  expect(invoiceText).toContain(newAccountingStringDescriptionValue);

  // ── Logout & Login as District User ───────────────────────────────────────

  await catering.getByLabel('User account menu').click();

  const signOutBtn = catering.getByLabel('Sign out of your account');
  await expect(signOutBtn).toBeVisible();
  await signOutBtn.click();

  await expect(catering.locator('#email-input')).toBeVisible();
  await loginToK12CateringAsDistrictUser(catering);

  await catering.waitForLoadState('domcontentloaded');

  await expect(
    catering.locator('aside[aria-label="Main navigation"]'),
  ).toBeVisible();

  // ── Verify District User Cannot Change Accounting String Expression ───────

  await navigateK12CateringMenu(catering, 'Settings');

  await scrollUntilVisible(catering, {
    target: catering.getByText(paymentFieldFormatRequirementsLabel, {
      exact: false,
    }),
  });

  await clickEditButtonForSetting(
    catering,
    paymentFieldFormatRequirementsLabel,
    'Edit accounting string requirements',
  );

  await expect(
    catering.getByRole('heading', {
      name: editFormatRequirementsDialogTitle,
    }),
  ).toBeVisible();

  await expect(
    catering.getByText(
      'Only a Cybersoft Admin can change this expression. To switch to a standard rule, select a format above and save.',
      { exact: false },
    ),
  ).toBeVisible();
});
