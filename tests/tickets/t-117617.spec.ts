import { test, expect, type Locator, type Page } from '@playwright/test';
import {
  loginToK12Catering,
  navigateK12CateringMenu,
  getDistrictName,
} from '../../utils/helpers';
import { getEnvVar } from '../../utils/env';
import {
  goToDataSync,
  setGlobalSyncToggle,
  runPushSyncNow,
  switchDistrict,
  selectTheRealMenu,
  firstMenuItemName,
  editMenuItem,
  readMenuItemPrice,
  readMenuItemAllergens,
  readMenuItemIngredients,
  resetLocalOverride,
  findItemUnderLocalOverridesFilter,
  escapeRegExp,
  setIntendedDistrict,
} from '../../utils/dataSync';

/**
 * Catering - Data Sync - Add granular overrides for specific fields  (ADO PBI 117617).
 *
 * Kept as THREE tests on a shared session (not merged into one long test — a combined
 * district-switch-heavy run reliably trips the PrimeroEdge launcher token refresh,
 * whereas several shorter tests pass and a launcher hit only fails, and cheaply
 * retries, the affected one). Test A is the quick toggles + Push-sync check. Test B is
 * the cross-district sync + local-override flow for Price. Test C is the same
 * override/reset flow for Allergens + Ingredients together — added after a dev report
 * that those two weren't updating correctly around a local override; Test B only ever
 * exercised Price through that sequence, so Allergens/Ingredients had no coverage of
 * the override-wins / reset-restores-sync behavior specifically.
 *
 * NOT automated (manual): the schedule-triggered auto-sync (~9 PM CDT).
 */

const ATTRS = [
  'Sync Name', 'Sync Description', 'Sync Price', 'Sync Image',
  'Sync Allergens', 'Sync Ingredients', 'Sync Categories', 'Sync Varieties',
] as const;

// Data Sync runs from a "primary" district (the default landing district, which
// pushes) to an opted-in "target" district. Both differ per environment but the
// roles mirror each other, so keep them configurable:
//   QA  -> primary = Mercer County School District (default), target = Berkeley
//   UAT -> primary = Lee's Summit R-7 (DISTRICT_NAME), target = sabihLocal
// PRIMARY defaults to the env's default district (getDistrictName) just like QA;
// TARGET is set via DATA_SYNC_TARGET_DISTRICT in .env.release.
const PRIMARY_DISTRICT =
  getEnvVar('DATA_SYNC_PRIMARY_DISTRICT', { required: false }) || getDistrictName();
const TARGET_DISTRICT =
  getEnvVar('DATA_SYNC_TARGET_DISTRICT', { required: false }) || 'Berkeley School District';

test.describe.serial('Data Sync - Granular Attribute Sync Overrides [ADO 117617]', () => {
  let catering: Page;

  test.beforeAll(async ({ browser }) => {
    const context = await browser.newContext();
    const page = await context.newPage();
    catering = await loginToK12Catering(page);
    // Data Sync only shows for districts where it's enabled. Some envs (e.g. UAT,
    // whose default district is "Edge County Schools") don't have it on the
    // default district — switch to the Data Sync-enabled district when the nav
    // item is missing. QA's default district already has it, so this is a no-op there.
    const dataSyncNav = catering
      .locator('aside[aria-label="Main navigation"]')
      .getByLabel('Navigate to Data Sync');
    if (!(await dataSyncNav.isVisible({ timeout: 5000 }).catch(() => false))) {
      await switchDistrict(catering, PRIMARY_DISTRICT);
      await expect(dataSyncNav).toBeVisible();
    }
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
    await expect(dialog).toBeVisible();
    await expect(dialog.getByText(/Menu Item Sync Attributes/i)).toBeVisible();
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
    await expect(t).toBeVisible();
    if ((await isOn(t)) !== on) {
      await t.click();
      await catering.waitForTimeout(400);
      await expect(t).toHaveAttribute('aria-checked', String(on), { timeout: 5000 });
    }
  }

  // On the TARGET district, a pushed change can take a moment to propagate, and
  // the launcher token-refresh can revert the district mid-wait. So poll: re-open
  // the menu (district restoration re-applies TARGET each time) and check, until
  // the synced value holds or we time out. Requires intendedDistrict === TARGET
  // (set by the preceding switchDistrict(TARGET)).
  const SYNC_POLL = { timeout: 90000, intervals: [4000, 4000, 6000, 6000] };
  async function expectItemOnTarget(name: string): Promise<void> {
    await expect(async () => {
      await selectTheRealMenu(catering);
      await expect(
        catering.getByRole('button', { name: new RegExp(`Edit\\s+${escapeRegExp(name)}`, 'i') }).first(),
      ).toBeVisible({ timeout: 6000 });
    }).toPass(SYNC_POLL);
  }
  async function expectPriceOnTarget(name: string, price: string): Promise<void> {
    await expect(async () => {
      await selectTheRealMenu(catering);
      expect(await readMenuItemPrice(catering, name)).toBe(price);
    }).toPass(SYNC_POLL);
  }
  /**
   * `mode: 'contains'` for the plain sync cases: a push ADDS the source's values to
   * the target rather than replacing the list, so a value the source no longer has
   * legitimately stays behind. Asserting an exact match failed every run for a
   * behaviour that is working as intended. What matters is that the pushed value
   * arrives.
   *
   * `mode: 'exact'` stays the default and is used for the local-override case,
   * where the point is that the target keeps ITS OWN values and the sync does not
   * apply at all. Loosening that one would hide a genuinely broken override.
   */
  async function expectAllergensIngredientsOnTarget(
    name: string,
    allergens: string[],
    ingredients: string[],
    mode: 'exact' | 'contains' = 'exact',
    poll: { timeout: number; intervals: number[] } = SYNC_POLL,
  ): Promise<void> {
    await expect(async () => {
      await selectTheRealMenu(catering);
      const gotAllergens = await readMenuItemAllergens(catering, name);
      const gotIngredients = await readMenuItemIngredients(catering, name);
      if (mode === 'contains') {
        expect(gotAllergens).toEqual(expect.arrayContaining(allergens));
        expect(gotIngredients).toEqual(expect.arrayContaining(ingredients));
      } else {
        expect(gotAllergens).toEqual(allergens);
        expect(gotIngredients).toEqual(ingredients);
      }
    }).toPass(poll);
  }

  // ── Test A: toggles render + persist, then Push-sync reflects them ─────────────
  test('global attribute toggles render, persist, and drive Push Sync Now', async () => {
    const dialog = await openManage();
    for (const name of ATTRS) {
      await expect(attrToggle(dialog, name)).toBeVisible();
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
    await expect(dlg).toBeVisible();
    await expect(dlg.getByText(/Push sync now\?/i)).toBeVisible();
    await expect(dlg.getByText(/Menu item attributes/i)).toBeVisible();
    // The "...will not be synced (globally off)" notice lists ALL globally-off
    // attributes together (e.g. "Description, Price, Image will not be synced..."),
    // so the list varies run to run - assert Price is INCLUDED, plus the 2nd sentence.
    await expect(dlg.getByText('Name', { exact: true }).first()).toBeVisible();
    const offNotice = dlg.getByText(/will not be synced \(globally off\)/i).first();
    await expect(offNotice).toBeVisible();
    await expect(offNotice).toContainText(/Price/i);
    await expect(dlg.getByText(/Per-item overrides may differ/i).first()).toBeVisible();
    await dlg.getByRole('button', { name: /^Cancel$/i }).first().click();
    await closeDialog();
    const restore = await openManage();
    await setToggle(restore, 'Sync Price', original);
    await closeDialog();
  });

  // ── Test B: per-attribute sync across districts + local override [steps 10-17] ─
  test('per-attribute sync respects toggles across districts, and local overrides win', async () => {
    test.slow(); // long multi-district flow

    const HOME = PRIMARY_DISTRICT; // QA: Mercer County School District; UAT: Lee's Summit R-7
    const TARGET = TARGET_DISTRICT; // QA: Berkeley School District; UAT: sabihLocal
    const stamp = `${Date.now()}`.slice(-6);
    const uniqueName = `AutoSync ${stamp}`;
    // Varied per run, and deliberately so. A fixed probe price is a trap here:
    // this test reuses the same menu item every run, and if step 13 fails, steps
    // 14-17 never execute, leaving TARGET holding exactly that price. The next
    // run then fails on the leftover value rather than on anything the sync did
    // — so a single bad day turns into a permanent red that no re-run can clear,
    // and the failure looks like an app bug when the app is behaving correctly.
    // (That is exactly what happened from 2026-08-18 onward.) Varying it means
    // stale data can never satisfy the assertion.
    const PRICE_OFF = `7.${stamp.slice(-2)}`; // set while Sync Price OFF -> must NOT propagate
    const PRICE_ON = '8.88';    // set while Sync Price ON  -> must propagate
    const PRICE_LOCAL = '5.55'; // target-district local override

    // Opt in to launcher-revert district restoration for this long, district-
    // switch-heavy flow: the PrimeroEdge launcher token-refresh reloads the app
    // mid-test and snaps back to the persisted district, which would otherwise
    // make the cross-district assertions run on the wrong district. The session
    // is already on HOME here (set in beforeAll).
    setIntendedDistrict(catering, HOME);

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

      // 13 — on the TARGET district, the Name synced but the Price did NOT.
      await switchDistrict(catering, TARGET);
      await expectItemOnTarget(uniqueName);
      expect(await readMenuItemPrice(catering, uniqueName)).not.toBe(PRICE_OFF);

      // 14 — back on Mercer: Sync Price ON, change Price, push -> Berkeley Price updates.
      await switchDistrict(catering, HOME);
      await goToDataSync(catering);
      await setGlobalSyncToggle(catering, 'Sync Price', true);
      await selectTheRealMenu(catering);
      await editMenuItem(catering, uniqueName, { newPrice: PRICE_ON });
      await goToDataSync(catering);
      await runPushSyncNow(catering);
      await switchDistrict(catering, TARGET);
      await expectPriceOnTarget(uniqueName, '8.88');

      // 15 — on the TARGET district, locally edit the Price (creates a local
      // override); back on HOME, click the "Local Overrides" filter and confirm
      // the item shows there.
      await selectTheRealMenu(catering);
      await editMenuItem(catering, uniqueName, { newPrice: PRICE_LOCAL });
      await switchDistrict(catering, HOME);
      const filtered = await findItemUnderLocalOverridesFilter(catering, uniqueName);
      await expect(filtered.getByText(/^Overrides$/i).first()).toBeVisible();

      // 16 — Sync Price ON globally but a local override present -> the target
      // keeps its own Price.
      await runPushSyncNow(catering);
      await switchDistrict(catering, TARGET);
      await expectPriceOnTarget(uniqueName, '5.55');

      // 17 — reset the local override, push, the target Price updates back to HOME's.
      await switchDistrict(catering, HOME);
      await goToDataSync(catering);
      expect(await resetLocalOverride(catering, uniqueName)).toBe(true);
      await runPushSyncNow(catering);
      await switchDistrict(catering, TARGET);
      await expectPriceOnTarget(uniqueName, '8.88');
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
      } finally {
        // Stop tracking so it can't affect later tests in this file.
        setIntendedDistrict(catering, null);
      }
    }
  });

  // ── Test C: local overrides win + reset restores sync, for Allergens & Ingredients ──
  // Mirrors Test B's Price flow (steps 15-18), but for the two fields a dev reported
  // as "not being properly updated" around a local override. Test B only ever proved
  // the override-wins/reset-restores-sync mechanism with Price, so this closes that gap.
  test('local overrides win and reset restores sync, for Allergens and Ingredients', async () => {
    test.slow(); // long multi-district flow, same shape as Test B

    const HOME = PRIMARY_DISTRICT;
    const TARGET = TARGET_DISTRICT;
    const stamp = `${Date.now()}`.slice(-6);
    const uniqueName = `AutoSyncAI ${stamp}`;
    const ALLERGEN_SYNCED = 'AutoTestAllergenSynced';
    const ALLERGEN_LOCAL = 'AutoTestAllergenLocal';
    const INGREDIENT_SYNCED = 'AutoTestIngredientSynced';
    const INGREDIENT_LOCAL = 'AutoTestIngredientLocal';

    setIntendedDistrict(catering, HOME);

    // Capture the first TheRealMenu item + its original Allergens/Ingredients (to
    // restore in cleanup), and clear any leftover override from a prior interrupted run.
    await selectTheRealMenu(catering);
    const origName = await firstMenuItemName(catering);
    const origAllergens = await readMenuItemAllergens(catering, origName);
    const origIngredients = await readMenuItemIngredients(catering, origName);
    await goToDataSync(catering);
    await resetLocalOverride(catering, origName).catch(() => undefined);

    try {
      // Both attributes must sync globally for this flow (Test A/B leave them ON;
      // assert defensively rather than assume).
      await setGlobalSyncToggle(catering, 'Sync Allergens', true);
      await setGlobalSyncToggle(catering, 'Sync Ingredients', true);

      // On HOME, rename the item + set known Allergens/Ingredients, then push sync.
      await selectTheRealMenu(catering);
      await editMenuItem(catering, origName, {
        newName: uniqueName,
        newAllergens: [ALLERGEN_SYNCED],
        newIngredients: [INGREDIENT_SYNCED],
      });
      // Pin HOME's own values BEFORE pushing. setChips clears existing chips then
      // adds the new ones, so HOME must read back exactly the two test values — if a
      // stale chip survived here, the mismatch is this edit, not the sync. Asserting
      // it separates "the edit didn't replace" from "the sync didn't replace" instead
      // of blaming the target for state that was already wrong on the source.
      expect(await readMenuItemAllergens(catering, uniqueName)).toEqual([ALLERGEN_SYNCED]);
      expect(await readMenuItemIngredients(catering, uniqueName)).toEqual([INGREDIENT_SYNCED]);
      await goToDataSync(catering);
      await runPushSyncNow(catering);

      // On the TARGET district, both attributes synced.
      await switchDistrict(catering, TARGET);
      await expectItemOnTarget(uniqueName);
      await expectAllergensIngredientsOnTarget(uniqueName, [ALLERGEN_SYNCED], [INGREDIENT_SYNCED], 'contains');

      // On the TARGET district, locally edit both attributes (creates a local override).
      await selectTheRealMenu(catering);
      await editMenuItem(catering, uniqueName, {
        newAllergens: [ALLERGEN_LOCAL],
        newIngredients: [INGREDIENT_LOCAL],
      });

      // Back on HOME, confirm the item shows under the Local Overrides filter.
      await switchDistrict(catering, HOME);
      const filtered = await findItemUnderLocalOverridesFilter(catering, uniqueName);
      await expect(filtered.getByText(/^Overrides$/i).first()).toBeVisible();

      // Both attributes ON globally but a local override present -> the target keeps
      // its own (local) values.
      await runPushSyncNow(catering);
      await switchDistrict(catering, TARGET);
      await expectAllergensIngredientsOnTarget(uniqueName, [ALLERGEN_LOCAL], [INGREDIENT_LOCAL]);

      // Reset the local override, push again -> the target updates to HOME's values.
      await switchDistrict(catering, HOME);
      await goToDataSync(catering);
      expect(await resetLocalOverride(catering, uniqueName)).toBe(true);

      // Wait for the reset to actually land before pushing. resetLocalOverride
      // returns as soon as the confirm is clicked, so the push could go out while
      // the item was still registered as overridden - and an overridden item is
      // skipped, so the target received nothing and it read as "reset does not
      // restore sync". Done by hand the value comes through fine, which is what
      // pinned this on the timing rather than the app. Waiting for the item to
      // drop off the Local Overrides filter is the app telling us it is done.
      await expect(async () => {
        let stillOverridden = true;
        try {
          await findItemUnderLocalOverridesFilter(catering, uniqueName, 1);
        } catch {
          stillOverridden = false;
        }
        expect(stillOverridden).toBe(false);
      }).toPass({ timeout: 60000, intervals: [3000, 5000, 5000] });

      await runPushSyncNow(catering);
      await switchDistrict(catering, TARGET);
      await expectAllergensIngredientsOnTarget(uniqueName, [ALLERGEN_SYNCED], [INGREDIENT_SYNCED], 'contains',
        { timeout: 180000, intervals: [5000, 5000, 10000, 10000] });
    } finally {
      // Self-clean so the next run starts from a known state.
      try {
        await switchDistrict(catering, HOME);
        await goToDataSync(catering);
        await resetLocalOverride(catering, uniqueName).catch(() => undefined);
        await selectTheRealMenu(catering);
        await editMenuItem(catering, uniqueName, {
          newName: origName,
          newAllergens: origAllergens,
          newIngredients: origIngredients,
        }).catch(() => undefined);
      } catch {
        /* best-effort cleanup */
      } finally {
        setIntendedDistrict(catering, null);
      }
    }
  });
});
