// Test Link: https://dev.azure.com/Cybersoft-Technologies-Inc/PrimeroEdge%20Classic/_workitems/edit/113440

import { Browser, expect, Locator, Page, test } from '@playwright/test';
import {
  loginToK12Catering,
  navigateK12CateringMenu,
} from '../../utils/helpers';
import { decryptPassword } from '../../utils/crypto';
import { getRequiredEnvVar } from '../../utils/env';
import { getK12CateringLoginUrl } from '../../utils/baseUrl';

test.use({ storageState: { cookies: [], origins: [] } });

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function menuButtonName(action: string, menuName: string): RegExp {
  return new RegExp(`^${action} ${escapeRegExp(menuName)}$`, 'i');
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

async function ensureMenuPage(page: Page): Promise<void> {
  await waitForK12CateringApp(page);
  if (
    !(await page
      .getByRole('heading', { name: 'Menu', exact: true })
      .isVisible()
      .catch(() => false))
  ) {
    await navigateK12CateringMenu(page, 'Menu');
  }

  await expect(
    page.getByRole('heading', { name: 'Menu', exact: true }),
  ).toBeVisible({
    timeout: 15000,
  });
}

async function openManageMenus(page: Page): Promise<void> {
  await ensureMenuPage(page);

  await page.getByRole('button', { name: /^Manage menus$/i }).click();
  await expect(page.getByRole('heading', { name: 'Manage Menus' })).toBeVisible(
    {
      timeout: 10000,
    },
  );
  await expect(page.locator('#new-menu-name-input')).toBeVisible();
}

async function closeManageMenus(page: Page): Promise<void> {
  await page.getByRole('button', { name: /^Done$/ }).click();
  await expect(
    page.getByRole('heading', { name: 'Manage Menus' }),
  ).not.toBeVisible({
    timeout: 10000,
  });
}

async function expectToast(page: Page, message: RegExp): Promise<void> {
  await expect(page.getByText(message).first()).toBeVisible({ timeout: 10000 });
}

async function createMenu(page: Page, menuName: string): Promise<void> {
  await page.locator('#new-menu-name-input').fill(menuName);
  await page.getByRole('button', { name: 'Add new menu' }).click();

  await expectToast(page, /Menu created/i);
  await waitForK12CateringApp(page);

  if (
    !(await page
      .getByRole('heading', { name: 'Manage Menus' })
      .isVisible()
      .catch(() => false))
  ) {
    await openManageMenus(page);
  }

  await expect(
    page.getByRole('button', { name: menuButtonName('Rename', menuName) }),
  ).toBeVisible({ timeout: 10000 });
}

async function renameMenu(
  page: Page,
  currentName: string,
  nextName: string,
): Promise<void> {
  await page
    .getByRole('button', { name: menuButtonName('Rename', currentName) })
    .click();

  const renameInput = page.getByLabel(`Rename ${currentName}`);
  await expect(renameInput).toBeVisible({ timeout: 10000 });
  await renameInput.fill(nextName);

  await page
    .getByRole('button', {
      name: menuButtonName('Save rename for', currentName),
    })
    .click();

  await expectToast(page, /Menu renamed|Menu updated|success/i);
  await expect(
    page.getByRole('button', { name: menuButtonName('Rename', nextName) }),
  ).toBeVisible({ timeout: 10000 });
}

async function deactivateMenu(page: Page, menuName: string): Promise<void> {
  await page
    .getByRole('button', { name: menuButtonName('Deactivate', menuName) })
    .click();

  const confirmDeactivate = page.getByRole('button', { name: /^Deactivate$/ });
  if (await confirmDeactivate.isVisible({ timeout: 3000 }).catch(() => false)) {
    await confirmDeactivate.click();
  }

  await expectToast(page, /Menu deactivated|deactivated|success/i);
  await expect(
    page.getByRole('button', { name: menuButtonName('Activate', menuName) }),
  ).toBeVisible({ timeout: 10000 });
}

async function activateMenu(page: Page, menuName: string): Promise<void> {
  await page
    .getByRole('button', { name: menuButtonName('Activate', menuName) })
    .click();

  const confirmActivate = page.getByRole('button', { name: /^Activate$/ });
  if (await confirmActivate.isVisible({ timeout: 3000 }).catch(() => false)) {
    await confirmActivate.click();
  }

  await expectToast(page, /Menu activated|activated|success/i);
  await expect(
    page.getByRole('button', { name: menuButtonName('Deactivate', menuName) }),
  ).toBeVisible({ timeout: 10000 });
}

async function openManageItems(page: Page, menuName: string): Promise<void> {
  await page
    .getByRole('button', {
      name: new RegExp(`^Manage items in ${escapeRegExp(menuName)}$`, 'i'),
    })
    .click();
  await expect(
    page.getByRole('heading', { name: `Items in "${menuName}"` }),
  ).toBeVisible({ timeout: 10000 });
}

async function returnToManageMenus(page: Page): Promise<void> {
  await page.getByRole('button', { name: /Back to Manage Menus/i }).click();
  await expect(page.getByRole('heading', { name: 'Manage Menus' })).toBeVisible(
    {
      timeout: 10000,
    },
  );
}

async function checkedState(page: Page, itemName: string): Promise<boolean> {
  return page
    .getByRole('checkbox', { name: itemName, exact: true })
    .isChecked();
}

async function setMenuItems(
  page: Page,
  itemNames: string[],
  shouldBeChecked: boolean,
): Promise<void> {
  for (const itemName of itemNames) {
    const checkbox = page.getByRole('checkbox', {
      name: itemName,
      exact: true,
    });
    await expect(checkbox).toBeVisible({ timeout: 10000 });

    if ((await checkbox.isChecked()) !== shouldBeChecked) {
      await checkbox.click();
    }
  }

  await page.getByRole('button', { name: /^Save$/ }).click();
  await expectToast(page, /Menu items updated|Items updated|saved|success/i);
}

async function clearAllMenuItems(page: Page): Promise<void> {
  const checkboxes = await page.getByRole('checkbox').all();

  for (const checkbox of checkboxes) {
    if (await checkbox.isChecked()) {
      await checkbox.click();
    }
  }

  await page.getByRole('button', { name: /^Save$/ }).click();
  await expectToast(page, /Menu items updated|Items updated|saved|success/i);
}

function menuItemCard(page: Page, itemName: string): Locator {
  return page
    .locator('#main-content')
    .getByText(itemName, { exact: true })
    .first();
}

async function refreshMenuPage(page: Page): Promise<void> {
  await page.reload({ waitUntil: 'domcontentloaded' });
  await ensureMenuPage(page);
}

async function verifyMenuItemsAsCustomer(
  browser: Browser,
  itemNames: string[],
): Promise<void> {
  const isUAT = process.env.DIRECT_K12_LOGIN === 'true';
  const email = getRequiredEnvVar(isUAT ? 'K12_UATCUSTOMER_EMAIL' : 'K12_CUSTOMER_EMAIL');
  const password = decryptPassword(
    getRequiredEnvVar(isUAT ? 'K12_UATCUSTOMER_ENCRYPTED_PASSWORD' : 'K12_CUSTOMER_ENCRYPTED_PASSWORD'),
  );

  const customerContext = await browser.newContext();
  const customerPage = await customerContext.newPage();

  try {
    await customerPage.goto(getK12CateringLoginUrl());
    await customerPage.waitForLoadState('domcontentloaded');
    await customerPage.getByRole('textbox', { name: /Email/i }).fill(email);
    await customerPage.getByRole('textbox', { name: /Password/i }).fill(password);
    await customerPage.getByRole('button', { name: /Sign in/i }).click();
    await customerPage.waitForLoadState('networkidle');
    await expect(customerPage).not.toHaveURL(/login/, { timeout: 15000 });

    await customerPage.getByRole('listitem', { name: /Navigate to Menu/i }).click();
    await customerPage.waitForLoadState('domcontentloaded');

    for (const itemName of itemNames) {
      await expect(
        customerPage.locator('#main-content').getByText(itemName, { exact: true }).first(),
      ).toBeVisible({ timeout: 15000 });
    }
  } finally {
    await customerContext.close();
  }
}

async function openDeleteMenuDialog(
  page: Page,
  menuName: string,
): Promise<void> {
  await page
    .getByRole('button', { name: menuButtonName('Delete', menuName) })
    .click();

  await expect(page.getByRole('heading', { name: 'Delete Menu' })).toBeVisible({
    timeout: 10000,
  });
  await expect(page.getByText(`"${menuName}" is the only menu.`)).toBeVisible();
  await expect(
    page.getByText(
      'You can delete it permanently, or deactivate it to hide it from customers (reversible).',
    ),
  ).toBeVisible();
}

async function deactivateFromDeleteDialog(
  page: Page,
  menuName: string,
): Promise<void> {
  await openDeleteMenuDialog(page, menuName);
  await page.getByRole('button', { name: /^Deactivate$/ }).click();
  await expectToast(page, /Menu deactivated|deactivated|success/i);
  await expect(
    page.getByRole('button', { name: menuButtonName('Activate', menuName) }),
  ).toBeVisible({ timeout: 10000 });
}

async function deleteMenuAndExpectBlocked(
  page: Page,
  menuName: string,
): Promise<void> {
  await openDeleteMenuDialog(page, menuName);
  await page
    .getByRole('button', { name: /^Delete$/ })
    .last()
    .click();
  await expectToast(
    page,
    /This menu cannot be deleted because it contains items\. Please clear the items first/i,
  );
}

async function deleteMenuPermanently(
  page: Page,
  menuName: string,
): Promise<void> {
  await page
    .getByRole('button', { name: menuButtonName('Delete', menuName) })
    .click();

  await expect(page.getByRole('heading', { name: 'Delete Menu' })).toBeVisible({
    timeout: 10000,
  });
  await page
    .getByRole('button', { name: /^Delete$/ })
    .last()
    .click();

  await expectToast(page, /Menu deleted/i);
  await expect(
    page.getByRole('button', { name: menuButtonName('Rename', menuName) }),
  ).not.toBeVisible({ timeout: 10000 });
}

test('Catering - Menu - Manage Menus create, rename, toggle, assign items, and delete', async ({
  page,
  browser,
}) => {
  const catering = await loginToK12Catering(page);
  await ensureMenuPage(catering);

  const menuName = `Sabih Testing ${Date.now()}`;
  const renamedMenuName = `${menuName} Updated`;
  const firstItem = 'apple juice';
  const secondItem = 'cola';

  await openManageMenus(catering);
  await createMenu(catering, menuName);

  await renameMenu(catering, menuName, renamedMenuName);
  await closeManageMenus(catering);

  await expect(
    catering.getByText(renamedMenuName, { exact: true }),
  ).toBeVisible({
    timeout: 10000,
  });

  await openManageMenus(catering);
  await deactivateMenu(catering, renamedMenuName);
  await activateMenu(catering, renamedMenuName);

  await openManageItems(catering, renamedMenuName);
  await setMenuItems(catering, [firstItem], true);
  expect(await checkedState(catering, firstItem)).toBe(true);
  await catering.getByRole('button', { name: 'Close modal' }).last().click();

  await refreshMenuPage(catering);
  await expect(menuItemCard(catering, firstItem)).toBeVisible({
    timeout: 10000,
  });

  await openManageMenus(catering);
  await openManageItems(catering, renamedMenuName);
  await setMenuItems(catering, [secondItem], true);
  expect(await checkedState(catering, secondItem)).toBe(true);
  await catering.getByRole('button', { name: 'Close modal' }).last().click();

  await refreshMenuPage(catering);
  await expect(menuItemCard(catering, firstItem)).toBeVisible({
    timeout: 10000,
  });
  await expect(menuItemCard(catering, secondItem)).toBeVisible({
    timeout: 10000,
  });

  await verifyMenuItemsAsCustomer(browser, [firstItem, secondItem]);

  await openManageMenus(catering);
  await deactivateFromDeleteDialog(catering, renamedMenuName);
  await activateMenu(catering, renamedMenuName);

  await deleteMenuAndExpectBlocked(catering, renamedMenuName);

  await openManageItems(catering, renamedMenuName);
  await setMenuItems(catering, [firstItem, secondItem], false);
  await returnToManageMenus(catering);

  await deleteMenuPermanently(catering, renamedMenuName);
  await closeManageMenus(catering);

  await expect(
    catering.getByRole('button', { name: renamedMenuName, exact: true }),
  ).not.toBeVisible({ timeout: 10000 });
});
