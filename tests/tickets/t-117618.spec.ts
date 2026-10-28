// Test Link… 117618 — Catering > Menus

import { expect, Locator, Page, test } from '@playwright/test';
import { loginToK12Catering } from '../../utils/helpers';
import { selectTheRealMenu, escapeRegExp } from '../../utils/dataSync';

test.use({ storageState: { cookies: [], origins: [] } });

const ORIGINAL_MENU = 'TheRealMenu';

function menuButtonName(action: string, menuName: string): RegExp {
  return new RegExp(`^${action} ${escapeRegExp(menuName)}$`, 'i');
}

function randomFourDigits(): number {
  return Math.floor(1000 + Math.random() * 9000);
}

// Re-auth through the PrimeroEdge launcher token-refresh page if it appeared
async function reauthIfLauncher(page: Page): Promise<void> {
  const link = page.locator('a[href*="/login?token="]').first();
  if (await link.isVisible({ timeout: 1500 }).catch(() => false)) {
    await link.click();
    await page.waitForLoadState('domcontentloaded');
    await expect(
      page.locator('aside[aria-label="Main navigation"]'),
    ).toBeVisible({ timeout: 30000 });
  }
}

async function ensureMenuPage(page: Page): Promise<void> {
  await reauthIfLauncher(page);
  await expect(
    page.getByRole('heading', { name: 'Menu', exact: true }),
  ).toBeVisible();
}

// The menu-item names currently on the selected menu (read from the "Edit <name> menu item"
async function menuItemNames(page: Page): Promise<string[]> {
  await page
    .getByText(/Loading Menu/i)
    .waitFor({ state: 'hidden', timeout: 15000 })
    .catch(() => { });
  const editButtons = page
    .locator('#main-content')
    .getByRole('button', { name: /^Edit .+ menu item$/i });
  await editButtons
    .first()
    .waitFor({ state: 'visible', timeout: 15000 })
    .catch(() => { });
  const labels = await editButtons.evaluateAll((els) =>
    els.map((e) => e.getAttribute('aria-label') || ''),
  );
  const names = new Set<string>();
  for (const label of labels) {
    const m = label.match(/^Edit\s+(.+?)\s+menu item$/i);
    if (m) names.add(m[1].trim());
  }
  return [...names].sort();
}

// Pick the menu shown on the Menu page from the top-right dropdown (#admin-menu-select).
async function selectMenuFromDropdown(page: Page, name: string): Promise<void> {
  await ensureMenuPage(page);
  const select = page.locator('#admin-menu-select');
  await expect(select).toBeVisible();

  const isNative = await select
    .evaluate((el) => el.tagName.toLowerCase() === 'select')
    .catch(() => false);
  if (isNative) {
    await select.selectOption({ label: name }).catch(async () => {
      await select.click();
      await page
        .getByRole('option', { name: new RegExp(`^${escapeRegExp(name)}$`, 'i') })
        .first()
        .click();
    });
  } else {
    await select.click();
    await page
      .getByRole('option', { name: new RegExp(`^${escapeRegExp(name)}$`, 'i') })
      .first()
      .click();
  }
  await page
    .getByText(/Loading Menu/i)
    .waitFor({ state: 'hidden', timeout: 15000 })
    .catch(() => { });
  await page.waitForTimeout(600);
}

async function openManageMenus(page: Page): Promise<void> {
  await ensureMenuPage(page);
  if (
    await page
      .getByRole('heading', { name: 'Manage Menus' })
      .isVisible()
      .catch(() => false)
  ) {
    return;
  }
  await page.getByRole('button', { name: /^Manage menus$/i }).click();
  await expect(page.getByRole('heading', { name: 'Manage Menus' })).toBeVisible({
    timeout: 10000,
  });
}

async function closeManageMenus(page: Page): Promise<void> {
  const done = page.getByRole('button', { name: /^Done$/ });
  if (await done.isVisible().catch(() => false)) {
    await done.click().catch(() => { });
  }
  await page
    .getByRole('heading', { name: 'Manage Menus' })
    .waitFor({ state: 'hidden', timeout: 8000 })
    .catch(() => { });
}

// Confirm the duplicate exists (its Manage Menus row).
async function ensureDuplicateExists(
  page: Page,
  originalName: string,
  dupName: string,
): Promise<void> {
  for (let attempt = 0; attempt < 3; attempt++) {
    await reauthIfLauncher(page);
    await openManageMenus(page);
    if (
      await page
        .getByRole('button', { name: menuButtonName('Rename', dupName) })
        .isVisible({ timeout: 6000 })
        .catch(() => false)
    ) {
      return;
    }
    // Not there — the launcher likely ate the submit. Create it again.
    await page
      .getByRole('button', { name: menuButtonName('Duplicate', originalName) })
      .click();
    if (
      !(await page
        .getByRole('heading', { name: `Duplicate "${originalName}"` })
        .isVisible({ timeout: 8000 })
        .catch(() => false))
    ) {
      continue;
    }
    await page.locator('#duplicate-menu-name').fill(dupName);
    await page.getByRole('button', { name: /^Create menu$/i }).click();
    await page
      .getByText(/Menu (created|duplicated)|duplicated/i)
      .first()
      .waitFor({ state: 'visible', timeout: 5000 })
      .catch(() => { });
    await reauthIfLauncher(page);
  }
  await openManageMenus(page);
  await expect(
    page.getByRole('button', { name: menuButtonName('Rename', dupName) }),
  ).toBeVisible();
}

// Open the Add-Items pop-up ("Items in <menu>") for a menu and wait for it to load.
async function openItemsDialog(page: Page, menuName: string): Promise<void> {
  await openManageMenus(page);
  await page
    .getByRole('button', { name: menuButtonName('Manage items in', menuName) })
    .click();
  await expect(
    page.getByRole('heading', { name: `Items in "${menuName}"` }),
  ).toBeVisible();
  await page
    .getByRole('checkbox')
    .first()
    .waitFor({ state: 'visible', timeout: 10000 })
    .catch(() => { });
}

async function checkboxStats(
  page: Page,
): Promise<{ total: number; checked: number }> {
  const stats = await page.getByRole('checkbox').evaluateAll((els) => ({
    total: els.length,
    checked: els.filter((e) => (e as HTMLInputElement).checked).length,
  }));
  return stats;
}

// Click a "Sort ..." button and confirm the per-menu prompt.
async function startPerMenuSort(page: Page, button: RegExp, heading: string): Promise<Locator> {
  await page.locator('#main-content').getByRole('button', { name: button }).first().click()
    .catch(() => page.getByRole('button', { name: button }).first().click());
  await page.getByRole('button', { name: 'Sort for this menu' }).click();
  const title = page.getByRole('heading', { name: heading, exact: true });
  await expect(title).toBeVisible();
  return page.locator('[role="dialog"], .fixed').filter({ has: title }).last();
}

async function categoryOrder(page: Page): Promise<string[]> {
  const handles = page.getByRole('button', { name: /^Drag to reorder .+ category$/ });
  await expect(handles.first()).toBeVisible();
  const labels = await handles
    .evaluateAll((els) => els.map((e) => e.getAttribute('aria-label') ?? ''));
  return labels.map((l) => l.replace(/^Drag to reorder (.+) category$/, '$1'));
}

async function itemOrder(page: Page): Promise<string[]> {
  const handles = page.getByRole('button', { name: 'Drag to reorder menu item', exact: true });
  await expect(handles.first()).toBeVisible();
  const rows = await handles.evaluateAll((els) =>
    els.map((e) => (e.parentElement?.innerText ?? '').replace(/\s+/g, ' ').trim()));
  // Row text is "<position> <name> $<price>".
  return rows.map((r) => r.replace(/^\d+\s+/, '').replace(/\s+\$[\d.,]+$/, ''));
}

// Move the first drag handle one place down with the keyboard sensor.
async function moveFirstDown(handles: Locator): Promise<void> {
  const first = handles.first();
  await first.focus();
  await first.press('Space');
  await first.page().waitForTimeout(200);
  await first.page().keyboard.press('ArrowDown');
  await first.page().waitForTimeout(200);
  await first.page().keyboard.press('Space');
  await first.page().waitForTimeout(500);
}

const swapFirstTwo = (list: string[]) => [list[1], list[0], ...list.slice(2)];

// Best-effort teardown: delete the duplicate directly.
async function deleteMenu(page: Page, menuName: string): Promise<void> {
  try {
    await openManageMenus(page);
    const deleteBtn = page.getByRole('button', {
      name: menuButtonName('Delete', menuName),
    });
    if (!(await deleteBtn.isVisible({ timeout: 3000 }).catch(() => false))) {
      return; // never created, or already deleted by the test
    }
    await deleteBtn.click();
    await expect(
      page.getByRole('heading', { name: 'Delete Menu' }),
    ).toBeVisible({ timeout: 8000 });
    await page.getByRole('button', { name: /^Delete$/ }).last().click();
    await page
      .getByText(/Menu deleted/i)
      .first()
      .waitFor({ state: 'visible', timeout: 10000 })
      .catch(() => { });
  } catch {
    // teardown only — swallow
  }
}

test('Catering - Menus - Duplicate menu copies the same items (original unchanged) and Select all selects every item', async ({
  page,
}) => {
  test.setTimeout(6 * 60 * 1000);

  const catering = await loginToK12Catering(page, { navigateTo: 'Menu' });
  await selectTheRealMenu(catering);

  const dupName = `Dup117618-${randomFourDigits()}`;
  // Captured in the first step, compared against in two later ones.
  let originalItems: string[] = [];

  try {
    await test.step('Capture the original menu\'s items', async () => {
      await selectMenuFromDropdown(catering, ORIGINAL_MENU);
      originalItems = await menuItemNames(catering);
      expect(
        originalItems.length,
        `${ORIGINAL_MENU} should have menu items to copy`,
      ).toBeGreaterThan(0);
    });

    await test.step('Duplicate the menu', async () => {
      await openManageMenus(catering);
      await expect(
        catering.getByRole('button', {
          name: menuButtonName('Duplicate', ORIGINAL_MENU),
        }),
      ).toBeVisible();
      await catering
        .getByRole('button', { name: menuButtonName('Duplicate', ORIGINAL_MENU) })
        .click();

      await expect(
        catering.getByRole('heading', { name: `Duplicate "${ORIGINAL_MENU}"` }),
      ).toBeVisible();
      const dupNameInput = catering.locator('#duplicate-menu-name');
      await expect(dupNameInput).toBeVisible();

      // A new name is required
      const createBtn = catering.getByRole('button', { name: /^Create menu$/i });
      await dupNameInput.fill('');
      if (await createBtn.isDisabled().catch(() => false)) {
        await expect(createBtn).toBeDisabled();
      } else {
        await createBtn.click();
        await expect(dupNameInput).toBeVisible(); // still on the prompt — not created
      }

      // Enter a unique name and create the copy.
      await dupNameInput.fill(dupName);
      await createBtn.click();
      await catering
        .getByText(/Menu (created|duplicated)|duplicated/i)
        .first()
        .waitFor({ state: 'visible', timeout: 5000 })
        .catch(() => { });
      await reauthIfLauncher(catering);
      await ensureDuplicateExists(catering, ORIGINAL_MENU, dupName);
      await closeManageMenus(catering);
    });

    await test.step('The copy has the SAME items as the original', async () => {
      await selectMenuFromDropdown(catering, dupName);
      const dupItems = await menuItemNames(catering);
      expect(dupItems).toEqual(originalItems);
    });

    await test.step('The original is unchanged', async () => {
      await selectMenuFromDropdown(catering, ORIGINAL_MENU);
      const originalAfter = await menuItemNames(catering);
      expect(originalAfter).toEqual(originalItems);
    });

    await test.step('Category and item order are saved per menu', async () => {
      // The original's orders, read without saving anything.
      await selectMenuFromDropdown(catering, ORIGINAL_MENU);
      await startPerMenuSort(catering, /^Sort category order$/, 'Sort Categories');
      const originalCategories = await categoryOrder(catering);
      expect(originalCategories.length, 'at least two categories to reorder').toBeGreaterThan(1);
      await catering.getByRole('button', { name: 'Cancel', exact: true }).click();

      const sortItemsButtons = await catering
        .locator('#main-content')
        .getByRole('button', { name: /^Sort menu items in / })
        .evaluateAll((els) => els.map((e) => e.getAttribute('aria-label') ?? ''));
      let category = '';
      let originalItems: string[] = [];
      for (const label of sortItemsButtons) {
        await startPerMenuSort(catering, new RegExp(`^${escapeRegExp(label)}$`), 'Sort Menu Items');
        const items = await itemOrder(catering);
        await catering.getByRole('button', { name: 'Close', exact: true }).click();
        if (items.length > 1) {
          category = label.replace(/^Sort menu items in /, '');
          originalItems = items;
          break;
        }
      }
      expect(category, 'a category with at least two items').not.toBe('');
      const sortItemsIn = new RegExp(`^Sort menu items in ${escapeRegExp(category)}$`);

      // Reorder both on the copy.
      await selectMenuFromDropdown(catering, dupName);
      await startPerMenuSort(catering, /^Sort category order$/, 'Sort Categories');
      const dupCategories = await categoryOrder(catering);
      await moveFirstDown(catering.getByRole('button', { name: /^Drag to reorder .+ category$/ }));
      await expect.poll(() => categoryOrder(catering)).toEqual(swapFirstTwo(dupCategories));
      await catering.getByRole('button', { name: 'Save Order' }).click();
      await expect(catering.getByRole('heading', { name: 'Sort Categories', exact: true })).not.toBeVisible();

      await startPerMenuSort(catering, sortItemsIn, 'Sort Menu Items');
      const dupItems = await itemOrder(catering);
      await moveFirstDown(catering.getByRole('button', { name: 'Drag to reorder menu item', exact: true }));
      await expect.poll(() => itemOrder(catering)).toEqual(swapFirstTwo(dupItems));
      await catering.getByRole('button', { name: 'Close', exact: true }).click();

      // The copy kept the new order.
      await selectMenuFromDropdown(catering, ORIGINAL_MENU);
      await selectMenuFromDropdown(catering, dupName);
      await startPerMenuSort(catering, /^Sort category order$/, 'Sort Categories');
      expect(await categoryOrder(catering)).toEqual(swapFirstTwo(dupCategories));
      await catering.getByRole('button', { name: 'Cancel', exact: true }).click();
      await startPerMenuSort(catering, sortItemsIn, 'Sort Menu Items');
      expect(await itemOrder(catering)).toEqual(swapFirstTwo(dupItems));
      await catering.getByRole('button', { name: 'Close', exact: true }).click();

      // The original did not change.
      await selectMenuFromDropdown(catering, ORIGINAL_MENU);
      await startPerMenuSort(catering, /^Sort category order$/, 'Sort Categories');
      expect(await categoryOrder(catering), 'original category order').toEqual(originalCategories);
      await catering.getByRole('button', { name: 'Cancel', exact: true }).click();
      await startPerMenuSort(catering, sortItemsIn, 'Sort Menu Items');
      expect(await itemOrder(catering), 'original item order').toEqual(originalItems);
      await catering.getByRole('button', { name: 'Close', exact: true }).click();
    });

    await test.step('"Sort Items" per-menu warning (ADO 117618 comment)', async () => {
      // The per-category "Sort menu items in <category>" dialog warns the reorder applies to THIS
      const sortItemsBtn = catering
        .locator('#main-content')
        .getByRole('button', { name: /^Sort menu items in /i })
        .first();
      await expect(sortItemsBtn).toBeVisible();
      await sortItemsBtn.click();
      const sortDialog = catering.getByRole('dialog').first();
      await expect(
        sortDialog.getByRole('heading', { name: /Sort menu item order/i }),
      ).toBeVisible();
      await expect(sortDialog).toContainText(
        /This will only update the display order of items in the .+ category of .+/i,
      );
      await expect(sortDialog).toContainText(
        /go to the editing mode for All Items at the top of the screen/i,
      );
      await sortDialog.getByRole('button', { name: /^Cancel$/i }).click();
      await expect(sortDialog).not.toBeVisible({ timeout: 8000 });
    });

    await test.step('"Select all" in the Add-Items pop-up (run on the throwaway duplicate)', async () => {
      await openItemsDialog(catering, dupName);
      const before = await checkboxStats(catering);
      expect(before.total).toBeGreaterThan(0);

      await catering.getByRole('button', { name: /^Select all$/i }).click();
      await expect
        .poll(async () => (await checkboxStats(catering)).checked)
        .toBe(before.total);

      // Deselect one item — only the still-selected items should be saved.
      const firstCheckbox = catering.getByRole('checkbox').first();
      const deselectedName =
        (await firstCheckbox.getAttribute('aria-label')) ?? '(first item)';
      await firstCheckbox.uncheck();
      await expect
        .poll(async () => (await checkboxStats(catering)).checked)
        .toBe(before.total - 1);

      await catering.getByRole('button', { name: /^Save$/ }).click();
      await expect(
        catering.getByText(/updated|saved|success/i).first(),
      ).toBeVisible();

      // Re-open the pop-up
      await ensureMenuPage(catering);
      await openItemsDialog(catering, dupName);
      const after = await checkboxStats(catering);
      expect(after.total).toBe(before.total);
      expect(
        after.checked,
        `Expected all but the deselected "${deselectedName}" to be saved`,
      ).toBe(before.total - 1);
      await catering.getByRole('button', { name: /Back to Manage Menus/i }).click();
      await expect(
        catering.getByRole('heading', { name: 'Manage Menus' }),
      ).toBeVisible({ timeout: 8000 });
    });

    await test.step('Delete-with-items just deletes (ADO 117618 comment)', async () => {
      // The duplicate still has items (Select all added them).
      await catering
        .getByRole('button', { name: menuButtonName('Delete', dupName) })
        .click();
      await expect(
        catering.getByRole('heading', { name: 'Delete Menu' }),
      ).toBeVisible();
      await catering.getByRole('button', { name: /^Delete$/ }).last().click();
      await expect(
        catering.getByText(/Menu deleted/i).first(),
      ).toBeVisible({ timeout: 12000 });
      await expect(
        catering.getByText(
          /cannot be deleted|clear the items first|remove items first/i,
        ),
      ).toHaveCount(0);
      await closeManageMenus(catering);
    });

  } finally {
    // Backup cleanup if the test failed before the delete step above.
    await deleteMenu(catering, dupName);
  }
});
