//Test Link: https://dev.azure.com/Cybersoft-Technologies-Inc/PrimeroEdge%20Classic/_workitems/edit/109618

import { test, expect } from "@playwright/test";
import {
  loginToK12Catering,
  scrollUntilVisible,
  getTextFromLocator,
  getInputValueFromLocator,
  clickAndCaptureNewTab,
} from "../../utils/helpers";

test.use({ storageState: { cookies: [], origins: [] } });

const districtShortNameSelector = "#district-short-name";
const shortUrlTextSelector = "span.font-mono.break-all";
const shortUrlUpdatedSuccessMessage = "District short name saved successfully!";

function generateRandomShortSlug(): string {
  const chars = "abcdefghijklmnopqrstuvwxyz0123456789";
  let randomURLTexts = "";

  for (let i = 0; i < 6; i++) {
    randomURLTexts += chars.charAt(Math.floor(Math.random() * chars.length));
  }

  return `sabihtest${randomURLTexts}`;
}

function getSlugFromUrlText(urlText: string): string {
  return urlText.trim().split("/").filter(Boolean).pop() ?? "";
}

test("Catering - Settings - Add editable District Short URL", async ({
  page,
}) => {
  const catering = await loginToK12Catering(page, { navigateTo: "Settings" });

  const switchDistrictValue = await getTextFromLocator(
    catering,
    catering.getByLabel("Switch district"),
  );

  await scrollUntilVisible(catering, {
    target: catering.getByText("Short URL:", { exact: false }),
  });

  const displayedShortUrlText = await getTextFromLocator(
    catering,
    catering.locator(shortUrlTextSelector).first(),
  );

  const originalDisplayedShortUrlSlug = getSlugFromUrlText(
    displayedShortUrlText,
  );

  await catering.getByLabel("Edit Short URL").click();

  const shortNameInput = catering.locator(districtShortNameSelector);
  await expect(shortNameInput).toBeVisible();

  const originalDialogShortUrl = await getInputValueFromLocator(
    catering,
    districtShortNameSelector,
  );

  const newShortUrlSlug = generateRandomShortSlug();

  await shortNameInput.fill("");
  await shortNameInput.fill(newShortUrlSlug);

  const updatedDialogShortUrl = await getInputValueFromLocator(
    catering,
    districtShortNameSelector,
  );

  await catering
    .getByRole("button", { name: "Save District Short Name" })
    .click();

  await expect(
    catering.getByText(shortUrlUpdatedSuccessMessage, { exact: true }),
  ).toBeVisible({
    timeout: 10000,
  });

  const updatedDisplayedShortUrlText = await getTextFromLocator(
    catering,
    catering.locator(shortUrlTextSelector).first(),
  );

  const updatedDisplayedShortUrlSlug = getSlugFromUrlText(
    updatedDisplayedShortUrlText,
  );

  expect(updatedDialogShortUrl).toBe(newShortUrlSlug);
  expect(updatedDisplayedShortUrlSlug).toBe(newShortUrlSlug);

  const shortUrlTab = await clickAndCaptureNewTab(
    catering,
    catering.getByLabel("Open Short URL in New Tab"),
  );

  const headingLocator = shortUrlTab.locator("h2").first();
  await expect(headingLocator).toBeVisible();
  const expectedHeading = switchDistrictValue.trim();

  await expect
    .poll(
      async () => {
        return (await headingLocator.textContent())?.trim() ?? "";
      },
      {
        timeout: 15000,
        intervals: [500, 1000],
      },
    )
    .toBe(expectedHeading);

  const shortUrlPageHeading = (
    (await headingLocator.textContent()) ?? ""
  ).trim();

  await test.info().attach("short-url-update-values", {
    body: [
      `switchDistrictValue: ${switchDistrictValue}`,
      `originalDisplayedShortUrlSlug: ${originalDisplayedShortUrlSlug}`,
      `originalDialogShortUrl: ${originalDialogShortUrl}`,
      `newShortUrlSlug: ${newShortUrlSlug}`,
      `updatedDialogShortUrl: ${updatedDialogShortUrl}`,
      `updatedDisplayedShortUrlSlug: ${updatedDisplayedShortUrlSlug}`,
      `shortUrlPageHeading: ${shortUrlPageHeading}`,
    ].join("\n"),
    contentType: "text/plain",
  });

  expect(shortUrlPageHeading).toBe(expectedHeading);
});
