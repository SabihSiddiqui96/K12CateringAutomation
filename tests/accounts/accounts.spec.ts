import { test, expect, Page } from '@playwright/test';
import {
  loginToK12Catering,
  navigateK12CateringMenu,
} from '../../utils/helpers';

test.use({ storageState: { cookies: [], origins: [] } });
test.use({ viewport: { width: 1440, height: 900 } });

test.describe('Accounts', () => {
  let catering: Page;

  test.beforeAll(async ({ browser }) => {
    const context = await browser.newContext();
    const page = await context.newPage();
    catering = await loginToK12Catering(page);
  });

  test.beforeEach(async () => {
    await navigateK12CateringMenu(catering, 'Accounts');
    await catering.waitForLoadState('domcontentloaded');

    const closeBtn = catering.getByRole('button', { name: 'Close account details modal' });
    if (await closeBtn.isVisible({ timeout: 1000 }).catch(() => false)) {
      await closeBtn.click();
      await expect(closeBtn).not.toBeVisible({ timeout: 5000 });
    }
  });

  const accountCards = () =>
    catering.getByRole('listitem').filter({
      has: catering.getByRole('button', { name: /View details for/i }),
    });

  // Pending accounts show Approve/Reject instead of the Actions kebab
  const actionableCard = () =>
    accountCards().filter({
      has: catering.getByRole('button', { name: /Actions for/i }),
    }).first();

  test('Accounts - Page heading, stat cards and list are visible', async () => {
    await expect(catering.locator('h1')).toContainText('Account Management');
    await expect(catering.getByText('Manage user accounts and permissions')).toBeVisible();
    await expect(catering.getByRole('button', { name: /Total accounts:.*Click to show all accounts/i })).toBeVisible();
    await expect(catering.getByRole('region', { name: /^Pending accounts:/ })).toBeVisible();
    await expect(catering.getByRole('region', { name: /^Active accounts:/ })).toBeVisible();
    await expect(catering.getByRole('region', { name: /^Inactive accounts:/ })).toBeVisible();
    await expect(catering.getByRole('region', { name: /^Rejected accounts:/ })).toBeVisible();
    await expect(catering.getByRole('heading', { name: 'Accounts List' })).toBeVisible();
    await expect(catering.getByRole('region', { name: 'Accounts list' })).toBeVisible();
  });

  test('Accounts - Account cards display details, actions and pagination', async () => {
    const firstCard = accountCards().first();
    await expect(firstCard).toBeVisible();
    await expect(firstCard.getByText('Role')).toBeVisible();
    await expect(firstCard.getByText('Email')).toBeVisible();
    await expect(firstCard.getByRole('button', { name: /View details for/i })).toBeVisible();
    await expect(actionableCard().getByRole('button', { name: /Actions for/i })).toBeVisible();

    await expect(catering.getByRole('button', { name: 'Page 1' }).first()).toBeVisible();
    await expect(catering.getByRole('button', { name: 'Next page' }).first()).toBeVisible();
  });

  test('Accounts - Search and filter dropdowns work correctly', async () => {
    const searchBox = catering.getByRole('textbox', { name: 'Search accounts by name, username, or email' });
    await expect(searchBox).toBeVisible();
    await searchBox.fill('demo');
    await expect(searchBox).toHaveValue('demo');

    await catering.getByRole('button', { name: 'Filter accounts by status' }).click();
    const listbox = catering.getByRole('listbox');
    await expect(listbox.getByRole('option', { name: 'All Status', exact: true })).toBeVisible();
    await expect(listbox.getByRole('option', { name: 'Active', exact: true })).toBeVisible();
    await expect(listbox.getByRole('option', { name: 'Pending', exact: true })).toBeVisible();
    await listbox.getByRole('option', { name: 'Active', exact: true }).click();
    await catering.waitForLoadState('domcontentloaded');
    await expect(catering.locator('[role="status"]').filter({ hasText: 'Pending' })).toHaveCount(0);
  });

  test('Accounts - Actions kebab menu opens and can be dismissed', async () => {
    await actionableCard()
      .getByRole('button', { name: /Actions for/i })
      .click();
    await expect(catering.getByRole('menuitem', { name: 'Deactivate Account' })).toBeVisible({ timeout: 5000 });
    await expect(catering.getByRole('menuitem', { name: 'Change Password' })).toBeVisible();
    await catering.keyboard.press('Escape');
    await expect(catering.getByRole('menuitem', { name: 'Deactivate Account' })).not.toBeVisible();
  });

  test('Accounts - Account Details modal opens with all sections and closes correctly', async () => {
    // Use an active account (one with an Actions kebab)
    await actionableCard()
      .getByRole('button', { name: /View details for/i })
      .click();
    await expect(catering.getByRole('heading', { name: 'Account Details' })).toBeVisible();
    await expect(catering.getByText('Manage user information and permissions')).toBeVisible();
    await expect(catering.getByRole('heading', { name: 'Basic Information' })).toBeVisible();
    await expect(catering.locator('#firstName-input')).toBeVisible();
    await expect(catering.getByRole('heading', { name: 'Account Information' })).toBeVisible();
    await expect(catering.locator('#username-input')).toBeVisible();
    await expect(catering.getByRole('heading', { name: 'Work Information' })).toBeVisible();
    await expect(catering.getByRole('heading', { name: 'Account Status' })).toBeVisible();
    await expect(catering.getByRole('heading', { name: 'User Role' })).toBeVisible();
    await expect(catering.getByRole('button', { name: 'Deactivate Account' })).toBeVisible();
    await expect(catering.getByRole('button', { name: 'Update Details' })).toBeVisible();

    await catering.getByRole('button', { name: 'Close account details modal' }).click();
    await expect(catering.getByRole('heading', { name: 'Account Details' })).not.toBeVisible();
    await expect(catering.getByRole('heading', { name: 'Account Management' })).toBeVisible();
  });

  const cardNames = async () =>
    (await accountCards().getByRole('heading', { level: 3 }).allInnerTexts()).map((n) => n.trim());

  const expectAscending = (names: string[]) => {
    const sorted = [...names].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));
    expect(names, 'accounts are listed A-Z').toEqual(sorted);
  };

  test('Accounts - Name A-Z sorts the list and the order holds on the next page', async () => {
    // The search test above leaves its filters on the shared page.
    await catering.getByRole('textbox', { name: 'Search accounts by name, username, or email' }).fill('');
    await catering.getByRole('button', { name: 'Filter accounts by status' }).click();
    await catering.getByRole('listbox').getByRole('option', { name: 'All Status', exact: true }).click();
    await catering.getByRole('button', { name: 'Sort accounts' }).click();
    await catering.getByRole('option', { name: 'Name A-Z' }).click();
    await expect(catering.getByRole('button', { name: 'Sort accounts' })).toContainText('Name A-Z');

    await expect(accountCards().first()).toBeVisible();
    const firstPage = await cardNames();
    expect(firstPage.length).toBeGreaterThan(1);
    expectAscending(firstPage);

    const next = catering.getByRole('button', { name: 'Next page' });
    test.skip(await next.isDisabled(), 'only one page of accounts');
    await next.click();
    await expect(catering.getByRole('button', { name: 'Sort accounts' })).toContainText('Name A-Z');
    await expect.poll(async () => (await cardNames())[0]).not.toBe(firstPage[0]);
    const secondPage = await cardNames();
    expectAscending(secondPage);
    expectAscending([firstPage[firstPage.length - 1], secondPage[0]]);
  });

  test('Accounts - User names show as First Last on Dashboard, Accounts and Reports', async () => {
    await navigateK12CateringMenu(catering, 'My Profile');
    const field = (label: string) =>
      catering.getByRole('group', { name: label }).getByRole('paragraph').first();
    await expect(field('First name field')).not.toBeEmpty();
    const first = (await field('First name field').innerText()).trim();
    const last = (await field('Last name field').innerText()).trim();
    const fullName = `${first} ${last}`;
    const profileButton = catering.getByRole('button', { name: `View profile for ${fullName}` });

    for (const page of ['Dashboard', 'Accounts', 'Reports']) {
      await navigateK12CateringMenu(catering, page);
      await expect(profileButton, `header name on ${page}`).toBeVisible();
    }

    await navigateK12CateringMenu(catering, 'Dashboard');
    await expect(catering.getByText(`Welcome back, ${fullName}!`)).toBeVisible();

    // Each account card's name is that account's first and last name.
    await navigateK12CateringMenu(catering, 'Accounts');
    await expect(accountCards().first()).toBeVisible();
    const names = await cardNames();
    for (let i = 0; i < Math.min(3, names.length); i++) {
      const name = names[i];
      await accountCards().nth(i).getByRole('button', { name: `View details for ${name}`, exact: true }).click();
      const firstBox = catering.getByRole('textbox', { name: 'First Name *' });
      await expect(firstBox).not.toHaveValue('');
      const lastValue = await catering.getByRole('textbox', { name: 'Last Name *' }).inputValue();
      expect(`${(await firstBox.inputValue()).trim()} ${lastValue.trim()}`).toBe(name);
      await catering.getByRole('button', { name: 'Close account details modal' }).click();
      await expect(firstBox).not.toBeVisible();
    }
  });
});
