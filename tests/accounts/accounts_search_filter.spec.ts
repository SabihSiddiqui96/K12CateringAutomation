import { test, expect, Page } from '@playwright/test';
import {
  loginToK12Catering,
  navigateK12CateringMenu,
} from '../../utils/helpers';

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

test('Accounts - Search bar is displayed and accepts input', async () => {
  const searchBox = catering.getByRole('textbox', {
    name: 'Search accounts by name, username, or email',
  });
  await expect(searchBox).toBeVisible();
  await searchBox.fill('demo');
  await expect(searchBox).toHaveValue('demo');
});

test('Accounts - Status filter dropdown shows all options', async () => {
  await catering
    .getByRole('button', { name: 'Filter accounts by status' })
    .click();
  const listbox = catering.getByRole('listbox');
  await expect(
    listbox.getByRole('option', { name: 'All Status', exact: true }),
  ).toBeVisible();
  await expect(
    listbox.getByRole('option', { name: 'Pending', exact: true }),
  ).toBeVisible();
  await expect(
    listbox.getByRole('option', { name: 'Active', exact: true }),
  ).toBeVisible();
  await expect(
    listbox.getByRole('option', { name: 'Inactive', exact: true }),
  ).toBeVisible();
  await expect(
    listbox.getByRole('option', { name: 'Rejected', exact: true }),
  ).toBeVisible();
});

test('Accounts - Role filter dropdown shows all options', async () => {
  await catering
    .getByRole('button', { name: 'Filter accounts by role' })
    .click();
  const listbox = catering.getByRole('listbox');
  await expect(
    listbox.getByRole('option', { name: 'All roles', exact: true }),
  ).toBeVisible();
  await expect(
    listbox.getByRole('option', { name: 'Customer', exact: true }),
  ).toBeVisible();
  await expect(
    listbox.getByRole('option', { name: 'Admin', exact: true }),
  ).toBeVisible();
  await expect(
    listbox.getByRole('option', { name: 'Regional Admin', exact: true }),
  ).toBeVisible();
});

test('Accounts - Sort dropdown shows all options', async () => {
  await catering.getByRole('button', { name: 'Sort accounts' }).click();
  const listbox = catering.getByRole('listbox');
  await expect(
    listbox.getByRole('option', { name: 'Newest First', exact: true }),
  ).toBeVisible();
  await expect(
    listbox.getByRole('option', { name: 'Oldest First', exact: true }),
  ).toBeVisible();
  await expect(
    listbox.getByRole('option', { name: 'Name A-Z', exact: true }),
  ).toBeVisible();
  await expect(
    listbox.getByRole('option', { name: 'Status', exact: true }),
  ).toBeVisible();
});

test('Accounts - Filtering by Active status shows only Active accounts', async () => {
  await catering
    .getByRole('button', { name: 'Filter accounts by status' })
    .click();
  await catering
    .getByRole('listbox')
    .getByRole('option', { name: 'Active', exact: true })
    .click();
  await catering.waitForLoadState('domcontentloaded');
  const pendingStatuses = catering
    .locator('[role="status"]')
    .filter({ hasText: 'Pending' });
  await expect(pendingStatuses).toHaveCount(0);
});
