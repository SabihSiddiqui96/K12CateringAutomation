// Test Link: https://dev.azure.com/Cybersoft-Technologies-Inc/PrimeroEdge%20Classic/_workitems/edit/80926

import { test, expect, Page } from "@playwright/test";
import fs from "fs";
import { PDFParse } from "pdf-parse";
import {
  loginToK12Catering,
  navigateK12CateringMenu,
  scrollUntilVisible,
  getTextFromLocator,
  getInputValueFromLocator,
} from "../../utils/helpers";

test.use({ storageState: { cookies: [], origins: [] } });

const accountingStringDescriptionLabel = "Accounting String description";
const accountingStringRequirementsLabel = "Accounting String requirements";
const accountingStringRequirementsDialogTitle =
  "Edit Accounting String requirements";
const formatRuleDropdown =
  "#accounting-string-regex-preset";
const formatRuleDescriptionText = "#accounting-string-regex-preset-desc";
const customPatternHintText = "#accounting-string-regex-custom-hint";
const customPatternInput = "#accounting-string-regex-input";
const saveChangesBtn = "Save Changes";
const nextBtn = "Next";
const okBtn = "OK";
const addToCardBtn = "Add to Cart";
const proceedToCheckoutBtn = "Proceed to Checkout";
const selectEventDate = "Select Event Date *";
const eventStartTime = "#start-time-input";
const eventEndTime = "#end-time-input";
const setupTimeBtn = "#setup-time-input";
const updateRequirementsSuccessTitle =
  "Accounting String requirements updated";
const updateRequirementsSuccessBody =
  "Validation pattern has been saved successfully.";
const updateDescriptionSuccessTitle =
  "Accounting String description updated";
const updateDescriptionSuccessBody =
  "The payment method label has been saved for this district.";
const checkoutAccountingStringInput = "#checkout-accounting-string-input";
const checkoutProgramNameInput = "#checkout-program-name-input";
const accountingStringValidationMessage = "#accounting-string-validation-message";
const customPatternError = "#accounting-string-regex-error";
const viewShoppingCartBtn = /View shopping cart/i;
const standardProgramName = "Sabih Testing";
const customRegexPattern = "^[0-9]{3}-[0-9]{3}$";
const exactly9DigitsCustomMessage = "Exactly 9 digits custom validation message";
const exactly10DigitsCustomMessage = "Exactly 10 digits custom validation message";
const lettersAndNumbersOnlyCustomMessage =
  "Letters and numbers only custom validation message";
const lettersNumbersAndSpacesCustomMessage =
  "Letters, numbers, and spaces custom validation message";
const digitsWithOptionalDashesCustomMessage =
  "Digits with optional dashes custom validation message";
const customPatternCustomMessage = "Custom pattern validation message";
const selectPaymentContactCard = "Sabih Testing";
const placeOrderBtn = "Place Order";
const orderPlacedSuccessTitle = "Order Placed Successfully!";
const orderPlacedSuccessBody = "has been submitted. You will receive a confirmation email shortly.";
const viewDetailsForOrderBtn = /View Details for order/i;
const downloadInvoiceBtn = /Download Invoice/i;
const orderAgreementCheckbox = 'I acknowledge and agree to the terms stated in the order disclaimer above. ';

type RuleValidationCase = {
  ruleName: string;
  customMessage: string;
  validValue: string;
  invalidValue?: string;
  customRegex?: string;
};

const formatRuleOptionsToVerify = [
  {
    optionName: "Exactly 9 digits",
    expectedDescription: "Numbers only, length 9 (e.g. 123456789).",
    expectedStoredPattern: "^[0-9]{9}$",
  },
  {
    optionName: "Exactly 10 digits",
    expectedDescription: "Numbers only, length 10 (e.g. 0123456789).",
    expectedStoredPattern: "^[0-9]{10}$",
  },
  {
    optionName: "Letters and numbers only",
    expectedDescription: "No spaces or symbols—A–Z, a–z, 0–9 only.",
    expectedStoredPattern: "^[A-Za-z0-9]+$",
  },
  {
    optionName: "Letters, numbers, and spaces",
    expectedDescription:
      "Letters, digits, and spaces only—no other symbols (e.g. ACCT 12345, Dept 7A).",
    expectedStoredPattern: "^[A-Za-z0-9 ]+$",
  },
  {
    optionName: "Digits with optional dashes",
    expectedDescription:
      "Digits, optionally grouped with dashes (e.g. 12-345-678 or 12345).",
    expectedStoredPattern: "^[0-9]+(-[0-9]+)*$",
  },
];

const ruleValidationCases: RuleValidationCase[] = [
  {
    ruleName: "Exactly 9 digits",
    customMessage: exactly9DigitsCustomMessage,
    validValue: "123456789",
    invalidValue: "12345",
  },
  {
    ruleName: "Exactly 10 digits",
    customMessage: exactly10DigitsCustomMessage,
    validValue: "1234567890",
    invalidValue: "123456789",
  },
  {
    ruleName: "Letters and numbers only",
    customMessage: lettersAndNumbersOnlyCustomMessage,
    validValue: "ABC123",
    invalidValue: "ABC 123",
  },
  {
    ruleName: "Letters, numbers, and spaces",
    customMessage: lettersNumbersAndSpacesCustomMessage,
    validValue: "ACCT 12345",
    invalidValue: "ACCT-123",
  },
  {
    ruleName: "Digits with optional dashes",
    customMessage: digitsWithOptionalDashesCustomMessage,
    validValue: "12-345-678",
    invalidValue: "ABC-123",
  },
  {
    ruleName: "Custom pattern (advanced)",
    customMessage: customPatternCustomMessage,
    validValue: "123-456",
    invalidValue: "123456",
    customRegex: customRegexPattern,
  },
];


function generateRandomAccountingStringDescription(): string {
  const randomNumber = Math.floor(100000 + Math.random() * 900000);
  return `Sabih Testing ${randomNumber}`;
}

function getSettingsRow(page: Page, settingLabel: string) {
  return page
    .locator(
      `xpath=//*[self::div or self::section or self::tr][.//*[normalize-space(text())="${settingLabel}"]]`
    )
    .first();
}

async function downloadAndReadPdfText(
  page: Page,
  downloadButtonName: RegExp | string
): Promise<string> {
  const downloadPromise = page.waitForEvent("download");

  await page.getByRole("button", { name: downloadButtonName }).click();

  const download = await downloadPromise;
  const downloadPath = await download.path();

  if (!downloadPath) {
    throw new Error("Download path is null");
  }

  const pdfBuffer = fs.readFileSync(downloadPath);
  const parser = new PDFParse({ data: pdfBuffer });
  const pdfData = await parser.getText();
  await parser.destroy();

  return pdfData.text;
}

async function clickEditButtonForSetting(
  page: Page,
  settingLabel: string,
  editButtonLabel: string
) {
  const row = getSettingsRow(page, settingLabel);
  await expect(row).toBeVisible();

  await row.getByLabel(editButtonLabel, { exact: true }).click();
}

async function saveAccountingStringRequirementsRule(
  page: Page,
  ruleName: string,
  customerMessage = "",
  customRegex?: string
) {
  await navigateK12CateringMenu(page, "Settings");

  await scrollUntilVisible(page, {
    target: page.getByText(accountingStringRequirementsLabel, { exact: true }),
  });

  await clickEditButtonForSetting(
    page,
    "Accounting String requirements",
    "Edit accounting string requirements"
  );

  await expect(
    page.getByRole("heading", {
      name: accountingStringRequirementsDialogTitle,
      exact: true,
    })
  ).toBeVisible();

  const requirementsSelect = page.locator(formatRuleDropdown);
  await expect(requirementsSelect).toBeVisible();
  await requirementsSelect.selectOption({ label: ruleName });

  const validationMessageInput = page.locator(accountingStringValidationMessage);

  if (await validationMessageInput.isVisible().catch(() => false)) {
    await validationMessageInput.fill("");
    if (customerMessage) {
      await validationMessageInput.fill(customerMessage);
    }
  }

  if (ruleName === "Custom pattern (advanced)") {
    const regexInput = page.locator(customPatternInput);
    await expect(regexInput).toBeVisible();
    await regexInput.fill("");
    await regexInput.fill(customRegex ?? customRegexPattern);
  }

  const saveBtn = page.getByRole("button", { name: saveChangesBtn });
  await saveBtn.scrollIntoViewIfNeeded();
  await saveBtn.click();

  const requirementsSuccessToast = page.getByRole("alert");

  await expect(requirementsSuccessToast).toBeVisible({ timeout: 10000 });
  await expect(requirementsSuccessToast).toContainText(
    updateRequirementsSuccessTitle
  );
  await expect(requirementsSuccessToast).toContainText(
    updateRequirementsSuccessBody
  );
  await expect(requirementsSuccessToast).not.toBeVisible({ timeout: 10000 });
}

async function returnToPaymentInformation(
  page: Page,
  accountingStringDescriptionValue: string
) {
  const cartButton = page.getByLabel(viewShoppingCartBtn);

  await scrollUntilVisible(page, {
    target: cartButton,
  });

  await expect(cartButton).toBeVisible();
  await cartButton.click();

  await expect(
    page.getByRole("heading", { name: /Payment Information/i })
  ).toBeVisible();

  const paymentMethodGroup = page.locator('[id="payment-method-group"]');

  const paymentMethodLabel = paymentMethodGroup
    .locator("span.font-medium")
    .filter({ hasText: accountingStringDescriptionValue })
    .first();

  await expect(paymentMethodLabel).toBeVisible();
  await paymentMethodLabel.locator("xpath=ancestor::button[1]").click();

  const programNameInput = page.locator(checkoutProgramNameInput);
  await programNameInput.scrollIntoViewIfNeeded();
  await expect(programNameInput).toBeVisible();
  await programNameInput.fill("");
  await programNameInput.fill(standardProgramName);
}

async function verifyAccountingStringInput(
  page: Page,
  validValue: string,
  invalidValue?: string,
  expectedMessage?: string
) {
  const programNameInput = page.locator(checkoutProgramNameInput);
  const accountingStringInput = page.locator(checkoutAccountingStringInput);

  await accountingStringInput.scrollIntoViewIfNeeded();
  await expect(accountingStringInput).toBeVisible();

  // Always clear old value before testing next rule
  await accountingStringInput.fill("");
  await programNameInput.click();

  if (invalidValue) {
    await accountingStringInput.fill(invalidValue);
    await programNameInput.click();

    if (expectedMessage) {
      await expect(
        page.getByText(expectedMessage, { exact: false }).first()
      ).toBeVisible();
    }
  }

  // Clear again before valid check
  await accountingStringInput.fill("");
  await programNameInput.click();

  await accountingStringInput.fill(validValue);
  await programNameInput.click();

  await expect(accountingStringInput).toHaveValue(validValue);

  await accountingStringInput.fill("");
  await accountingStringInput.fill(validValue);

  await programNameInput.click();

  await expect(accountingStringInput).toHaveValue(validValue);

}

async function clickNext(page: Page) {
  const nextButton = page.getByRole("button", { name: nextBtn });
  await nextButton.scrollIntoViewIfNeeded();
  await nextButton.click();
}

async function pickTimeAndConfirm(page: Page, inputSelector: string) {
  const input = page.locator(inputSelector);
  await input.scrollIntoViewIfNeeded();
  await input.click();
  await page.getByRole("button", { name: okBtn }).click();
}

test("Catering - Settings - Add district customization settings for Accounting String description and requirements", async ({
  page,
}) => {
  const catering = await loginToK12Catering(page, { navigateTo: "Settings" });

  await scrollUntilVisible(catering, {
    target: catering.getByText(accountingStringDescriptionLabel, { exact: true }),
  });

  await expect(
    catering.getByText(accountingStringDescriptionLabel, { exact: true })
  ).toBeVisible();

  await expect(
    catering.getByText(accountingStringRequirementsLabel, { exact: true })
  ).toBeVisible();

  const accountingStringDescriptionRow = catering
    .locator("h3", { hasText: "Accounting String description" })
    .locator("xpath=ancestor::div[contains(@class, 'flex')][2]");

  const originalAccountingStringDescriptionDisplayedValue = await getTextFromLocator(
    catering,
    accountingStringDescriptionRow.locator("p").first()
  );

  await clickEditButtonForSetting(
    catering,
    "Accounting String description",
    "Edit accounting string description"
  );

  const originalAccountingStringDescriptionInputValue = await getInputValueFromLocator(
    catering,
    "#accounting-string-description-input"
  );

  expect(originalAccountingStringDescriptionInputValue).toBe(
    originalAccountingStringDescriptionDisplayedValue
  );

  const newAccountingStringDescriptionValue =
    generateRandomAccountingStringDescription();

  const accountingStringDescriptionInput = catering.locator(
    "#accounting-string-description-input"
  );

  await accountingStringDescriptionInput.fill("");
  await accountingStringDescriptionInput.fill(newAccountingStringDescriptionValue);

  const updatedAccountingStringDescriptionInputValue = await getInputValueFromLocator(
    catering,
    "#accounting-string-description-input"
  );

  expect(updatedAccountingStringDescriptionInputValue).toBe(
    newAccountingStringDescriptionValue
  );

  await catering
    .getByRole("button", { name: saveChangesBtn })
    .click();

  const successToast = catering.getByRole("alert");

  await expect(successToast).toBeVisible({ timeout: 10000 });
  await expect(successToast).toContainText(updateDescriptionSuccessTitle);
  await expect(successToast).toContainText(updateDescriptionSuccessBody);

  await expect(successToast).not.toBeVisible({ timeout: 10000 });

  const accountingStringDescriptionSection = catering
    .getByLabel("Edit accounting string description")
    .locator("xpath=ancestor::div[.//h3[normalize-space()='Accounting String description']][1]");

  const updatedAccountingStringDescriptionDisplayedValue = await getTextFromLocator(
    catering,
    accountingStringDescriptionSection.locator("p").first()
  );

  expect(updatedAccountingStringDescriptionDisplayedValue).toBe(
    newAccountingStringDescriptionValue
  );

  await clickEditButtonForSetting(
    catering,
    "Accounting String requirements",
    "Edit accounting string requirements"
  );

  await expect(
    catering.getByRole("heading", {
      name: accountingStringRequirementsDialogTitle,
      exact: true,
    })
  ).toBeVisible();

  const accountingStringRequirementsSelect = catering.locator(formatRuleDropdown);
  await expect(accountingStringRequirementsSelect).toBeVisible();

  // Always reset to Allow any text first so the test starts from a known state
  await accountingStringRequirementsSelect.selectOption({
    label: "Allow any text",
  });

  // Verify description for Allow any text
  await expect(catering.locator(formatRuleDescriptionText)).toContainText(
    "No format check"
  );

  // Verify dropdown options
  const accountingStringRequirementOptions =
    await accountingStringRequirementsSelect.locator("option").allTextContents();

  const trimmedAccountingStringRequirementOptions =
    accountingStringRequirementOptions.map((option) => option.trim());

  expect(trimmedAccountingStringRequirementOptions).toEqual([
    "Allow any text",
    "Exactly 9 digits",
    "Exactly 10 digits",
    "Letters and numbers only",
    "Letters, numbers, and spaces",
    "Digits with optional dashes",
    "Custom pattern (advanced)",
  ]);

  async function verifyFormatRuleOptionDetails(
    optionName: string,
    expectedDescription: string,
    expectedStoredPattern?: string
  ) {
    await accountingStringRequirementsSelect.selectOption({ label: optionName });

    await expect(catering.locator(formatRuleDescriptionText)).toContainText(
      expectedDescription
    );

    if (expectedStoredPattern) {
      const storedPatternLabel = catering.getByText("Stored pattern", {
        exact: false,
      }).first();

      await expect(storedPatternLabel).toBeVisible();

      const storedPatternContainer = storedPatternLabel.locator("xpath=..");

      await expect
        .poll(
          async () => {
            return ((await storedPatternContainer.textContent()) ?? "").trim();
          },
          {
            timeout: 5000,
            intervals: [250, 500, 1000],
          }
        )
        .toContain(expectedStoredPattern);
    }
  }

  for (const option of formatRuleOptionsToVerify) {
    await verifyFormatRuleOptionDetails(
      option.optionName,
      option.expectedDescription,
      option.expectedStoredPattern
    );
  }

  // Verify custom pattern option
  await accountingStringRequirementsSelect.selectOption({
    label: "Custom pattern (advanced)",
  });

  await expect(catering.locator(formatRuleDescriptionText)).toContainText(
    "Enter a valid JavaScript regular expression below (required)"
  );

  await expect(catering.locator(customPatternHintText)).toBeVisible();
  await expect(catering.locator(customPatternInput)).toBeVisible();

  // Verify validation error when Save Changes is clicked without entering custom regex
  const saveButton = catering.getByRole("button", {
    name: saveChangesBtn,
  });

  await saveButton.scrollIntoViewIfNeeded();
  await saveButton.click();

  await expect(catering.locator(customPatternError)).toBeVisible();

  // Reset to Allow any text and save so checkout starts from a known state
  await accountingStringRequirementsSelect.selectOption({
    label: "Allow any text",
  });

  await saveButton.scrollIntoViewIfNeeded();
  await saveButton.click();

  const requirementsSuccessToast = catering.getByRole("alert");

  await expect(requirementsSuccessToast).toBeVisible({ timeout: 10000 });
  await expect(requirementsSuccessToast).toContainText(
    updateRequirementsSuccessTitle
  );
  await expect(requirementsSuccessToast).toContainText(
    updateRequirementsSuccessBody
  );
  await expect(requirementsSuccessToast).not.toBeVisible({ timeout: 10000 });

  await navigateK12CateringMenu(catering, "Orders");

  const firstOrderCard = catering.locator("article").first();

  const paymentTypeValueInOrders = await getTextFromLocator(
    catering,
    firstOrderCard
      .getByText("Payment Type", { exact: true })
      .locator("xpath=following-sibling::p[1]")
  );

  expect(paymentTypeValueInOrders).toBe(newAccountingStringDescriptionValue);

  await navigateK12CateringMenu(catering, "Menu");

  const firstAddToCartButton = catering
    .getByRole("button", { name: addToCardBtn })
    .first();

  await expect(firstAddToCartButton).toBeVisible();
  await firstAddToCartButton.click();

  const addToCartModal = catering
    .getByText("Add to Cart", { exact: true })
    .locator("xpath=ancestor::div[contains(@class,'rounded-lg')][1]");

  const addToCartButtonInModal = addToCartModal
    .getByRole("button", { name: addToCardBtn })
    .first();

  await expect(addToCartButtonInModal).toBeVisible();
  await addToCartButtonInModal.click();

  await catering
    .getByRole("button", { name: proceedToCheckoutBtn })
    .click();

  // Event Date Tab
  await catering
    .getByRole("button", { name: selectEventDate })
    .click();

  const firstEnabledDateButton = catering.locator(
    'button[aria-label*=", 2026"]:not([disabled])'
  ).first();

  await expect(firstEnabledDateButton).toBeVisible();
  await firstEnabledDateButton.click();

  await clickNext(catering);

  // Event Time Tab
  await pickTimeAndConfirm(catering, eventStartTime);
  await pickTimeAndConfirm(catering, eventEndTime);
  await clickNext(catering);

  // Setup Time Tab
  await pickTimeAndConfirm(catering, setupTimeBtn);
  await clickNext(catering);

  // Delivery Contact Tab
  await catering
    .getByRole("button", { name: /Select from Address Book/i })
    .click();

  const savedAddressBookCard = catering.locator("article", {
    hasText: "Sabih Testing",
  }).first();

  await scrollUntilVisible(catering, {
    target: savedAddressBookCard,
  });

  await expect(savedAddressBookCard).toBeVisible();
  await savedAddressBookCard.click();

  await clickNext(catering);

  // Additional Details Tab
  const numGuestsInput = catering.locator('#num-guests-input');
  await expect(numGuestsInput).toBeVisible();
  await numGuestsInput.fill('2');

  await clickNext(catering);

  // Payment Info Tab
  const paymentMethodGroup = catering.locator('[id="payment-method-group"]');

  const paymentMethodLabel = paymentMethodGroup
    .locator("span.font-medium")
    .filter({ hasText: newAccountingStringDescriptionValue })
    .first();

  await expect(paymentMethodLabel).toBeVisible();

  const displayedAccountingStringDescriptionValue = await getTextFromLocator(
    catering,
    paymentMethodLabel
  );

  expect(displayedAccountingStringDescriptionValue).toBe(
    newAccountingStringDescriptionValue
  );

  await paymentMethodLabel.locator("xpath=ancestor::button[1]").click();

  const programNameInput = catering.locator('#checkout-program-name-input');
  await programNameInput.scrollIntoViewIfNeeded();
  await expect(programNameInput).toBeVisible();
  await programNameInput.fill('Sabih Testing');

  // Verify Allow any text
  await verifyAccountingStringInput(
    catering,
    "ABC-123@#"
  );

  for (const ruleCase of ruleValidationCases) {
    await saveAccountingStringRequirementsRule(
      catering,
      ruleCase.ruleName,
      ruleCase.customMessage,
      ruleCase.customRegex
    );

    await returnToPaymentInformation(
      catering,
      newAccountingStringDescriptionValue
    );

    await verifyAccountingStringInput(
      catering,
      ruleCase.validValue,
      ruleCase.invalidValue,
      ruleCase.customMessage
    );
  }

  // Payment Contact step / final checkout flow before placing order
  const paymentContactCard = catering.locator("article", {
    hasText: selectPaymentContactCard,
  }).first();

  await scrollUntilVisible(catering, {
    target: paymentContactCard,
  });

  await expect(paymentContactCard).toBeVisible();
  await paymentContactCard.click();

  await clickNext(catering);

  // Review - Checkbox
  const agreementCheckbox = catering.getByText(orderAgreementCheckbox, {
    exact: false,
  }).first();

  await agreementCheckbox.scrollIntoViewIfNeeded();
  await expect(agreementCheckbox).toBeVisible();
  await agreementCheckbox.click();

  // Place order
  const placeOrderButton = catering.getByRole("button", { name: placeOrderBtn });
  await placeOrderButton.scrollIntoViewIfNeeded();
  await expect(placeOrderButton).toBeVisible();
  await placeOrderButton.click();

  // Toast may be very fast, so don't rely on it alone
  await Promise.race([
    catering
      .getByText(orderPlacedSuccessTitle, { exact: false })
      .waitFor({ state: "visible", timeout: 10000 })
      .catch(() => null),
    catering
      .getByRole("heading", { name: /Order Management/i })
      .waitFor({ state: "visible", timeout: 15000 }),
  ]);

  // Ensure Orders page is loaded
  await expect(
    catering.getByRole("heading", { name: /Order Management/i })
  ).toBeVisible({ timeout: 15000 });

  // Let the Orders list finish rendering before interacting
  await catering.waitForLoadState("domcontentloaded");
  await catering.waitForTimeout(2000);

  const latestOrderCard = catering.locator("article").first();

  await expect(latestOrderCard).toBeVisible();

  const latestOrderPaymentTypeValue = await getTextFromLocator(
    catering,
    latestOrderCard
      .getByText("Payment Type", { exact: true })
      .locator("xpath=following-sibling::p[1]")
  );

  expect(latestOrderPaymentTypeValue).toBe(newAccountingStringDescriptionValue);

  const viewDetailsButton = latestOrderCard
    .getByRole("button", { name: viewDetailsForOrderBtn })
    .first();

  await expect(viewDetailsButton).toBeVisible();
  await viewDetailsButton.click();

  const invoiceText = await downloadAndReadPdfText(
    catering,
    downloadInvoiceBtn
  );

  expect(invoiceText).toContain(newAccountingStringDescriptionValue);

});