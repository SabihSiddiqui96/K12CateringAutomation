// Data Sync - Orders - Districts - Add district group

import { test, expect, Page } from '@playwright/test';
import {
  loginToK12Catering,
  navigateK12CateringMenu,
} from '../../utils/helpers';

// ---------------------------------------------------------------------------
// Locators
// ---------------------------------------------------------------------------
const AUTO_SYNC_SWITCH = 'Disable auto-sync';
const AUTO_SYNC_SAVED_ALERT = 'Auto-sync settings saved';
const ORDER_STATUS_FILTER = 'Filter orders by status';
const ACCEPTED_STATUS = 'Accepted';
const ACCEPTED_ORDER_HEADING = 'D51A31DE92';
const ADD_DISTRICT_GROUP_BUTTON = 'Add district group';
const DISTRICT_GROUP_DIALOG = 'District Group';
const GROUP_NAME_FIELD = 'Group Name *';
const DUPLICATE_GROUP_ALERT = 'District group name already exists.';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Opens Data Sync and turns the auto-sync switch off. */
async function disableAutoSync(page: Page) {
  await navigateK12CateringMenu(page, 'Data Sync');
  await expect(page).toHaveURL(/\/data-sync/);
  await page
    .getByRole('switch', { name: AUTO_SYNC_SWITCH, exact: true })
    .click();
  await expect(
    page.getByRole('alert').filter({ hasText: AUTO_SYNC_SAVED_ALERT }),
  ).toBeVisible();
}

/** Opens Orders, filters to Accepted and opens the accepted order. */
async function openAcceptedOrder(page: Page) {
  await navigateK12CateringMenu(page, 'Orders');
  await expect(page).toHaveURL(/\/orders/);
  await page
    .getByRole('button', { name: ORDER_STATUS_FILTER, exact: true })
    .click();
  await page
    .getByRole('option', { name: ACCEPTED_STATUS, exact: true })
    .click();
  await page
    .getByRole('heading', { name: ACCEPTED_ORDER_HEADING, exact: true })
    .click();
}

/** Opens Districts and launches the Add district group dialog. */
async function openAddDistrictGroupDialog(page: Page) {
  await navigateK12CateringMenu(page, 'Districts');
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
  test.setTimeout(120_000);

  const catering = await loginToK12Catering(page);

  // -- Step 1: Disable auto-sync from Data Sync --
  await disableAutoSync(catering);

  // -- Step 2: Open the accepted order from Orders --
  await openAcceptedOrder(catering);

  // -- Step 3: Open the Add district group dialog from Districts --
  await openAddDistrictGroupDialog(catering);

  // -- Step 4: Submit a duplicate group name and check the error --
  await catering
    .getByRole('textbox', { name: GROUP_NAME_FIELD, exact: true })
    .fill('test');
  await catering.getByRole('button', { name: 'Add', exact: true }).click();
  // Scope to the dialog's inline error: a "Failed to save district" toast also
  // carries this text, so an unscoped role=alert matches two elements.
  const duplicateGroupAlert = catering
    .getByLabel(DISTRICT_GROUP_DIALOG, { exact: true })
    .getByRole('alert')
    .filter({ hasText: DUPLICATE_GROUP_ALERT });
  await expect(duplicateGroupAlert).toBeVisible();
  await expect(duplicateGroupAlert).toHaveText(DUPLICATE_GROUP_ALERT);
});
