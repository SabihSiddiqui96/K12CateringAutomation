// Test Link: https://dev.azure.com/Cybersoft-Technologies-Inc/PrimeroEdge%20Classic/_workitems/edit/113440

import { Browser, expect, Locator, Page, test } from '@playwright/test';
import {
  loginToK12Catering,
  navigateK12CateringMenu,
  getCustomerAccountEmail,
  registerReleaseNotificationHandler,
} from '../../utils/helpers';
import { decryptPassword } from '../../utils/crypto';
import { getEnvVar, getRequiredEnvVar } from '../../utils/env';
import { getK12CateringLoginUrl } from '../../utils/baseUrl';
import { resetCustomerPasswordFromAccounts } from '../../utils/accountFlow';
import { switchToCustomerDistrict } from '../../utils/dataSync';

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

function randomThreeDigits(): number {
  return Math.floor(100 + Math.random() * 900);
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
  const checkboxes = page.getByRole('checkbox');
  const checkboxCount = await checkboxes.count();
  let changed = false;

  for (let i = 0; i < checkboxCount; i++) {
    const checkbox = checkboxes.nth(i);
    if (await checkbox.isChecked()) {
      await checkbox.click();
      changed = true;
    }
  }

  if (changed) {
    await page.getByRole('button', { name: /^Save$/ }).click();
    await expectToast(page, /Menu items updated|Items updated|saved|success/i);
  }

  for (let i = 0; i < checkboxCount; i++) {
    await expect(checkboxes.nth(i)).not.toBeChecked();
  }
}

async function clearMenuItemsBeforeDelete(
  page: Page,
  menuName: string,
  itemNames: string[],
): Promise<void> {
  await openManageItems(page, menuName);
  await setMenuItems(page, itemNames, false);
  await clearAllMenuItems(page);
  await returnToManageMenus(page);
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

async function expectMenuDropdownRenamed(
  page: Page,
  currentName: string,
  previousName: string,
): Promise<void> {
  await ensureMenuPage(page);
  await expect(
    page.getByRole('button', { name: /^Manage Menus$/i }),
  ).toBeVisible({ timeout: 10000 });

  const menuDropdown = page.locator('#admin-menu-select');
  await expect(menuDropdown).toBeVisible({ timeout: 10000 });
  await menuDropdown.click();

  await expect
    .poll(async () => {
      const nativeOptionTexts = await page
        .locator('#admin-menu-select option')
        .allTextContents();
      if (nativeOptionTexts.some((text) => text.trim() === currentName)) {
        return true;
      }

      return page
        .getByRole('option', { name: currentName, exact: true })
        .or(page.getByRole('menuitem', { name: currentName, exact: true }))
        .or(page.getByText(currentName, { exact: true }))
        .first()
        .isVisible()
        .catch(() => false);
    })
    .toBe(true);

  await expect
    .poll(async () => {
      const nativeOptionTexts = await page
        .locator('#admin-menu-select option')
        .allTextContents();
      if (nativeOptionTexts.some((text) => text.trim() === previousName)) {
        return true;
      }

      return page
        .getByRole('option', { name: previousName, exact: true })
        .or(page.getByRole('menuitem', { name: previousName, exact: true }))
        .first()
        .isVisible()
        .catch(() => false);
    })
    .toBe(false);

  await page.keyboard.press('Escape').catch(() => { });
}

async function verifyMenuItemsAsCustomer(
  browser: Browser,
  itemNames: string[],
  passwordOverride?: string,
  emailOverride?: string,
): Promise<void> {
  const isUAT = getEnvVar('DIRECT_K12_LOGIN', { required: false }) === 'true';
  const email =
    emailOverride ??
    getRequiredEnvVar(isUAT ? 'K12_UATCUSTOMER_EMAIL' : 'K12_CUSTOMER_EMAIL');
  const password = passwordOverride ?? decryptPassword(
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
    // Dismiss the "Now Available" What's-New modal that blocks sidebar clicks.
    await registerReleaseNotificationHandler(customerPage);

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
  await expect(
    page
      .getByText(`"${menuName}" is the only menu.`)
      .or(page.getByText(/Are you sure you want to delete this menu\?/i)),
  ).toBeVisible({ timeout: 10000 });
}

async function deactivateFromDeleteDialog(
  page: Page,
  menuName: string,
): Promise<void> {
  await openDeleteMenuDialog(page, menuName);
  const deactivateButton = page.getByRole('button', { name: /^Deactivate$/ });
  if (await deactivateButton.isVisible({ timeout: 2000 }).catch(() => false)) {
    await deactivateButton.click();
  } else {
    const deleteDialog = page.getByRole('dialog', { name: /Delete Menu/i });
    await deleteDialog.getByRole('button', { name: /^Cancel$/ }).click();
    await expect(page.getByRole('heading', { name: 'Delete Menu' })).not.toBeVisible({
      timeout: 10000,
    });
    await deactivateMenu(page, menuName);
    return;
  }

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

// Guaranteed teardown: remove whatever "<num> - SabihTesting" menu THIS run
// created so it doesn't pile up under Manage Menus when the test fails midway
// (e.g. the launcher kicks the session before the happy-path delete). Pass both
// the original and renamed names — only one will still exist; the other's Delete
// button simply won't be present and is skipped. This runs from a finally block,
// so it must NEVER throw (that would mask the real test failure) — everything is
// best-effort and swallowed.
async function cleanupTestMenu(
  page: Page,
  candidateNames: string[],
): Promise<void> {
  try {
    // The run may have failed anywhere (launcher page, a stray modal); recover
    // quietly back to Manage Menus, and bail silently if we can't.
    await page.keyboard.press('Escape').catch(() => { });
    await ensureMenuPage(page);

    if (
      !(await page
        .getByRole('heading', { name: 'Manage Menus' })
        .isVisible()
        .catch(() => false))
    ) {
      await openManageMenus(page);
    }

    for (const name of candidateNames) {
      const deleteButton = page.getByRole('button', {
        name: menuButtonName('Delete', name),
      });
      if (
        !(await deleteButton.isVisible({ timeout: 3000 }).catch(() => false))
      ) {
        continue; // not created, or already deleted by the happy path
      }

      // A menu with items can't be deleted, so clear them first:
      // Manage items -> uncheck everything -> Save -> Back to Manage Menus.
      try {
        await openManageItems(page, name);
        await clearAllMenuItems(page);
        await returnToManageMenus(page);
      } catch {
        // already empty / couldn't open items — fall through and try delete
      }

      // Delete the menu and confirm in the "Delete Menu" dialog.
      try {
        await deleteMenuPermanently(page, name);
      } catch {
        // best-effort: leave it rather than fail the run
      }
    }

    await closeManageMenus(page).catch(() => { });
  } catch {
    // Teardown only — swallow everything so the real test result stands.
  }
}

test('Catering - Menu - Manage Menus create, rename, toggle, assign items, and delete', async ({
  page,
  browser,
}) => {
  // Long end-to-end flow (create/rename/toggle/assign items/customer-side
  // verify/delete) that runs much slower in CI; give it ample headroom so it
  // doesn't trip the default per-test timeout there.
  test.setTimeout(6 * 60 * 1000);

  const catering = await loginToK12Catering(page);
  // Build/assign the menu in the customer's district (Alief ISD on UAT) so the
  // demo customer who lives there can actually see the items. No-op on QA.
  await switchToCustomerDistrict(catering);
  await ensureMenuPage(catering);

  const menuNumber = randomThreeDigits();
  const renamedMenuNumber = menuNumber === 999 ? 100 : menuNumber + 1;
  const menuName = `${menuNumber} - SabihTesting`;
  const renamedMenuName = `${renamedMenuNumber} - SabihTesting`;
  const customerPassword = 'Password1!';

  try {
    await openManageMenus(catering);
    await createMenu(catering, menuName);

    await renameMenu(catering, menuName, renamedMenuName);
    await closeManageMenus(catering);

    await expectMenuDropdownRenamed(catering, renamedMenuName, menuName);

    await openManageMenus(catering);
    await deactivateMenu(catering, renamedMenuName);
    await activateMenu(catering, renamedMenuName);

    // Pick the first two available menu items dynamically (the QA catalog
    // changes over time — hardcoded names like "apple juice" go stale).
    await openManageItems(catering, renamedMenuName);
    const checkboxes = catering.getByRole('checkbox');
    await expect(checkboxes.first()).toBeVisible({ timeout: 10000 });
    const checkboxCount = await checkboxes.count();
    const itemNames: string[] = [];
    for (let i = 0; i < checkboxCount && itemNames.length < 2; i++) {
      const name =
        (await checkboxes.nth(i).getAttribute('aria-label')) ??
        (await checkboxes.nth(i).getAttribute('name'));
      const cleaned = (name ?? '').trim();
      // Skip junk/ambiguous catalog entries: a numeric-only or 1-char name
      // (e.g. "12") makes a brittle exact-text match downstream and may not
      // even render on the customer menu. Prefer descriptive item names.
      const isDescriptive = /[a-z]/i.test(cleaned) && cleaned.length >= 2;
      if (isDescriptive && !itemNames.includes(cleaned)) itemNames.push(cleaned);
    }
    expect(
      itemNames.length,
      'Expected at least 2 menu items in the manage-items dialog',
    ).toBeGreaterThanOrEqual(2);
    const [firstItem, secondItem] = itemNames;

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

    // Demo customer for the customer-side verification (QA: SabihQATesting,
    // UAT: SiddiquiUATTesting under Alief ISD).
    const customerEmail = getCustomerAccountEmail();
    await resetCustomerPasswordFromAccounts(catering, customerEmail, customerPassword);
    await verifyMenuItemsAsCustomer(
      browser,
      [firstItem, secondItem],
      customerPassword,
      customerEmail,
    );

    await openManageMenus(catering);
    await deactivateFromDeleteDialog(catering, renamedMenuName);
    await activateMenu(catering, renamedMenuName);

    await clearMenuItemsBeforeDelete(catering, renamedMenuName, [
      firstItem,
      secondItem,
    ]);

    await deleteMenuPermanently(catering, renamedMenuName);
    await closeManageMenus(catering);

    await expect(
      catering.getByRole('button', { name: renamedMenuName, exact: true }),
    ).not.toBeVisible({ timeout: 10000 });
  } finally {
    // Always remove the menu this run created — covers the case where the test
    // failed before the happy-path delete above, so it never lingers under
    // Manage Menus. (If the delete already ran, neither name is found and this
    // is a no-op.)
    await cleanupTestMenu(catering, [renamedMenuName, menuName]);
  }
});
