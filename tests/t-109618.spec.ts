import { test, expect } from '@playwright/test';
import {
  loginToK12Catering,
  scrollUntilVisible,
  getTextFromLocator,
  getInputValueFromLocator,
  clickAndCaptureNewTab,
} from '../utils/helpers';

test.use({ storageState: { cookies: [], origins: [] } });

function generateRandomShortSlug(): string {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
  let randomPart = '';

  for (let i = 0; i < 6; i++) {
    randomPart += chars.charAt(Math.floor(Math.random() * chars.length));
  }

  return `sabihtest${randomPart}`;
}

test('Catering - Settings - Add editable District Short URL', async ({ page }) => {
  const catering = await loginToK12Catering(page);

  await catering.getByRole('button', { name: 'Settings' }).click();

  const switchDistrictValue = await getTextFromLocator(
    catering,
    catering.getByLabel('Switch district')
  );

  await scrollUntilVisible(catering, {
    target: catering.getByText('Short URL:', { exact: false }),
  });

  const displayedShortUrlText = await getTextFromLocator(
    catering,
    catering.locator('span.font-mono.break-all').first()
  );

  const originalDisplayedShortUrlSlug = displayedShortUrlText
    .trim()
    .split('/')
    .filter(Boolean)
    .pop() ?? '';

  await catering.getByLabel('Edit Short URL').click();

  const shortNameInput = catering.locator('#district-short-name');
  await expect(shortNameInput).toBeVisible();

  const originalDialogShortUrl = await getInputValueFromLocator(
    catering,
    '#district-short-name'
  );

  const newShortUrlSlug = generateRandomShortSlug();

  await shortNameInput.click();
  await shortNameInput.clear();
  await shortNameInput.fill(newShortUrlSlug);

  const updatedDialogShortUrl = await getInputValueFromLocator(
    catering,
    '#district-short-name'
  );

  await catering.getByRole('button', { name: 'Save District Short Name' }).click();

  await expect(
    catering.getByText('District short name saved successfully!', { exact: true })
  ).toBeVisible({ timeout: 10000 });

  const updatedDisplayedShortUrlText = await getTextFromLocator(
    catering,
    catering.locator('span.font-mono.break-all').first()
  );

  const updatedDisplayedShortUrlSlug = updatedDisplayedShortUrlText
    .trim()
    .split('/')
    .filter(Boolean)
    .pop() ?? '';

  expect(updatedDialogShortUrl).toBe(newShortUrlSlug);
  expect(updatedDisplayedShortUrlSlug).toBe(newShortUrlSlug);

  const shortUrlTab = await clickAndCaptureNewTab(
    catering,
    catering.getByLabel('Open Short URL in New Tab')
  );

  const headingLocator = shortUrlTab.locator('h2').first();

await expect(headingLocator).toBeVisible();

await expect
  .poll(async () => {
    return (await headingLocator.textContent())?.trim() ?? '';
  }, {
    timeout: 15000,
    intervals: [500, 1000],
  })
  .toBe(switchDistrictValue.trim());

const shortUrlPageHeading = ((await headingLocator.textContent()) ?? '').trim();

  console.log('switchDistrictValue:', switchDistrictValue);
  console.log('originalDisplayedShortUrlSlug:', originalDisplayedShortUrlSlug);
  console.log('originalDialogShortUrl:', originalDialogShortUrl);
  console.log('newShortUrlSlug:', newShortUrlSlug);
  console.log('updatedDialogShortUrl:', updatedDialogShortUrl);
  console.log('updatedDisplayedShortUrlSlug:', updatedDisplayedShortUrlSlug);
  console.log('shortUrlPageHeading:', shortUrlPageHeading);

  await test.info().attach('short-url-update-values', {
    body: [
      `switchDistrictValue: ${switchDistrictValue}`,
      `originalDisplayedShortUrlSlug: ${originalDisplayedShortUrlSlug}`,
      `originalDialogShortUrl: ${originalDialogShortUrl}`,
      `newShortUrlSlug: ${newShortUrlSlug}`,
      `updatedDialogShortUrl: ${updatedDialogShortUrl}`,
      `updatedDisplayedShortUrlSlug: ${updatedDisplayedShortUrlSlug}`,
      `shortUrlPageHeading: ${shortUrlPageHeading}`,
    ].join('\n'),
    contentType: 'text/plain',
  });

  expect(shortUrlPageHeading.trim()).toBe(switchDistrictValue.trim());
});