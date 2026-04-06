// Test Link: https://dev.azure.com/Cybersoft-Technologies-Inc/PrimeroEdge%20Classic/_workitems/edit/80926

import { test, expect } from "@playwright/test";
import {
    loginToK12Catering,
    scrollUntilVisible,
    getTextFromLocator,
    getInputValueFromLocator,
} from "../../utils/helpers";

test.use({ storageState: { cookies: [], origins: [] } });

const accountingStringDescriptionLabel = "Accounting String description";
const accountingStringRequirementsLabel = "Accounting String requirements";

const accountingStringDescriptionInputSelector =
    'input[aria-label="UPDATE THIS LABEL - Accounting String Description Input"]';

const accountingStringRequirementsDropdownSelector =
    'button[aria-label="UPDATE THIS LABEL - Accounting String Requirements Dropdown"]';

const accountingStringFieldSelector =
    'input[aria-label="UPDATE THIS LABEL - Accounting String Checkout Input"]';

const paymentMethodAccountingStringSelector =
    'input[aria-label="UPDATE THIS LABEL - Accounting String Payment Method"]';

const saveChangesButtonName = "Save Changes";
const updateDescriptionSuccessMessage =
    "UPDATE THIS LABEL - Description updated successfully toast";
const updateRequirementsSuccessMessage =
    "UPDATE THIS LABEL - Requirements updated successfully toast";

const updatedAccountingStringDescription = "Accounting Number";
const validTenDigitAccountingString = "1234567890";
const invalidNineDigitAccountingString = "123456789";

function escapeRegExp(value: string): string {
    return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function getSettingsRow(page: any, settingLabel: string) {
    return page
        .locator(
            `xpath=//*[self::div or self::section or self::tr][.//*[normalize-space(text())="${settingLabel}"]]`
        )
        .first();
}

async function clickEditButtonForSetting(page: any, settingLabel: string) {
    const row = getSettingsRow(page, settingLabel);
    await expect(row).toBeVisible();

    await row
        .getByLabel(new RegExp(`UPDATE THIS LABEL.*${escapeRegExp(settingLabel)}`, "i"))
        .click();
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

    await clickEditButtonForSetting(catering, accountingStringDescriptionLabel);

    const accountingStringDescriptionInput = catering.locator(
        accountingStringDescriptionInputSelector
    );

    await expect(accountingStringDescriptionInput).toBeVisible();

    const originalAccountingStringDescription = await getInputValueFromLocator(
        catering,
        accountingStringDescriptionInputSelector
    );

    expect(originalAccountingStringDescription).toBe("Accounting String");

    await accountingStringDescriptionInput.fill("");
    await accountingStringDescriptionInput.fill(updatedAccountingStringDescription);

    const updatedDialogAccountingStringDescription =
        await getInputValueFromLocator(
            catering,
            accountingStringDescriptionInputSelector
        );

    expect(updatedDialogAccountingStringDescription).toBe(
        updatedAccountingStringDescription
    );

    await catering
        .getByRole("button", { name: saveChangesButtonName })
        .click();

    await expect(
        catering.getByText(updateDescriptionSuccessMessage, { exact: true })
    ).toBeVisible({
        timeout: 10000,
    });

    await scrollUntilVisible(catering, {
        target: catering.getByText(updatedAccountingStringDescription, {
            exact: false,
        }),
    });

    await expect(
        catering.getByText(updatedAccountingStringDescription, { exact: false })
    ).toBeVisible();

    await clickEditButtonForSetting(catering, accountingStringRequirementsLabel);

    const accountingStringRequirementsDropdown = catering.locator(
        accountingStringRequirementsDropdownSelector
    );

    await expect(accountingStringRequirementsDropdown).toBeVisible();

    const originalAccountingStringRequirementsValue = await getTextFromLocator(
        catering,
        accountingStringRequirementsDropdown
    );

    expect(originalAccountingStringRequirementsValue).toContain("Any text allowed");

    await accountingStringRequirementsDropdown.click();

    await expect(
        catering.getByRole("option", { name: "Any text allowed" })
    ).toBeVisible();

    await expect(
        catering.getByRole("option", { name: "Exactly 10 digits" })
    ).toBeVisible();

    await catering.getByRole("option", { name: "Exactly 10 digits" }).click();

    const updatedAccountingStringRequirementsValue = await getTextFromLocator(
        catering,
        accountingStringRequirementsDropdown
    );

    expect(updatedAccountingStringRequirementsValue).toContain("Exactly 10 digits");

    await catering
        .getByRole("button", { name: saveChangesButtonName })
        .click();

    await expect(
        catering.getByText(updateRequirementsSuccessMessage, { exact: true })
    ).toBeVisible({
        timeout: 10000,
    });

    await catering.reload();
    await catering.waitForLoadState("domcontentloaded");

    await scrollUntilVisible(catering, {
        target: catering.getByText(accountingStringDescriptionLabel, { exact: true }),
    });

    await clickEditButtonForSetting(catering, accountingStringDescriptionLabel);

    const persistedAccountingStringDescription = await getInputValueFromLocator(
        catering,
        accountingStringDescriptionInputSelector
    );

    expect(persistedAccountingStringDescription).toBe(
        updatedAccountingStringDescription
    );

    await catering.getByRole("button", { name: /close|cancel/i }).click();

    await clickEditButtonForSetting(catering, accountingStringRequirementsLabel);

    const persistedAccountingStringRequirementsValue = await getTextFromLocator(
        catering,
        accountingStringRequirementsDropdown
    );

    expect(persistedAccountingStringRequirementsValue).toContain(
        "Exactly 10 digits"
    );

    await catering.getByRole("button", { name: /close|cancel/i }).click();

    await catering.getByRole("button", { name: "UPDATE THIS LABEL - New Order" }).click();

    await expect(
        catering.getByText(updatedAccountingStringDescription, { exact: false })
    ).toBeVisible();

    await catering.locator(paymentMethodAccountingStringSelector).check();

    const accountingStringInput = catering.locator(accountingStringFieldSelector);
    await expect(accountingStringInput).toBeVisible();

    await accountingStringInput.fill(validTenDigitAccountingString);

    await expect(
        catering.getByText("UPDATE THIS LABEL - invalid accounting string error", {
            exact: false,
        })
    ).not.toBeVisible();

    await accountingStringInput.fill("");
    await accountingStringInput.fill(invalidNineDigitAccountingString);

    await catering.getByRole("button", { name: "UPDATE THIS LABEL - Continue" }).click();

    await expect(
        catering.getByText("UPDATE THIS LABEL - must be exactly 10 digits", {
            exact: false,
        })
    ).toBeVisible();

    await test.info().attach("accounting-string-settings-values", {
        body: [
            `originalAccountingStringDescription: ${originalAccountingStringDescription}`,
            `updatedDialogAccountingStringDescription: ${updatedDialogAccountingStringDescription}`,
            `persistedAccountingStringDescription: ${persistedAccountingStringDescription}`,
            `originalAccountingStringRequirementsValue: ${originalAccountingStringRequirementsValue}`,
            `updatedAccountingStringRequirementsValue: ${updatedAccountingStringRequirementsValue}`,
            `persistedAccountingStringRequirementsValue: ${persistedAccountingStringRequirementsValue}`,
            `validTenDigitAccountingString: ${validTenDigitAccountingString}`,
            `invalidNineDigitAccountingString: ${invalidNineDigitAccountingString}`,
        ].join("\n"),
        contentType: "text/plain",
    });
});