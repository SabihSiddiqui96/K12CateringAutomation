/**
 * Reusable K12 Catering "Data Sync" + district-switch + menu-edit helpers.
 *
 * These mirror the proven patterns in tests/tickets/t-113438.spec.ts (district
 * switching, Data Sync navigation, the Manage dialog, Push sync now) and
 * tests/menu/menu_manage_items.spec.ts (the Edit Menu Item dialog with
 * #menu-item-name / #price-per-item), pulled into one place so ticket specs can
 * reuse them instead of duplicating. Locators are kept identical to those tests.
 */
import { expect, Locator, Page } from '@playwright/test';
import { navigateK12CateringMenu, scrollUntilVisible, setListPageSize } from './helpers';

export function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export async function ensureInK12CateringApp(page: Page): Promise<void> {
  await page.keyboard.press('Escape').catch(() => undefined);
  const sidebar = page.locator('aside[aria-label="Main navigation"]');
  if (await sidebar.isVisible({ timeout: 2000 }).catch(() => false)) return;
  const launcherLink = page.locator('a[href*="/login?token="]').first();
  if (await launcherLink.isVisible({ timeout: 3000 }).catch(() => false)) {
    await launcherLink.click();
    await page.waitForLoadState('domcontentloaded');
  }
  await expect(sidebar).toBeVisible({ timeout: 30000 });
}

export async function clickSidebarItem(page: Page, name: string): Promise<void> {
  await ensureInK12CateringApp(page);
  const item = page.locator('aside[aria-label="Main navigation"]').getByLabel(`Navigate to ${name}`);
  await expect(item).toBeVisible({ timeout: 10000 });
  await item.click();
  await page.waitForLoadState('domcontentloaded');
}

export async function safeNavigate(
  page: Page,
  menuItem: Parameters<typeof navigateK12CateringMenu>[1],
): Promise<void> {
  await ensureInK12CateringApp(page);
  await navigateK12CateringMenu(page, menuItem);
  await page.waitForLoadState('domcontentloaded');
  await ensureInK12CateringApp(page);
}

export async function dismissAnyModal(page: Page): Promise<void> {
  await page.keyboard.press('Escape').catch(() => undefined);
  await page.locator('div.fixed.inset-0').first().waitFor({ state: 'hidden', timeout: 3000 }).catch(() => undefined);
}

export async function closeOpenDialog(page: Page): Promise<void> {
  for (let attempt = 0; attempt < 4; attempt++) {
    const dialog = page.locator('[role="dialog"]').first();
    if (!(await dialog.isVisible({ timeout: 1000 }).catch(() => false))) return;
    const closeCandidates = [
      dialog.getByRole('button', { name: /^Close$|Close dialog|Dismiss|Cancel and close modal/i }).first(),
      dialog.locator('button[aria-label*="close" i]').first(),
      dialog.locator('button:has(svg)').last(),
    ];
    for (const candidate of closeCandidates) {
      if (await candidate.isVisible({ timeout: 500 }).catch(() => false)) {
        await candidate.click({ force: true }).catch(() => undefined);
        break;
      }
    }
    await page.keyboard.press('Escape').catch(() => undefined);
    await dialog.waitFor({ state: 'hidden', timeout: 2000 }).catch(() => undefined);
  }
}

export async function switchDistrict(page: Page, districtName: string): Promise<void> {
  const switchBtn = page.getByRole('button', { name: /Switch district/i }).first();
  await expect(switchBtn).toBeVisible({ timeout: 10000 });
  await switchBtn.click();
  await page.waitForLoadState('domcontentloaded');

  const option = page.getByText(new RegExp(escapeRegExp(districtName), 'i')).first();
  await expect(option).toBeVisible({ timeout: 10000 });
  await option.click();
  await page.waitForTimeout(500);

  const confirmBtn = page.getByRole('button', { name: /^Switch District$/i }).last();
  await expect(confirmBtn).toBeVisible({ timeout: 10000 });
  await confirmBtn.click();

  const toastVisible = await page
    .getByText(/District Switched|switched.*successfully|switched/i)
    .first()
    .isVisible({ timeout: 15000 })
    .catch(() => false);
  const dialogGone = await page
    .locator('[role="dialog"]')
    .first()
    .waitFor({ state: 'hidden', timeout: 5000 })
    .then(() => true)
    .catch(() => false);
  expect(
    toastVisible || dialogGone,
    `District switch confirmation never appeared (toast: ${toastVisible}, dialog gone: ${dialogGone})`,
  ).toBeTruthy();
  await page.waitForLoadState('domcontentloaded');
  await page.waitForTimeout(1500);
  await ensureInK12CateringApp(page);
}

export async function goToDataSync(page: Page): Promise<void> {
  await dismissAnyModal(page);
  await ensureInK12CateringApp(page);
  await clickSidebarItem(page, 'Data Sync');
  const heading = page.getByRole('heading', { name: /Data Sync/i }).first();
  if (!(await heading.isVisible({ timeout: 5000 }).catch(() => false))) {
    await ensureInK12CateringApp(page);
    await clickSidebarItem(page, 'Data Sync');
  }
  await expect(heading).toBeVisible({ timeout: 15000 });
}

/** Open Manage, set the "Sync <attr>" global toggle to on/off, then close. */
export async function setGlobalSyncToggle(page: Page, attrLabel: string, on: boolean): Promise<void> {
  const manageBtn = page.getByRole('button', { name: /^Manage$/i }).or(page.getByRole('link', { name: /^Manage$/i })).first();
  await scrollUntilVisible(page, { target: manageBtn }).catch(() => undefined);
  await expect(manageBtn).toBeVisible({ timeout: 10000 });
  await manageBtn.click();
  const dialog = page.getByRole('dialog').first();
  await expect(dialog).toBeVisible({ timeout: 10000 });
  const toggle = dialog.getByRole('switch', { name: attrLabel, exact: true });
  await expect(toggle).toBeVisible({ timeout: 10000 });
  const isOn = (await toggle.getAttribute('aria-checked').catch(() => null)) === 'true';
  if (isOn !== on) {
    await toggle.click();
    await page.waitForTimeout(400);
    await expect(toggle).toHaveAttribute('aria-checked', String(on), { timeout: 5000 });
  }
  await closeOpenDialog(page);
}

/** Click "Push sync now", confirm, and wait for the "Sync complete" toast. */
export async function runPushSyncNow(page: Page): Promise<void> {
  await scrollUntilVisible(page, { target: page.getByRole('button', { name: /Push sync now/i }).first() }).catch(() => undefined);
  await page.getByRole('button', { name: /Push sync now/i }).first().click();
  await expect(page.locator('div').filter({ hasText: /^Push sync now\?$/ }).first()).toBeVisible({ timeout: 10000 });
  await page.getByRole('button', { name: /Yes,?\s*Push Now/i }).first().click();
  await expect(
    page.getByText(/Sync complete\s*[—–-]?\s*\d+\s*items?\s*synced,\s*\d+\s*skipped/i).first(),
  ).toBeVisible({ timeout: 90000 });
}

// ── Menu (TheRealMenu) item edit helpers ─────────────────────────────────────

/** Navigate to Menu and ensure the top-right menu dropdown is "TheRealMenu". */
export async function selectTheRealMenu(page: Page): Promise<void> {
  await safeNavigate(page, 'Menu');
  await expect(page.getByRole('heading', { name: /^Menu$/i }).first()).toBeVisible({ timeout: 15000 });
  await page.getByText(/Loading Menu/i).waitFor({ state: 'hidden', timeout: 30000 }).catch(() => undefined);
  const menuSelect = page.locator('#admin-menu-select');
  if (await menuSelect.isVisible({ timeout: 10000 }).catch(() => false)) {
    await menuSelect.click();
    await page.getByRole('option', { name: /RealMenu/i }).first().click().catch(() => undefined);
    await page.getByText(/Loading Menu/i).waitFor({ state: 'hidden', timeout: 15000 }).catch(() => undefined);
    await page.waitForTimeout(800);
  }
}

const editPencil = (page: Page, name: string) =>
  page.getByRole('button', { name: new RegExp(`^Edit\\s+${escapeRegExp(name)}(?:\\s+menu item)?$`, 'i') }).first();

/** Read the name of the first menu item from its Edit pencil aria-label. */
export async function firstMenuItemName(page: Page): Promise<string> {
  const editBtn = page.locator('#main-content').getByRole('button', { name: /^Edit\s+.+/i }).first();
  await expect(editBtn).toBeVisible({ timeout: 15000 });
  const label = (await editBtn.getAttribute('aria-label')) ?? '';
  const m = label.match(/^Edit\s+(.+?)(?:\s+menu item)?$/i);
  return m ? m[1].trim() : '';
}

async function openItemEdit(page: Page, name: string): Promise<void> {
  const btn = editPencil(page, name);
  await expect(btn).toBeVisible({ timeout: 15000 });
  await btn.click();
  await expect(page.getByRole('dialog', { name: /Edit Menu Item/i })).toBeVisible({ timeout: 10000 });
}

/** Edit a menu item's name and/or price (TheRealMenu) and save. */
export async function editMenuItem(
  page: Page,
  name: string,
  changes: { newName?: string; newPrice?: string },
): Promise<void> {
  await openItemEdit(page, name);
  if (changes.newName !== undefined) {
    await page.locator('#menu-item-name').fill('');
    await page.locator('#menu-item-name').fill(changes.newName);
  }
  if (changes.newPrice !== undefined) {
    await page.locator('#price-per-item').clear();
    await page.locator('#price-per-item').fill(changes.newPrice);
  }
  await page.getByRole('button', { name: /Update menu item|Update Menu Item|^Update$|^Save$/i }).first().click();
  await expect(page.getByRole('dialog', { name: /Edit Menu Item/i })).not.toBeVisible({ timeout: 15000 });
}

/**
 * On the Data Sync page, find the syncable-item row for `name` (proven pattern
 * from t-113438): re-enter the app if the launcher showed, bump to 100/page,
 * search by name, and return the row. The Overrides badge can then be asserted.
 */
export async function findSyncableItemRow(page: Page, name: string): Promise<Locator> {
  // Re-navigate (handles the intermittent PrimeroEdge launcher kicking us out of
  // the SPA after a district switch) so we are reliably on the Data Sync page.
  await goToDataSync(page);

  const pageSize = page
    .getByRole('combobox', { name: /per page|page size|rows per page/i })
    .or(page.getByRole('button', { name: /\d+\s*\/\s*page/i }))
    .or(page.locator('select').filter({ hasText: /\d+\s*\/\s*page/i }))
    .first();
  if (await pageSize.isVisible({ timeout: 5000 }).catch(() => false)) {
    await pageSize.click();
    const ok = await pageSize.selectOption({ label: '100 / page' }).catch(() => null);
    if (!ok) {
      await pageSize.selectOption({ label: '100/page' }).catch(async () => {
        await page.getByRole('option', { name: /^\s*100\s*\/\s*page\s*$/i }).first().click().catch(() => undefined);
      });
    }
    await page.waitForTimeout(800);
  }

  const search = page.getByRole('textbox', { name: /Search( syncable| items)?/i }).first();
  if (await search.isVisible({ timeout: 5000 }).catch(() => false)) {
    await search.fill('');
    await search.fill(name);
    await page.waitForTimeout(800);
  }

  const row = page.locator('table tbody tr, [role="row"]').filter({ hasText: name }).first();
  await expect(row).toBeVisible({ timeout: 15000 });
  return row;
}

/**
 * Dedicated to the 117617 "Local Overrides" filter test: go to Data Sync, set
 * 100/page, click the "Local Overrides" filter button (a real <button>), and find
 * the named item's row WITHIN the filtered list (paging via Previous/Next).
 *
 * It owns the whole flow on purpose (rather than handing off to the generic
 * findRowAcrossPages): after a district switch the PrimeroEdge launcher can kick
 * us out of the SPA, so each attempt re-enters via goToDataSync and re-applies the
 * filter; if the launcher reappears mid-paging it bails to the outer retry.
 * Returns the matching row Locator. Throws if not found.
 */
export async function findItemUnderLocalOverridesFilter(page: Page, name: string, attempts = 3): Promise<Locator> {
  for (let attempt = 0; attempt < attempts; attempt++) {
    await goToDataSync(page); // re-enters the SPA if the launcher kicked us out
    await setListPageSize(page, 100).catch(() => undefined);

    const filterBtn = page.getByRole('button', { name: /^Local Overrides$/i }).first();
    if (!(await filterBtn.isVisible({ timeout: 8000 }).catch(() => false))) continue;
    await filterBtn.click();
    await page.waitForTimeout(1200);

    // Walk the filtered list; bail to the outer retry if the launcher reappears.
    for (let p = 0; p < 8; p++) {
      const onDataSync = await page
        .getByRole('heading', { name: /Data Sync/i })
        .first()
        .isVisible({ timeout: 2000 })
        .catch(() => false);
      if (!onDataSync) break;

      const row = page.locator('table tbody tr, [role="row"]').filter({ hasText: name }).first();
      if (await row.isVisible({ timeout: 3000 }).catch(() => false)) {
        await row.scrollIntoViewIfNeeded().catch(() => undefined);
        return row;
      }
      const next = page.getByRole('button', { name: /^Next$/i }).first();
      if (!(await next.isVisible({ timeout: 1000 }).catch(() => false)) || !(await next.isEnabled().catch(() => false))) break;
      await next.click();
      await page.waitForTimeout(800);
    }
  }
  throw new Error(`findItemUnderLocalOverridesFilter: "${name}" not found under the Local Overrides filter.`);
}

/**
 * On Data Sync, if the named item has a local override, open its Details and
 * "Reset Local Overrides". Tolerant: returns false (no-op) if the item or the
 * override isn't found. Used both to clean up after a run and to clear leftover
 * state from a prior interrupted run (keeps the test idempotent).
 */
export async function resetLocalOverride(page: Page, name: string): Promise<boolean> {
  let row: Locator;
  try {
    // Find it via the Local Overrides filter (1 attempt) - no search typing. If it
    // isn't shown there, it has no override, so there is nothing to reset.
    row = await findItemUnderLocalOverridesFilter(page, name, 1);
  } catch {
    return false;
  }
  await row.getByRole('button', { name: /^Details$/i }).first().click();
  const details = page.getByRole('dialog').first();
  const resetBtn = details.getByRole('button', { name: /Reset Local Overrides/i }).first();
  if (!(await resetBtn.isVisible({ timeout: 5000 }).catch(() => false))) {
    await closeOpenDialog(page);
    return false;
  }
  await resetBtn.click();
  const resetDialog = page
    .getByRole('dialog')
    .filter({ has: page.getByRole('heading', { name: /Reset Local Overrides/i }) })
    .first();
  await expect(resetDialog).toBeVisible({ timeout: 10000 });
  await resetDialog.getByRole('button', { name: /Reset Overrides|^Reset$|^Confirm$/i }).last().click();
  await page.getByText(/Local overrides reset/i).first().isVisible({ timeout: 15000 }).catch(() => undefined);
  await closeOpenDialog(page);
  return true;
}

/** Read a menu item's price via the Edit dialog, then cancel (no override created). */
export async function readMenuItemPrice(page: Page, name: string): Promise<string> {
  await openItemEdit(page, name);
  const raw = await page.locator('#price-per-item').inputValue();
  await page.getByRole('button', { name: /Cancel and close modal|^Cancel$/i }).first().click().catch(() => undefined);
  await page.keyboard.press('Escape').catch(() => undefined);
  await page.getByRole('dialog', { name: /Edit Menu Item/i }).waitFor({ state: 'hidden', timeout: 5000 }).catch(() => undefined);
  // Normalise "$7.70", "7.7", "7.70" -> "7.7" for stable comparison.
  const num = Number(String(raw).replace(/[^0-9.]/g, ''));
  return Number.isFinite(num) ? String(num) : String(raw).trim();
}
