import { test, expect, Page } from '@playwright/test';
import {
  loginToK12Catering,
  navigateK12CateringMenu,
} from '../../utils/helpers';

test.setTimeout(180000);
test.use({ storageState: { cookies: [], origins: [] } });

let catering: Page;

test.beforeAll(async ({ browser }) => {
  const context = await browser.newContext();
  const page = await context.newPage();
  catering = await loginToK12Catering(page);
});

test.beforeEach(async () => {
  await navigateK12CateringMenu(catering, 'Accounts');
  await catering.waitForLoadState('domcontentloaded');
});

test('Accounts - Actions kebab menu opens for Active account', async () => {
  await catering.getByRole('button', { name: /Actions for asd sdv/i }).click();
  await expect(
    catering.getByRole('menuitem', { name: 'Deactivate Account' }),
  ).toBeVisible();
  await expect(
    catering.getByRole('menuitem', { name: 'Change Password' }),
  ).toBeVisible();
});

test('Accounts - Actions kebab menu can be dismissed', async () => {
  await catering.getByRole('button', { name: /Actions for asd sdv/i }).click();
  await expect(
    catering.getByRole('menuitem', { name: 'Deactivate Account' }),
  ).toBeVisible();
  await catering.keyboard.press('Escape');
  await expect(
    catering.getByRole('menuitem', { name: 'Deactivate Account' }),
  ).not.toBeVisible();
});

test('Accounts - Total Accounts card click resets filters to show all accounts', async () => {
  // Filter by Active first
  await catering
    .getByRole('button', { name: 'Filter accounts by status' })
    .click();
  await catering
    .getByRole('listbox')
    .getByRole('option', { name: 'Active', exact: true })
    .click();
  await catering.waitForLoadState('domcontentloaded');

  // Click Total Accounts card to reset
  await catering
    .getByRole('button', {
      name: /Total accounts:.*Click to show all accounts/i,
    })
    .click();
  await catering.waitForLoadState('domcontentloaded');

  // Verify the accounts list is visible and stat cards are shown
  await expect(
    catering.getByRole('region', { name: 'Accounts list' }),
  ).toBeVisible();
  await expect(
    catering.getByRole('region', { name: /^Pending accounts:/ }),
  ).toBeVisible();
  await expect(
    catering.getByRole('region', { name: /^Active accounts:/ }),
  ).toBeVisible();
});

test('Accounts - Page 2 navigation loads second page of accounts', async () => {
  await catering.getByRole('button', { name: 'Page 2' }).first().click();
  await catering.waitForLoadState('domcontentloaded');
  await expect(
    catering.getByRole('button', { name: 'Page 2' }).first(),
  ).toBeVisible();
  // The accounts list should update
  await expect(
    catering.getByRole('region', { name: 'Accounts list' }),
  ).toBeVisible();
});
