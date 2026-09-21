/** Reusable K12 Catering "Data Sync" + district-switch + menu-edit helpers. */
import { expect, Locator, Page } from '@playwright/test';
import {
  escapeRegExp,
  navigateK12CateringMenu,
  scrollUntilVisible,
  setListPageSize,
  getSecondaryDistrictName,
  isUatDirectLogin,
  waitForListSettled,
  LIST_ROW_SELECTOR,
} from './helpers';

// Lives in ./helpers now; re-exported so existing imports keep working.
export { escapeRegExp } from './helpers';

// District names can render with a typographic apostrophe (U+2019), e.g.
function districtPattern(name: string): string {
  return escapeRegExp(name).replace(/['’]/g, "['’]");
}

// The launcher token-refreshes and reloads the app
type DistrictState = { intended: string | null; restoring: boolean };
const districtState = new WeakMap<Page, DistrictState>();

function stateFor(page: Page): DistrictState {
  let state = districtState.get(page);
  if (!state) {
    state = { intended: null, restoring: false };
    districtState.set(page, state);
  }
  return state;
}

export function setIntendedDistrict(page: Page, name: string | null): void {
  stateFor(page).intended = name;
}

function headerShowsDistrict(page: Page, districtName: string): Locator {
  // (?!\w) so a short name cannot match a longer one starting with it
  return page
    .getByRole('button', { name: /Switch district/i })
    .first()
    .getByText(new RegExp(`${districtPattern(districtName)}(?!\\w)`, 'i'));
}

export async function ensureInK12CateringApp(page: Page): Promise<void> {
  await page.keyboard.press('Escape').catch(() => undefined);
  const sidebar = page.locator('aside[aria-label="Main navigation"]');
  // Relaunch through the launcher link only when the app isn't loaded.
  if (!(await sidebar.isVisible({ timeout: 2000 }).catch(() => false))) {
    const launcherLink = page.locator('a[href*="/login?token="]').first();
    if (await launcherLink.isVisible({ timeout: 3000 }).catch(() => false)) {
      // The interstitial's launcher link opens the app in a NEW tab (and the page self-redirects
      const href = await launcherLink.getAttribute('href');
      if (href) {
        await page.goto(href, { waitUntil: 'domcontentloaded' });
      } else {
        await launcherLink.click();
        await page.waitForLoadState('domcontentloaded');
      }
    }
    await expect(sidebar).toBeVisible({ timeout: 30000 });
  }

  // The launcher token-refresh can revert the active district back to the persisted one even
  const state = stateFor(page);
  if (state.intended && !state.restoring) {
    const onIntended = await headerShowsDistrict(page, state.intended)
      .waitFor({ state: 'visible', timeout: 2500 })
      .then(() => true)
      .catch(() => false);
    if (!onIntended) {
      state.restoring = true;
      try {
        await switchDistrict(page, state.intended);
      } finally {
        state.restoring = false;
      }
    }
  }
}

export async function clickSidebarItem(page: Page, name: string): Promise<void> {
  await ensureInK12CateringApp(page);
  const item = page.locator('aside[aria-label="Main navigation"]').getByLabel(`Navigate to ${name}`);
  await expect(item).toBeVisible();
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

type CloseDialogOptions = {
  /** Throw if the dialog is still up after the last attempt. */
  required?: boolean;
};

// Close whatever dialog is open and check it actually closed.
export async function closeOpenDialog(page: Page, options: CloseDialogOptions = {}): Promise<void> {
  const { required = true } = options;
  const dialog = page.locator('[role="dialog"]').first();

  for (let attempt = 0; attempt < 4; attempt++) {
    if (!(await dialog.isVisible({ timeout: 1000 }).catch(() => false))) return;
    const closeCandidates = [
      dialog.getByRole('button', { name: /^Close$|Close dialog|Dismiss|Cancel and close modal/i }).first(),
      dialog.locator('button[aria-label*="close" i]').first(),
      dialog.getByRole('button', { name: /^\s*[×✕✖xX]\s*$/ }).first(),
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

  if (!required) return;
  const stillOpen = await dialog.isVisible({ timeout: 500 }).catch(() => false);
  if (stillOpen) {
    const title = (await dialog.innerText().catch(() => ''))
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 120);
    throw new Error(
      `closeOpenDialog: a dialog is still open after 4 attempts — "${title}". ` +
        'It has no close control we can find; the next step would run behind its overlay.',
    );
  }
}

export async function switchDistrict(page: Page, districtName: string): Promise<void> {
  let switchBtn = page.getByRole('button', { name: /Switch district/i }).first();
  // The header switch control isn't rendered on every page
  if (!(await switchBtn.isVisible({ timeout: 3000 }).catch(() => false))) {
    // Log rather than swallow
    await navigateK12CateringMenu(page, 'Districts').catch((err) => {
      const msg = err instanceof Error ? err.message.split('\n')[0] : String(err);
      console.log(`[dataSync] could not open Districts before switching district: ${msg}`);
    });
    await page.waitForLoadState('domcontentloaded');
    switchBtn = page.getByRole('button', { name: /Switch district/i }).first();
  }
  await expect(switchBtn).toBeVisible();
  await switchBtn.click();
  await page.waitForLoadState('domcontentloaded');

  // Two UIs in the wild: - Newer (e.g.
  const searchBox = page.getByRole('textbox', { name: /Search districts/i }).first();
  const usesSearchPage = await searchBox
    .waitFor({ state: 'visible', timeout: 10000 })
    .then(() => true)
    .catch(() => false);
  if (usesSearchPage) {
    const card = page
      .getByRole('button', { name: new RegExp(`^${districtPattern(districtName)}\\b`, 'i') })
      .first();
    // Only the first page of districts renders, so narrow the list first.
    await searchBox.fill(districtName);
    await waitForListSettled(page);
    if (!(await card.isVisible({ timeout: 5000 }).catch(() => false))) {
      await searchBox.fill('');
      const letter = districtName.charAt(0).toUpperCase();
      await page
        .getByRole('button', { name: new RegExp(`^${escapeRegExp(letter)}\\s*\\(\\d+\\)$`) })
        .first()
        .click()
        .catch(() => undefined);
      await waitForListSettled(page);
    }
    await expect(card).toBeVisible();
    await card.click();
    // Some variants pop a confirm after picking a card
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
    // Anchored and role-first
    const exact = new RegExp(`^\\s*${districtPattern(districtName)}\\s*$`, 'i');
    let option = page
      .getByRole('option', { name: exact })
      .or(page.getByRole('button', { name: exact }))
      .or(page.getByText(exact))
      .first();
    if (!(await option.isVisible({ timeout: 5000 }).catch(() => false))) {
      // Some builds put the name in a row with a status badge
      option = page
        .getByText(new RegExp(`${districtPattern(districtName)}(?!\\w)`, 'i'))
        .last();
    }
    await expect(option).toBeVisible();
    await option.click();

    const confirmBtn = page.getByRole('button', { name: /^Switch District$/i }).last();
    await expect(confirmBtn).toBeVisible();
    await confirmBtn.click();
  }

  await page.waitForLoadState('domcontentloaded');
  // Source of truth: the header "Switch district" button shows the active district name.
  await expect(headerShowsDistrict(page, districtName)).toBeVisible({ timeout: 20000 });
  // Track the latest switch so a launcher relaunch restores it (opt-in tests).
  const state = stateFor(page);
  if (state.intended !== null) state.intended = districtName;
  await ensureInK12CateringApp(page);
}

// Make sure the admin is in the district where the demo customer account lives before
export async function switchToCustomerDistrict(page: Page): Promise<void> {
  if (!isUatDirectLogin()) return;
  const target = getSecondaryDistrictName();
  const targetRe = new RegExp(districtPattern(target), 'i');
  // Already in the target district?
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
  await expect(heading).toBeVisible();
}

/** Open Manage, set the "Sync <attr>" global toggle to on/off, then close. */
export async function setGlobalSyncToggle(page: Page, attrLabel: string, on: boolean): Promise<void> {
  const manageBtn = page.getByRole('button', { name: /^Manage$/i }).or(page.getByRole('link', { name: /^Manage$/i })).first();
  await scrollUntilVisible(page, { target: manageBtn }).catch(() => undefined);
  await expect(manageBtn).toBeVisible();
  await manageBtn.click();
  const dialog = page.getByRole('dialog').first();
  await expect(dialog).toBeVisible();
  const toggle = dialog.getByRole('switch', { name: attrLabel, exact: true });
  await expect(toggle).toBeVisible();
  const isOn = (await toggle.getAttribute('aria-checked').catch(() => null)) === 'true';
  if (isOn !== on) {
    await toggle.click();
    // No sleep: the attribute assertion below IS the wait for the toggle to land.
    await expect(toggle).toHaveAttribute('aria-checked', String(on), { timeout: 5000 });
  }
  await closeOpenDialog(page);
}

/** Make sure a target district is opted in before a sync runs. */
export async function ensureTargetDistrictOptedIn(page: Page, districtName: string): Promise<boolean> {
  const manageBtn = page
    .getByRole('button', { name: /^Manage$/i })
    .or(page.getByRole('link', { name: /^Manage$/i }))
    .first();
  await scrollUntilVisible(page, { target: manageBtn }).catch(() => undefined);
  await expect(manageBtn).toBeVisible();
  await manageBtn.click();

  const dialog = page.getByRole('dialog').first();
  await expect(dialog).toBeVisible();

  // Each target district is a row carrying its name and its own opt-in switch.
  const row = dialog
    .locator('div')
    .filter({ hasText: new RegExp(escapeRegExp(districtName)) })
    .filter({ has: page.getByRole('switch') })
    .last();

  let changed = false;
  if (await row.waitFor({ state: 'visible', timeout: 8000 }).then(() => true, () => false)) {
    const toggle = row.getByRole('switch').first();
    const optedIn = (await toggle.getAttribute('aria-checked').catch(() => null)) === 'true';
    if (!optedIn) {
      await toggle.click();
      await expect(toggle).toHaveAttribute('aria-checked', 'true', { timeout: 8000 });
      changed = true;
      console.log(`[dataSync] "${districtName}" was opted OUT - opted it back in before syncing.`);
    }
  } else {
    console.log(`[dataSync] could not find a target-district row for "${districtName}".`);
  }

  await closeOpenDialog(page);
  return changed;
}

/** Click "Push sync now", confirm, wait for the "Sync complete" toast. */
export async function runPushSyncNow(
  page: Page,
  options: { ensureTargetOptedIn?: boolean } = {},
): Promise<boolean> {
  const { ensureTargetOptedIn = true } = options;
  if (ensureTargetOptedIn) {
    await ensureTargetDistrictOptedIn(page, getSecondaryDistrictName()).catch(() => undefined);
  }
  const pushBtn = page.getByRole('button', { name: /Push sync now/i }).first();
  await scrollUntilVisible(page, { target: pushBtn }).catch(() => undefined);
  if (await pushBtn.isDisabled().catch(() => false)) return false;
  await pushBtn.click();
  await expect(page.locator('div').filter({ hasText: /^Push sync now\?$/ }).first()).toBeVisible();
  await page.getByRole('button', { name: /Yes,?\s*Push Now/i }).first().click();
  await expect(
    page.getByText(/Sync complete\s*[.,;:—–-]?\s*\d+\s*items?\s*synced,\s*\d+\s*skipped/i).first(),
  ).toBeVisible({ timeout: 90000 });
  return true;
}

// ── Menu (TheRealMenu) item edit helpers ──

/** Navigate to Menu and ensure the top-right menu dropdown is "TheRealMenu". */
export async function selectTheRealMenu(page: Page): Promise<void> {
  await safeNavigate(page, 'Menu');
  await expect(page.getByRole('heading', { name: /^Menu$/i }).first()).toBeVisible();
  await page.getByText(/Loading Menu/i).waitFor({ state: 'hidden', timeout: 30000 }).catch(() => undefined);
  const menuSelect = page.locator('#admin-menu-select');
  if (await menuSelect.isVisible({ timeout: 10000 }).catch(() => false)) {
    await menuSelect.click();
    await page.getByRole('option', { name: /RealMenu/i }).first().click().catch(() => undefined);
    // "Loading Menu" detaching is the render signal; no sleep needed after it.
    await page.getByText(/Loading Menu/i).waitFor({ state: 'hidden', timeout: 15000 }).catch(() => undefined);
  }
}

const editPencil = (page: Page, name: string) =>
  page.getByRole('button', { name: new RegExp(`^Edit\\s+${escapeRegExp(name)}(?:\\s+menu item)?$`, 'i') }).first();

/** Read the name of the first menu item from its Edit pencil aria-label. */
export async function firstMenuItemName(page: Page): Promise<string> {
  const editBtn = page.locator('#main-content').getByRole('button', { name: /^Edit\s+.+/i }).first();
  await expect(editBtn).toBeVisible();
  const label = (await editBtn.getAttribute('aria-label')) ?? '';
  const m = label.match(/^Edit\s+(.+?)(?:\s+menu item)?$/i);
  return m ? m[1].trim() : '';
}

async function openItemEdit(page: Page, name: string): Promise<void> {
  const btn = editPencil(page, name);
  await expect(btn).toBeVisible();
  await btn.click();
  await expect(page.getByRole('dialog', { name: /Edit Menu Item/i })).toBeVisible();
}

/** Chip-tag fields (Ingredients, Allergens) in the Edit Menu Item dialog */
async function setChips(page: Page, inputId: string, kind: 'allergen' | 'ingredient', values: string[]): Promise<void> {
  const removeRe = new RegExp(`^Remove .+ ${kind}$`, 'i');
  const chips = page.getByRole('button', { name: removeRe });
  // The count dropping confirms each removal. Bounded so a stuck chip can't spin.
  for (let guard = 0; guard < 30; guard += 1) {
    const before = await chips.count();
    if (before === 0) break;
    await chips.first().click();
    await expect(chips).toHaveCount(before - 1, { timeout: 5000 });
  }
  const input = page.locator(`#${inputId}`);
  for (const value of values) {
    await input.click();
    await input.fill(value);
    await input.press('Enter');
    // The chip appearing confirms Enter registered.
    await expect(
      page.getByRole('button', { name: new RegExp(`^Remove ${escapeRegExp(value)} ${kind}$`, 'i') }),
    ).toBeVisible({ timeout: 5000 });
  }
}

async function readChips(page: Page, kind: 'allergen' | 'ingredient'): Promise<string[]> {
  const btns = page.getByRole('button', { name: new RegExp(`^Remove .+ ${kind}$`, 'i') });
  const ariaLabels = await btns.evaluateAll((els) => els.map((e) => e.getAttribute('aria-label')));
  const re = new RegExp(`^Remove (.+) ${kind}$`, 'i');
  return ariaLabels.map((l) => l?.match(re)?.[1]).filter((v): v is string => Boolean(v));
}

/** Edit a menu item's name, price, allergens, and/or ingredients (TheRealMenu) and save.
 *  `newAllergens`/`newIngredients` REPLACE the item's existing chips with the given list. */
export async function editMenuItem(
  page: Page,
  name: string,
  changes: { newName?: string; newPrice?: string; newAllergens?: string[]; newIngredients?: string[] },
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
  if (changes.newAllergens !== undefined) {
    await setChips(page, 'allergens-input', 'allergen', changes.newAllergens);
  }
  if (changes.newIngredients !== undefined) {
    await setChips(page, 'ingredients-input', 'ingredient', changes.newIngredients);
  }
  // Description is a required field; an item without one (e.g.
  const description = page.getByRole('textbox', { name: /^Description/i }).first();
  if (await description.isVisible().catch(() => false)) {
    const current = (await description.inputValue().catch(() => '')) || '';
    if (current.trim() === '') {
      await description.fill(changes.newName ?? name ?? 'Automated test item');
    }
  }
  await page.getByRole('button', { name: /Update menu item|Update Menu Item|^Update$|^Save$/i }).first().click();
  await expect(page.getByRole('dialog', { name: /Edit Menu Item/i })).not.toBeVisible();
}

/** On the Data Sync page, find the syncable-item row for `name` (proven pattern from t-113438) */
export async function findSyncableItemRow(page: Page, name: string): Promise<Locator> {
  // Re-navigate (handles the intermittent PrimeroEdge launcher kicking us out of the SPA after a
  await goToDataSync(page);

  // setListPageSize handles both the <select> and combobox flavours.
  await setListPageSize(page, 100);

  const search = page.getByRole('textbox', { name: /Search( syncable| items)?/i }).first();
  if (await search.isVisible({ timeout: 5000 }).catch(() => false)) {
    await search.fill('');
    await search.fill(name);
    await waitForListSettled(page);
  }

  // No sleep: the row assertion below waits for the filtered list.
  const row = page.locator(LIST_ROW_SELECTOR).filter({ hasText: name }).first();
  await expect(row).toBeVisible();
  return row;
}

/** Dedicated to the 117617 "Local Overrides" filter test */
export async function findItemUnderLocalOverridesFilter(page: Page, name: string, attempts = 3): Promise<Locator> {
  for (let attempt = 0; attempt < attempts; attempt++) {
    await goToDataSync(page); // re-enters the SPA if the launcher kicked us out
    await setListPageSize(page, 100).catch(() => undefined);

    const filterBtn = page.getByRole('button', { name: /^Local Overrides$/i }).first();
    if (!(await filterBtn.isVisible({ timeout: 8000 }).catch(() => false))) continue;
    await filterBtn.click();
    await waitForListSettled(page);

    // Walk the filtered list; bail to the outer retry if the launcher reappears.
    for (let p = 0; p < 8; p++) {
      const onDataSync = await page
        .getByRole('heading', { name: /Data Sync/i })
        .first()
        .isVisible({ timeout: 2000 })
        .catch(() => false);
      if (!onDataSync) break;

      const row = page.locator(LIST_ROW_SELECTOR).filter({ hasText: name }).first();
      if (await row.isVisible({ timeout: 3000 }).catch(() => false)) {
        await row.scrollIntoViewIfNeeded().catch(() => undefined);
        return row;
      }
      const next = page.getByRole('button', { name: /^Next$/i }).first();
      if (!(await next.isVisible({ timeout: 1000 }).catch(() => false)) || !(await next.isEnabled().catch(() => false))) break;
      await next.click();
      await waitForListSettled(page);
    }
  }
  throw new Error(`findItemUnderLocalOverridesFilter: "${name}" not found under the Local Overrides filter.`);
}

/** On Data Sync, if the named item has a local override, open its Details and "Reset Local */
export async function resetLocalOverride(page: Page, name: string): Promise<boolean> {
  let row: Locator;
  try {
    // Find it via the Local Overrides filter (1 attempt) - no search typing.
    row = await findItemUnderLocalOverridesFilter(page, name, 1);
  } catch {
    return false;
  }
  await row.getByRole('button', { name: /^Details$/i }).first().click();
  const details = page.getByRole('dialog').first();
  const resetBtn = details.getByRole('button', { name: /Reset Local Overrides/i }).first();
  if (!(await resetBtn.isVisible({ timeout: 5000 }).catch(() => false))) {
    // Nothing to reset; tolerant probe, so don't fail on the close.
    await closeOpenDialog(page, { required: false });
    return false;
  }
  await resetBtn.click();
  const resetDialog = page
    .getByRole('dialog')
    .filter({ has: page.getByRole('heading', { name: /Reset Local Overrides/i }) })
    .first();
  await expect(resetDialog).toBeVisible();
  await resetDialog.getByRole('button', { name: /Reset Overrides|^Reset$|^Confirm$/i }).last().click();
  // waitFor, not isVisible - isVisible returns at once, so its timeout never applied.
  await page
    .getByText(/Local overrides reset/i)
    .first()
    .waitFor({ state: 'visible', timeout: 15000 })
    .catch(() => undefined);
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

/** Read a menu item's Allergens AND Ingredients from a SINGLE Edit-dialog open */
export async function readMenuItemChips(
  page: Page,
  name: string,
): Promise<{ allergens: string[]; ingredients: string[] }> {
  await openItemEdit(page, name);
  const allergens = await readChips(page, 'allergen');
  const ingredients = await readChips(page, 'ingredient');
  await page.getByRole('button', { name: /Cancel and close modal|^Cancel$/i }).first().click().catch(() => undefined);
  await page.keyboard.press('Escape').catch(() => undefined);
  await page.getByRole('dialog', { name: /Edit Menu Item/i }).waitFor({ state: 'hidden', timeout: 5000 }).catch(() => undefined);
  return { allergens, ingredients };
}
