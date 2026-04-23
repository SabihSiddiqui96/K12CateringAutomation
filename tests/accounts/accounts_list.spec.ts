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

test('Accounts - Accounts list heading is displayed', async () => {
  await expect(
    catering.getByRole('heading', { name: 'Accounts List' }),
  ).toBeVisible();
});

test('Accounts - Account cards display name, role, email, phone, created date', async () => {
  const firstCard = catering
    .getByRole('listitem')
    .filter({ hasText: 'asd sdv' })
    .first();
  await expect(firstCard.getByText('Role')).toBeVisible();
  await expect(firstCard.getByText('Email')).toBeVisible();
  await expect(firstCard.getByText('Phone')).toBeVisible();
  await expect(firstCard.getByText('Created')).toBeVisible();
});

test('Accounts - Active account card shows View Details and Actions buttons', async () => {
  const firstCard = catering
    .getByRole('listitem')
    .filter({ hasText: 'asd sdv' })
    .first();
  await expect(
    firstCard.getByRole('button', { name: /View details for asd sdv/i }),
  ).toBeVisible();
  await expect(
    firstCard.getByRole('button', { name: /Actions for asd sdv/i }),
  ).toBeVisible();
});

test('Accounts - Pending account card shows Approve and Reject buttons', async () => {
  const pendingCard = catering
    .getByRole('listitem')
    .filter({ hasText: 'S g' })
    .first();
  await expect(
    pendingCard.getByRole('button', { name: /Approve account for S g/i }),
  ).toBeVisible();
  await expect(
    pendingCard.getByRole('button', { name: /Reject account for S g/i }),
  ).toBeVisible();
});

test('Accounts - Pagination controls are displayed', async () => {
  await expect(
    catering.getByRole('button', { name: 'Page 1' }).first(),
  ).toBeVisible();
  await expect(
    catering.getByRole('button', { name: 'Next page' }).first(),
  ).toBeVisible();
  await expect(
    catering.getByRole('button', { name: 'Last page' }).first(),
  ).toBeVisible();
});

test('Accounts - Accounts list shows multiple account cards', async () => {
  const accountsList = catering.getByRole('region', { name: 'Accounts list' });
  await expect(accountsList).toBeVisible();
  const cards = accountsList.getByRole('listitem');
  await expect(cards).not.toHaveCount(0);
});
