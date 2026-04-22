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

test('Accounts - Page heading and subtitle are displayed', async () => {
  await expect(catering.locator('h1')).toContainText('Account Management');
  await expect(
    catering.getByText('Manage user accounts and permissions'),
  ).toBeVisible();
});

test('Accounts - Total Accounts stat card is displayed', async () => {
  const totalCard = catering.getByRole('button', {
    name: /Total accounts:.*Click to show all accounts/i,
  });
  await expect(totalCard).toBeVisible();
  await expect(totalCard.locator('h2')).toBeVisible();
});

test('Accounts - Stat cards for Pending, Active, Inactive, Rejected are displayed', async () => {
  await expect(
    catering.getByRole('region', { name: /^Pending accounts:/ }),
  ).toBeVisible();
  await expect(
    catering.getByRole('region', { name: /^Active accounts:/ }),
  ).toBeVisible();
  await expect(
    catering.getByRole('region', { name: /^Inactive accounts:/ }),
  ).toBeVisible();
  await expect(
    catering.getByRole('region', { name: /^Rejected accounts:/ }),
  ).toBeVisible();
});

test('Accounts - Stat card counts are numeric', async () => {
  const pendingHeading = catering
    .getByRole('region', { name: /^Pending accounts:/ })
    .locator('h2');
  const activeHeading = catering
    .getByRole('region', { name: /^Active accounts:/ })
    .locator('h2');

  await expect(pendingHeading).toHaveText(/^\d+$/);
  await expect(activeHeading).toHaveText(/^\d+$/);
});
