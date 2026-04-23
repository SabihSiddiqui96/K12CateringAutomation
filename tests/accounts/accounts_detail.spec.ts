import { test, expect, Page } from '@playwright/test';
import {
  loginToK12Catering,
  navigateK12CateringMenu,
} from '../../utils/helpers';

test.use({ storageState: { cookies: [], origins: [] } });
test.use({ viewport: { width: 1440, height: 900 } });

let catering: Page;

test.beforeAll(async ({ browser }) => {
  const context = await browser.newContext();
  const page = await context.newPage();
  catering = await loginToK12Catering(page);
});

test.afterEach(async () => {
  const closeBtn = catering.getByRole('button', {
    name: 'Close account details modal',
  });
  const cancelBtn = catering.getByRole('button', { name: 'Cancel' });
  if (await closeBtn.isVisible()) {
    await closeBtn.click();
  } else if (await cancelBtn.isVisible()) {
    await cancelBtn.click();
  }
});

test.beforeEach(async () => {
  await navigateK12CateringMenu(catering, 'Accounts');
  await catering.waitForLoadState('domcontentloaded');

  // Close modal if still open from previous test
  const closeBtn = catering.getByRole('button', {
    name: 'Close account details modal',
  });
  if (await closeBtn.isVisible()) {
    await closeBtn.click();
    await expect(closeBtn).not.toBeVisible({ timeout: 5000 });
  }

  await catering.evaluate(() => {
    const nav = document.querySelector('[aria-label="Main navigation menu"]');
    if (nav) nav.scrollTop = 0;
  });

  await catering
    .getByRole('button', { name: /View details for asd sdv/i })
    .click();
  await expect(
    catering.getByRole('heading', { name: 'Account Details' }),
  ).toBeVisible({ timeout: 10000 });
});

test('Accounts - Account Details modal opens and displays title', async () => {
  await expect(
    catering.getByRole('heading', { name: 'Account Details' }),
  ).toBeVisible();
  await expect(
    catering.getByText('Manage user information and permissions'),
  ).toBeVisible();
});

test('Accounts - Basic Information section is displayed with First and Last Name fields', async () => {
  await expect(
    catering.getByRole('heading', { name: 'Basic Information' }),
  ).toBeVisible();
  await expect(catering.locator('#firstName-input')).toBeVisible();
  await expect(catering.locator('#lastName-input')).toBeVisible();
});

test('Accounts - Account Information section shows Username and Phone fields', async () => {
  await expect(
    catering.getByRole('heading', { name: 'Account Information' }),
  ).toBeVisible();
  await expect(catering.locator('#username-input')).toBeVisible();
  await expect(catering.locator('#phoneNumber-input')).toBeVisible();
});

test('Accounts - Work Information section shows Department and Employee ID fields', async () => {
  await expect(
    catering.getByRole('heading', { name: 'Work Information' }),
  ).toBeVisible();
  await expect(catering.locator('#department-input')).toBeVisible();
  await expect(catering.locator('#employeeId-input')).toBeVisible();
});

test('Accounts - Account Status section shows status dropdown', async () => {
  await expect(
    catering.getByRole('heading', { name: 'Account Status' }),
  ).toBeVisible();
  await expect(catering.locator('#status-select')).toBeVisible();
});

test('Accounts - User Role section shows role radio buttons', async () => {
  await expect(
    catering.getByRole('heading', { name: 'User Role' }),
  ).toBeVisible();
  await expect(
    catering.getByRole('button', { name: 'Customer', exact: true }),
  ).toBeVisible();
  await expect(
    catering.getByRole('button', { name: 'Admin', exact: true }),
  ).toBeVisible();
  await expect(
    catering.getByRole('button', { name: 'Regional Admin', exact: true }),
  ).toBeVisible();
});

test('Accounts - Modal action buttons are displayed', async () => {
  await expect(
    catering.getByRole('button', { name: 'Deactivate Account' }),
  ).toBeVisible();
  await expect(catering.getByRole('button', { name: 'Cancel' })).toBeVisible();
  await expect(
    catering.getByRole('button', { name: 'Update Details' }),
  ).toBeVisible();
});

test('Accounts - Close button dismisses the Account Details modal', async () => {
  await catering
    .getByRole('button', { name: 'Close account details modal' })
    .click();
  await expect(
    catering.getByRole('heading', { name: 'Account Details' }),
  ).not.toBeVisible();
  await expect(
    catering.getByRole('heading', { name: 'Account Management' }),
  ).toBeVisible();
});
