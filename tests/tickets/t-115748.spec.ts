// Test Link: https://dev.azure.com/Cybersoft-Technologies-Inc/PrimeroEdge%20Classic/_workitems/edit/115748

import { expect, Page, test } from '@playwright/test';
import {
  loginToK12Catering,
  navigateK12CateringMenu,
} from '../../utils/helpers';

test.use({ storageState: { cookies: [], origins: [] } });

const testLocation = {
  firstName: 'Sabih',
  lastName: 'Testgin',
  phoneNumber: '8322903291',
  email: 'sabih@testing.com',
  locationName: 'office',
  addressLine1: '11411 Case Dr',
  city: 'Suagr Land',
  state: 'Texas',
  zipCode: '77498',
};

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

async function openAddLocationForm(page: Page): Promise<void> {
  const addLocationButton = page
    .getByRole('button', { name: /Add your first location/i })
    .or(
      page.getByRole('button', {
        name: /Add a new location to your address book/i,
      }),
    );

  await expect(addLocationButton.first()).toBeVisible({ timeout: 10000 });
  await addLocationButton.first().click();

  await expect(page.locator('#firstName-input')).toBeVisible({
    timeout: 10000,
  });
}

async function addTestLocation(page: Page): Promise<void> {
  await openAddLocationForm(page);

  await page.locator('#firstName-input').fill(testLocation.firstName);
  await page.locator('#lastName-input').fill(testLocation.lastName);
  await page.locator('#phoneNumber-input').fill(testLocation.phoneNumber);
  await page.locator('#email-input').fill(testLocation.email);
  await page.locator('#locationName-input').fill(testLocation.locationName);
  await page.locator('#addressLine1-input').fill(testLocation.addressLine1);
  await page.locator('#city-input').fill(testLocation.city);
  await page
    .locator('#state-select')
    .selectOption({ label: testLocation.state });
  await page.locator('#zipCode-input').fill(testLocation.zipCode);

  await page.getByRole('button', { name: /Save new location/i }).click();
  await expect(
    page
      .getByText(/saving location/i)
      .or(page.getByText(/location.*saved|saved.*location|success/i))
      .first(),
  ).toBeVisible({ timeout: 10000 });

  await expect(page.locator('h1')).toContainText('Address Book', {
    timeout: 15000,
  });
  await expect(
    page.getByRole('button', { name: /Delete office location/i }),
  ).toBeVisible({
    timeout: 10000,
  });
}

async function waitForK12CateringApp(page: Page): Promise<void> {
  const sidebar = page.locator('aside[aria-label="Main navigation"]');
  if (await sidebar.isVisible({ timeout: 5000 }).catch(() => false)) {
    return;
  }

  const launcherLink = page.locator('a[href*="/login?token="]').first();
  if (await launcherLink.isVisible({ timeout: 5000 }).catch(() => false)) {
    await launcherLink.click();
    await page.waitForLoadState('domcontentloaded');
  }

  await expect(sidebar).toBeVisible({ timeout: 30000 });
}

async function getFirstLocationName(page: Page): Promise<string | null> {
  const deleteButton = page
    .getByRole('button', { name: /^Delete .* location$/i })
    .first();

  if (!(await deleteButton.isVisible({ timeout: 5000 }).catch(() => false))) {
    return null;
  }

  const ariaLabel = await deleteButton.getAttribute('aria-label');
  const locationName = ariaLabel?.match(/^Delete (.*) location$/i)?.[1]?.trim();

  if (!locationName) {
    throw new Error(
      `Unable to read location name from delete button label: ${ariaLabel}`,
    );
  }

  return locationName;
}

async function deleteFirstLocation(page: Page): Promise<string> {
  const locationName = await getFirstLocationName(page);

  if (!locationName) {
    throw new Error(
      'Expected a saved address before attempting to delete one.',
    );
  }

  const deleteLocationButtonName = new RegExp(
    `^Delete ${escapeRegExp(locationName)} location$`,
    'i',
  );

  await page.getByRole('button', { name: deleteLocationButtonName }).click();

  const confirmDeleteButton = page.getByRole('button', {
    name: /Delete and proceed with action/i,
  });
  await expect(confirmDeleteButton).toBeVisible({ timeout: 10000 });
  await confirmDeleteButton.click();

  await expect(
    page.getByText(/deleted|removed.*successfully|success/i).first(),
  ).toBeVisible({ timeout: 10000 });

  await expect(
    page.getByRole('button', { name: deleteLocationButtonName }),
  ).not.toBeVisible({ timeout: 10000 });

  return locationName;
}

test('Catering - Address Book - Delete saved location and add it back', async ({
  page,
}) => {
  const catering = await loginToK12Catering(page);

  await waitForK12CateringApp(catering);
  await navigateK12CateringMenu(catering, 'Address Book');
  await catering.waitForLoadState('domcontentloaded');
  await expect(catering.locator('h1')).toContainText('Address Book', {
    timeout: 15000,
  });

  const hasSavedAddress = await getFirstLocationName(catering);
  if (!hasSavedAddress) {
    await addTestLocation(catering);
  }

  const deletedLocationName = await deleteFirstLocation(catering);

  await test.info().attach('deleted-address-location', {
    body: `Deleted location name: ${deletedLocationName}`,
    contentType: 'text/plain',
  });

  await addTestLocation(catering);
});
