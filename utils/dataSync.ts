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
import { navigateK12CateringMenu, scrollUntilVisible, setListPageSize, getSecondaryDistrictName, isUatDirectLogin } from './helpers';

export function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// District names can render with a typographic apostrophe (U+2019), e.g.
// "Lee’s Summit R-7", while config/code use a straight quote ("Lee's ..."). Build
// a regex source that matches either apostrophe form so the name still matches.
function districtPattern(name: string): string {
  return escapeRegExp(name).replace(/['’]/g, "['’]");
}

// The PrimeroEdge launcher periodically token-refreshes and reloads the app,
// which reverts the active district back to the persisted one. Long, district-
// switch-heavy flows (e.g. 117617 Test B) therefore lose the district they
// switched to mid-test. A test can opt in to automatic restoration by calling
// setIntendedDistrict(<name>); ensureInK12CateringApp() then re-switches back to
// it after any relaunch. Tests that don't opt in (intendedDistrict === null) are
// completely unaffected.
let intendedDistrict: string | null = null;
let restoringDistrict = false;
export function setIntendedDistrict(name: string | null): void {
  intendedDistrict = name;
}
function headerShowsDistrict(page: Page, districtName: string): Locator {
  return page
    .getByRole('button', { name: /Switch district/i })
    .first()
    .getByText(new RegExp(districtPattern(districtName), 'i'));
}

export async function ensureInK12CateringApp(page: Page): Promise<void> {
  await page.keyboard.press('Escape').catch(() => undefined);
  const sidebar = page.locator('aside[aria-label="Main navigation"]');
  // Relaunch through the launcher link only when the app isn't loaded.
  if (!(await sidebar.isVisible({ timeout: 2000 }).catch(() => false))) {
    const launcherLink = page.locator('a[href*="/login?token="]').first();
    if (await launcherLink.isVisible({ timeout: 3000 }).catch(() => false)) {
      await launcherLink.click();
      await page.waitForLoadState('domcontentloaded');
    }
    await expect(sidebar).toBeVisible({ timeout: 30000 });
  }

  // The launcher token-refresh can revert the active district back to the
  // persisted one even when the app reloads cleanly (sidebar stays visible), so
  // this check must run on EVERY call, not only after a relaunch. Restore the
  // district the test intends to be on (opt-in via setIntendedDistrict). The
  // restoringDistrict guard prevents re-entry, since switchDistrict() calls back
  // into this fn. Tests that don't opt in (intendedDistrict === null) are unaffected.
  if (intendedDistrict && !restoringDistrict) {
    const onIntended = await headerShowsDistrict(page, intendedDistrict)
      .waitFor({ state: 'visible', timeout: 2500 })
      .then(() => true)
      .catch(() => false);
    if (!onIntended) {
      restoringDistrict = true;
      try {
        await switchDistrict(page, intendedDistrict);
      } finally {
        restoringDistrict = false;
      }
    }
  }
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
  let switchBtn = page.getByRole('button', { name: /Switch district/i }).first();
  // The header switch control isn't rendered on every page; if it's not here,
  // go to the Districts page where the "Switch district" button reliably lives.
  if (!(await switchBtn.isVisible({ timeout: 3000 }).catch(() => false))) {
    await navigateK12CateringMenu(page, 'Districts').catch(() => undefined);
    await page.waitForLoadState('domcontentloaded');
    switchBtn = page.getByRole('button', { name: /Switch district/i }).first();
  }
  await expect(switchBtn).toBeVisible({ timeout: 10000 });
  await switchBtn.click();
  await page.waitForLoadState('domcontentloaded');

  // Two UIs in the wild:
  //  - Newer (e.g. UAT): a full "Switch District" page listing one card-button
  //    per district behind a search box (only the first page of districts shows,
  //    so the target must be searched for). Clicking a card switches directly.
  //  - Older (QA): a dialog with plain text options plus a separate
  //    "Switch District" confirm button.
  // NB: locator.isVisible() does NOT wait, so probe the new page with waitFor().
  const searchBox = page.getByRole('textbox', { name: /Search districts/i }).first();
  const usesSearchPage = await searchBox
    .waitFor({ state: 'visible', timeout: 10000 })
    .then(() => true)
    .catch(() => false);
  if (usesSearchPage) {
    const card = page
      .getByRole('button', { name: new RegExp(`^${districtPattern(districtName)}\\b`, 'i') })
      .first();
    // Only the first page of districts renders, so narrow the list first. Typing
    // in the search box is the primary filter; if that doesn't surface the card,
    // fall back to the "Browse by Letter" button for the district's first letter.
    await searchBox.fill(districtName);
    await page.waitForTimeout(800);
    if (!(await card.isVisible().catch(() => false))) {
      await searchBox.fill('');
      const letter = districtName.charAt(0).toUpperCase();
      await page
        .getByRole('button', { name: new RegExp(`^${escapeRegExp(letter)}\\s*\\(\\d+\\)$`) })
        .first()
        .click()
        .catch(() => undefined);
      await page.waitForTimeout(500);
    }
    await expect(card).toBeVisible({ timeout: 10000 });
    await card.click();
    // Some variants pop a confirm after picking a card; wait briefly for it and
    // click it if it shows (waitFor, since isVisible() doesn't wait).
    const confirmAfterCard = page.getByRole('button', { name: /^Switch District$/i }).last();
    if (
      await confirmAfterCard
        .waitFor({ state: 'visible', timeout: 4000 })
        .then(() => true)
        .catch(() => false)
    ) {
      await confirmAfterCard.click();
    }
  } else {
    const option = page.getByText(new RegExp(districtPattern(districtName), 'i')).first();
    await expect(option).toBeVisible({ timeout: 10000 });
    await option.click();
    await page.waitForTimeout(500);

    const confirmBtn = page.getByRole('button', { name: /^Switch District$/i }).last();
    await expect(confirmBtn).toBeVisible({ timeout: 10000 });
    await confirmBtn.click();
  }

  await page.waitForLoadState('domcontentloaded');
  // Source of truth: the header "Switch district" button shows the active
  // district name. Wait until it reflects the target — the dialog-gone heuristic
  // passes vacuously on the full-page UI, so verify the switch actually landed.
  await expect(headerShowsDistrict(page, districtName)).toBeVisible({ timeout: 20000 });
  // Track the latest switch so a launcher relaunch restores it (opt-in tests).
  if (intendedDistrict !== null) intendedDistrict = districtName;
  await page.waitForTimeout(1500);
  await ensureInK12CateringApp(page);
}

// Make sure the admin is in the district where the demo customer account lives
// before searching Accounts. On UAT that's the secondary district (Alief ISD);
// on QA the customer is in the default district, so this is a no-op. The switch
// is also skipped when that district is already active (e.g. it's the default),
// so it's safe to call unconditionally before any customer-account lookup.
export async function switchToCustomerDistrict(page: Page): Promise<void> {
  if (!isUatDirectLogin()) return;
  const target = getSecondaryDistrictName();
  const targetRe = new RegExp(districtPattern(target), 'i');
  // Already in the target district? Detect it two ways:
  //  - a switch-capable (Cybersoft Admin) session shows the district inside the
  //    "Switch district" button, OR
  //  - a district-admin session (which has no switch button because it can't
  //    switch) shows it in a read-only "Current district: <name>" label.
  // The second case matters when the account already defaults to the customer's
  // district (e.g. Alief ISD) — there's nothing to switch, so just proceed.
  const onTargetViaButton = await headerShowsDistrict(page, target)
    .waitFor({ state: 'visible', timeout: 3000 })
    .then(() => true)
    .catch(() => false);
  if (onTargetViaButton) return;
  const currentLabel = await page
    .locator('[aria-label^="Current district" i]')
    .first()
    .getAttribute('aria-label')
    .catch(() => '');
  if (currentLabel && targetRe.test(currentLabel)) return;
  await switchDistrict(page, target);
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
  // Description is a required field; an item without one (e.g. a leftover synced
  // item) leaves the Update button blocked ("Description is required"). Fill a
  // placeholder ONLY when it's empty so real descriptions are never overwritten.
  const description = page.getByRole('textbox', { name: /^Description/i }).first();
  if (await description.isVisible().catch(() => false)) {
    const current = (await description.inputValue().catch(() => '')) || '';
    if (current.trim() === '') {
      await description.fill(changes.newName ?? name ?? 'Automated test item');
    }
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
