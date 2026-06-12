import { test, expect, type Locator, type Page } from '@playwright/test';
import {
  loginToK12Catering,
  navigateK12CateringMenu,
  getDistrictName,
} from '../../utils/helpers';
import {
  goToDataSync,
  setGlobalSyncToggle,
  runPushSyncNow,
  switchDistrict,
  selectTheRealMenu,
  firstMenuItemName,
  editMenuItem,
  readMenuItemPrice,
  resetLocalOverride,
  findItemUnderLocalOverridesFilter,
  escapeRegExp,
} from '../../utils/dataSync';

/**
 * Catering - Data Sync - Add granular overrides for specific fields  (ADO PBI 117617).
 *
 * Kept as TWO tests on a shared session. Test A is the quick toggles + Push-sync
 * check; Test B is the long cross-district sync + local-override flow. They are NOT
 * merged into one test: the combined ~2.5-min, district-switch-heavy run reliably
 * trips the PrimeroEdge launcher (token refresh), whereas the two shorter tests pass
 * and a launcher hit only fails (and cheaply retries) the affected one.
 *
 * NOT automated (manual): the schedule-triggered auto-sync (~9 PM CDT).
 */

const ATTRS = [
  'Sync Name', 'Sync Description', 'Sync Price', 'Sync Image',
  'Sync Allergens', 'Sync Ingredients', 'Sync Categories', 'Sync Varieties',
] as const;

test.describe.serial('Data Sync - Granular Attribute Sync Overrides [ADO 117617]', () => {
  let catering: Page;

  test.beforeAll(async ({ browser }) => {
    const context = await browser.newContext();
    const page = await context.newPage();
    catering = await loginToK12Catering(page);
    await navigateK12CateringMenu(catering, 'Data Sync');
    await expect(catering.getByRole('heading', { name: /Data Sync/i }).first()).toBeVisible({ timeout: 20000 });
    await catering.waitForTimeout(1000);
  });

  // ── helpers ────────────────────────────────────────────────────────────────
  async function openManage(): Promise<Locator> {
    await catering
      .getByRole('button', { name: /^Manage$/i })
      .or(catering.getByRole('link', { name: /^Manage$/i }))
      .first()
      .click();
    const dialog = catering.getByRole('dialog').first();
    await expect(dialog).toBeVisible({ timeout: 10000 });
    await expect(dialog.getByText(/Menu Item Sync Attributes/i)).toBeVisible({ timeout: 10000 });
    return dialog;
  }

  async function closeDialog(): Promise<void> {
    for (let i = 0; i < 4; i++) {
      const dlg = catering.getByRole('dialog').first();
      if (!(await dlg.isVisible({ timeout: 800 }).catch(() => false))) break;
      await dlg.getByRole('button', { name: /close|cancel|^no$|^done$|^×$|^✕$/i }).first().click({ timeout: 1500 }).catch(() => {});
      await catering.keyboard.press('Escape').catch(() => {});
      await catering.waitForTimeout(400);
    }
    await catering.locator('[aria-modal="true"]').first().waitFor({ state: 'hidden', timeout: 5000 }).catch(() => {});
  }

  const attrToggle = (dialog: Locator, name: string) => dialog.getByRole('switch', { name, exact: true });
  const isOn = async (toggle: Locator) => (await toggle.getAttribute('aria-checked').catch(() => null)) === 'true';
  async function setToggle(dialog: Locator, name: string, on: boolean): Promise<void> {
    const t = attrToggle(dialog, name);
    await expect(t).toBeVisible({ timeout: 10000 });
    if ((await isOn(t)) !== on) {
      await t.click();
      await catering.waitForTimeout(400);
      await expect(t).toHaveAttribute('aria-checked', String(on), { timeout: 5000 });
    }
  }

  // ── Test A: toggles render + persist, then Push-sync reflects them ─────────────
  test('global attribute toggles render, persist, and drive Push Sync Now', async () => {
    const dialog = await openManage();
    for (const name of ATTRS) {
      await expect(attrToggle(dialog, name)).toBeVisible({ timeout: 10000 });
    }
    const price = attrToggle(dialog, 'Sync Price');
    const original = await isOn(price);
    await price.click();
    await expect(price).toHaveAttribute('aria-checked', String(!original), { timeout: 5000 });
    await closeDialog();
    const dialog2 = await openManage();
    await expect(attrToggle(dialog2, 'Sync Price')).toHaveAttribute('aria-checked', String(!original), { timeout: 5000 });
    await setToggle(dialog2, 'Sync Price', false);
    await setToggle(dialog2, 'Sync Name', true);
    await closeDialog();

    await catering.getByRole('button', { name: /Push sync now/i }).first().click();
    const dlg = catering.getByRole('dialog').first();
    await expect(dlg).toBeVisible({ timeout: 10000 });
    await expect(dlg.getByText(/Push sync now\?/i)).toBeVisible({ timeout: 10000 });
    await expect(dlg.getByText(/Menu item attributes/i)).toBeVisible({ timeout: 10000 });
    // The "...will not be synced (globally off)" notice lists ALL globally-off
    // attributes together (e.g. "Description, Price, Image will not be synced..."),
    // so the list varies run to run - assert Price is INCLUDED, plus the 2nd sentence.
    await expect(dlg.getByText('Name', { exact: true }).first()).toBeVisible({ timeout: 10000 });
    const offNotice = dlg.getByText(/will not be synced \(globally off\)/i).first();
    await expect(offNotice).toBeVisible({ timeout: 10000 });
    await expect(offNotice).toContainText(/Price/i);
    await expect(dlg.getByText(/Per-item overrides may differ/i).first()).toBeVisible({ timeout: 10000 });
    await dlg.getByRole('button', { name: /^Cancel$/i }).first().click();
    await closeDialog();
    const restore = await openManage();
    await setToggle(restore, 'Sync Price', original);
    await closeDialog();
  });

  // ── Test B: per-attribute sync across districts + local override [steps 10-17] ─
  test('per-attribute sync respects toggles across districts, and local overrides win', async () => {
    test.slow(); // long multi-district flow

    const HOME = getDistrictName(); // Mercer County School District
    const TARGET = 'Berkeley School District';
    const stamp = `${Date.now()}`.slice(-6);
    const uniqueName = `AutoSync ${stamp}`;
    const PRICE_OFF = '7.77';   // set while Sync Price OFF -> must NOT propagate
    const PRICE_ON = '8.88';    // set while Sync Price ON  -> must propagate
    const PRICE_LOCAL = '5.55'; // Berkeley local override

    // Capture the first TheRealMenu item, and clear any leftover override from a
    // prior interrupted run (keeps this stateful test idempotent).
    await selectTheRealMenu(catering);
    const origName = await firstMenuItemName(catering);
    await goToDataSync(catering);
    await resetLocalOverride(catering, origName).catch(() => undefined);

    try {
      // 10 — on Mercer, rename the item + set a known price.
      await selectTheRealMenu(catering);
      await editMenuItem(catering, origName, { newName: uniqueName, newPrice: PRICE_OFF });

      // 11 — Data Sync: Sync Name ON, Sync Price OFF.
      await goToDataSync(catering);
      await setGlobalSyncToggle(catering, 'Sync Name', true);
      await setGlobalSyncToggle(catering, 'Sync Price', false);

      // 12 — push sync.
      await runPushSyncNow(catering);

      // 13 — on Berkeley, the Name synced but the Price did NOT.
      await switchDistrict(catering, TARGET);
      await selectTheRealMenu(catering);
      await expect(
        catering.getByRole('button', { name: new RegExp(`Edit\\s+${escapeRegExp(uniqueName)}`, 'i') }).first(),
      ).toBeVisible({ timeout: 20000 });
      expect(await readMenuItemPrice(catering, uniqueName)).not.toBe('7.77');

      // 14 — back on Mercer: Sync Price ON, change Price, push -> Berkeley Price updates.
      await switchDistrict(catering, HOME);
      await goToDataSync(catering);
      await setGlobalSyncToggle(catering, 'Sync Price', true);
      await selectTheRealMenu(catering);
      await editMenuItem(catering, uniqueName, { newPrice: PRICE_ON });
      await goToDataSync(catering);
      await runPushSyncNow(catering);
      await switchDistrict(catering, TARGET);
      await selectTheRealMenu(catering);
      expect(await readMenuItemPrice(catering, uniqueName)).toBe('8.88');

      // 15 — on Berkeley, locally edit the Price (creates a local override); back on
      // Mercer, click the "Local Overrides" filter and confirm the item shows there.
      await editMenuItem(catering, uniqueName, { newPrice: PRICE_LOCAL });
      await switchDistrict(catering, HOME);
      const filtered = await findItemUnderLocalOverridesFilter(catering, uniqueName);
      await expect(filtered.getByText(/^Overrides$/i).first()).toBeVisible({ timeout: 10000 });

      // 16 — Sync Price ON globally but a local override present -> Berkeley keeps its Price.
      await runPushSyncNow(catering);
      await switchDistrict(catering, TARGET);
      await selectTheRealMenu(catering);
      expect(await readMenuItemPrice(catering, uniqueName)).toBe('5.55');

      // 17 — reset the local override, push, Berkeley Price updates back to Mercer's.
      await switchDistrict(catering, HOME);
      await goToDataSync(catering);
      expect(await resetLocalOverride(catering, uniqueName)).toBe(true);
      await runPushSyncNow(catering);
      await switchDistrict(catering, TARGET);
      await selectTheRealMenu(catering);
      expect(await readMenuItemPrice(catering, uniqueName)).toBe('8.88');
    } finally {
      // Self-clean so the next run starts from a known state.
      try {
        await switchDistrict(catering, HOME);
        await goToDataSync(catering);
        await resetLocalOverride(catering, uniqueName).catch(() => undefined);
        await setGlobalSyncToggle(catering, 'Sync Price', true).catch(() => undefined);
        await selectTheRealMenu(catering);
        await editMenuItem(catering, uniqueName, { newName: origName }).catch(() => undefined);
      } catch {
        /* best-effort cleanup */
      }
    }
  });
});
