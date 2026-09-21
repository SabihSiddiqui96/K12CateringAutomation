// Data Sync - Orders - Districts - Add district group

import { test, expect, Page } from '@playwright/test';
import { loginToK12Catering } from '../../utils/helpers';
// safeNavigate, not navigateK12CateringMenu
import { safeNavigate } from '../../utils/dataSync';

// --- Locators
const AUTO_SYNC_SWITCH = /Auto[\s-]?sync/i;
const AUTO_SYNC_SAVED_ALERT = 'Auto-sync settings saved';
const ORDER_STATUS_FILTER = 'Filter orders by status';
const ACCEPTED_STATUS = 'Accepted';
// Any accepted order will do - see openAcceptedOrder.
const VIEW_ORDER_BUTTON = /^View details for order /i;
const ADD_DISTRICT_GROUP_BUTTON = 'Add district group';
const DISTRICT_GROUP_DIALOG = 'District Group';
const GROUP_NAME_FIELD = 'Group Name *';
const DUPLICATE_GROUP_ALERT = 'District group name already exists.';

// --- Helpers
const autoSyncSwitch = (page: Page) =>
  page.getByRole('switch', { name: AUTO_SYNC_SWITCH }).first();

const autoSyncIsOn = async (page: Page) =>
  (await autoSyncSwitch(page).getAttribute('aria-checked').catch(() => null)) === 'true';

/** Flip the auto-sync switch to `on` and wait for the save */
async function setAutoSync(page: Page, on: boolean): Promise<void> {
  const toggle = autoSyncSwitch(page);
  await expect(toggle).toBeVisible();
  if ((await autoSyncIsOn(page)) === on) return;
  await toggle.click();
  await expect(
    page.getByRole('alert').filter({ hasText: AUTO_SYNC_SAVED_ALERT }),
  ).toBeVisible();
  await expect(toggle).toHaveAttribute('aria-checked', String(on));
}

/** Opens Data Sync and turns the auto-sync switch off, returning its original state. */
async function disableAutoSync(page: Page): Promise<boolean> {
  await safeNavigate(page, 'Data Sync');
  await expect(page).toHaveURL(/\/data-sync/);
  await expect(autoSyncSwitch(page)).toBeVisible();
  const wasOn = await autoSyncIsOn(page);
  await setAutoSync(page, false);
  return wasOn;
}

/** Opens Orders, filters to Accepted and opens the first accepted order. */
async function openAcceptedOrder(page: Page) {
  // Deliberately NOT a fixed order id.
  const firstOrder = page.getByRole('button', { name: VIEW_ORDER_BUTTON }).first();

  // Redo the whole sequence on failure rather than each step
  await expect(async () => {
    await safeNavigate(page, 'Orders');
    await expect(page).toHaveURL(/\/orders/);
    await page
      .getByRole('button', { name: ORDER_STATUS_FILTER, exact: true })
      .click();
    await page
      .getByRole('option', { name: ACCEPTED_STATUS, exact: true })
      .click();
    await expect(
      firstOrder,
      'the Accepted filter lists at least one order',
    ).toBeVisible({ timeout: 15000 });
  }).toPass({ timeout: 120000, intervals: [2000, 3000, 5000] });

  await firstOrder.click();
}

/** Opens Districts and launches the Add district group dialog. */
async function openAddDistrictGroupDialog(page: Page) {
  await safeNavigate(page, 'Districts');
  await expect(page).toHaveURL(/\/districts/);
  await page
    .getByRole('button', { name: ADD_DISTRICT_GROUP_BUTTON, exact: true })
    .click();
  await expect(
    page.getByRole('dialog').filter({ hasText: DISTRICT_GROUP_DIALOG }),
  ).toBeVisible();
}

test.use({ storageState: { cookies: [], origins: [] } });

test('Data Sync - Orders - Districts - Add district group', async ({
  page,
}) => {
  test.setTimeout(240_000);

  const catering = await loginToK12Catering(page);

  // -- Step 1: Disable auto-sync from Data Sync
  const autoSyncWasOn = await disableAutoSync(catering);

  try {
    // -- Step 2: Open the accepted order from Orders
    await openAcceptedOrder(catering);

    // -- Step 3: Open the Add district group dialog from Districts
    await openAddDistrictGroupDialog(catering);

    // -- Step 4: Submit a duplicate group name and check the error
    await catering
      .getByRole('textbox', { name: GROUP_NAME_FIELD, exact: true })
      .fill('test');
    await catering.getByRole('button', { name: 'Add', exact: true }).click();
    // Scope to the dialog's inline error
    const duplicateGroupAlert = catering
      .getByLabel(DISTRICT_GROUP_DIALOG, { exact: true })
      .getByRole('alert')
      .filter({ hasText: DUPLICATE_GROUP_ALERT });
    await expect(duplicateGroupAlert).toBeVisible();
    await expect(duplicateGroupAlert).toHaveText(DUPLICATE_GROUP_ALERT);
  } finally {
    // Auto-sync is a district-wide setting, not this test's own data
    if (autoSyncWasOn) {
      await safeNavigate(catering, 'Data Sync')
        .then(() => setAutoSync(catering, true))
        .catch(() => undefined);
    }
  }
});
