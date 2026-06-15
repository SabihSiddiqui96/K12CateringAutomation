// Test Link: https://dev.azure.com/Cybersoft-Technologies-Inc/PrimeroEdge%20Classic/_workitems/edit/117618
//
// 117618 — Catering > Menus: duplicate a menu (the copy must have the SAME items
// as the original, and the original must be unchanged) and the "Select all" button
// in the Add-Items pop-up. The duplicate this test creates is removed in a finally
// block so it never lingers under Manage Menus.

import { expect, Page, test } from '@playwright/test';
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

// Re-auth through the PrimeroEdge launcher token-refresh page if it appeared,
// without pressing Escape (which would close our menu modals).
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
  ).toBeVisible({ timeout: 15000 });
}

// The menu-item names currently on the selected menu (read from the "Edit <name>
// menu item" card buttons), trimmed + de-duped + sorted for a stable compare.
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
  await expect(select).toBeVisible({ timeout: 10000 });

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

// Confirm the duplicate exists (its Manage Menus row). The PrimeroEdge launcher
// frequently fires right after "Create menu" and can interrupt the submit, so this
// re-auths and re-creates the copy if it isn't there yet.
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
  ).toBeVisible({ timeout: 10000 });
}

// Open the Add-Items pop-up ("Items in <menu>") for a menu and wait for it to load.
async function openItemsDialog(page: Page, menuName: string): Promise<void> {
  await openManageMenus(page);
  await page
    .getByRole('button', { name: menuButtonName('Manage items in', menuName) })
    .click();
  await expect(
    page.getByRole('heading', { name: `Items in "${menuName}"` }),
  ).toBeVisible({ timeout: 10000 });
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

// Best-effort teardown: clear the duplicate's items (Deselect all -> Save) and
// delete it. Never throws — runs from finally so it can't mask a real failure.
async function deleteMenu(page: Page, menuName: string): Promise<void> {
  try {
    await openManageMenus(page);
    const deleteBtn = page.getByRole('button', {
      name: menuButtonName('Delete', menuName),
    });
    if (!(await deleteBtn.isVisible({ timeout: 3000 }).catch(() => false))) {
      return; // never created, or already gone
    }

    // Clear items first — a menu with items can't be deleted.
    try {
      await openItemsDialog(page, menuName);
      await page.getByRole('button', { name: /^Deselect all$/i }).click();
      const save = page.getByRole('button', { name: /^Save$/ });
      if (await save.isEnabled().catch(() => false)) {
        await save.click();
        await page
          .getByText(/updated|saved|success/i)
          .first()
          .waitFor({ state: 'visible', timeout: 8000 })
          .catch(() => { });
      }
      await page.getByRole('button', { name: /Back to Manage Menus/i }).click();
      await expect(
        page.getByRole('heading', { name: 'Manage Menus' }),
      ).toBeVisible({ timeout: 8000 });
    } catch {
      // already empty / couldn't open — fall through to delete
    }

    await page
      .getByRole('button', { name: menuButtonName('Delete', menuName) })
      .click();
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

  try {
    // ── Capture the original menu's items ─────────────────────────────────────
    await selectMenuFromDropdown(catering, ORIGINAL_MENU);
    const originalItems = await menuItemNames(catering);
    expect(
      originalItems.length,
      `${ORIGINAL_MENU} should have menu items to copy`,
    ).toBeGreaterThan(0);

    // ── Duplicate the menu ────────────────────────────────────────────────────
    await openManageMenus(catering);
    await expect(
      catering.getByRole('button', {
        name: menuButtonName('Duplicate', ORIGINAL_MENU),
      }),
    ).toBeVisible({ timeout: 10000 });
    await catering
      .getByRole('button', { name: menuButtonName('Duplicate', ORIGINAL_MENU) })
      .click();

    await expect(
      catering.getByRole('heading', { name: `Duplicate "${ORIGINAL_MENU}"` }),
    ).toBeVisible({ timeout: 10000 });
    const dupNameInput = catering.locator('#duplicate-menu-name');
    await expect(dupNameInput).toBeVisible({ timeout: 10000 });

    // A new name is required: with the field empty the "Create menu" button is
    // disabled (or, if clickable, no menu is created).
    const createBtn = catering.getByRole('button', { name: /^Create menu$/i });
    await dupNameInput.fill('');
    if (await createBtn.isDisabled().catch(() => false)) {
      await expect(createBtn).toBeDisabled();
    } else {
      await createBtn.click();
      await expect(dupNameInput).toBeVisible(); // still on the prompt — not created
    }

    // Enter a unique name and create the copy. The launcher often fires right
    // after submit (wiping the transient toast), so confirm via the durable
    // Manage Menus row — re-creating if the launcher ate the submit.
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

    // ── The copy has the SAME items as the original ───────────────────────────
    await selectMenuFromDropdown(catering, dupName);
    const dupItems = await menuItemNames(catering);
    expect(dupItems).toEqual(originalItems);

    // ── The original is unchanged ─────────────────────────────────────────────
    await selectMenuFromDropdown(catering, ORIGINAL_MENU);
    const originalAfter = await menuItemNames(catering);
    expect(originalAfter).toEqual(originalItems);

    // ── "Select all" in the Add-Items pop-up (run on the throwaway duplicate) ──
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
    ).toBeVisible({ timeout: 10000 });

    // Re-open the pop-up: the saved selection persisted — every item except the
    // one we deselected (count is order-independent, so reordering is fine).
    await ensureMenuPage(catering);
    await openItemsDialog(catering, dupName);
    const after = await checkboxStats(catering);
    expect(after.total).toBe(before.total);
    expect(
      after.checked,
      `Expected all but the deselected "${deselectedName}" to be saved`,
    ).toBe(before.total - 1);
    await catering.getByRole('button', { name: /Back to Manage Menus/i }).click();
    await closeManageMenus(catering);
  } finally {
    // Always remove the duplicate this run created.
    await deleteMenu(catering, dupName);
  }
});
