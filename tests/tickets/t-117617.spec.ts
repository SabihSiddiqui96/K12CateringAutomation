import { test, expect, type Locator, type Page } from '@playwright/test';
import { loginToK12Catering, navigateK12CateringMenu } from '../../utils/helpers';

/**
 * Catering - Data Sync - Add granular overrides for specific fields  (ADO PBI 117617).
 *
 * Feature: in Catering > Data Sync, the "Target Districts > Manage" dialog exposes a
 * "Menu Item Sync Attributes - Global defaults" section with a toggle per attribute
 * (Name, Description, Price, Image, Allergens, Ingredients, Categories, Varieties).
 * The "Push sync now" dialog reflects those toggles as a read-only list of the
 * attributes that will be pushed.
 *
 * Automated here (the deterministic, UI-level contract):
 *   A) the 8 attribute toggles render and persist across re-opens.
 *   B) the "Push sync now" dialog reflects the toggles (a toggled-OFF attribute is
 *      omitted from the "global defaults" list shown before syncing).
 *
 * NOT automated (see T-117617 manual notes): the end-to-end data propagation
 * (edit source -> sync -> verify per-attribute on a target district), auto-sync
 * (schedule-triggered), and per-item local overrides (multi-district stateful flow).
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

  // ── Test A ───────────────────────────────────────────────────────────────────
  test('A - global attribute toggles render and persist', async () => {
    const dialog = await openManage();

    // Step 1 — all 8 attribute toggles are present.
    for (const name of ATTRS) {
      await expect(attrToggle(dialog, name)).toBeVisible({ timeout: 10000 });
    }

    // Step 2 — flip one toggle (Sync Price) and confirm it changed.
    const price = attrToggle(dialog, 'Sync Price');
    const original = await isOn(price);
    await price.click();
    await expect(price).toHaveAttribute('aria-checked', String(!original), { timeout: 5000 });

    // Step 3 — close and re-open; the change persisted.
    await closeDialog();
    const dialog2 = await openManage();
    const price2 = attrToggle(dialog2, 'Sync Price');
    await expect(price2).toHaveAttribute('aria-checked', String(!original), { timeout: 5000 });

    // Step 4 — restore the original state (leave env unchanged).
    await setToggle(dialog2, 'Sync Price', original);
    await closeDialog();
  });

  // ── Test B ───────────────────────────────────────────────────────────────────
  test('B - Push Sync Now reflects the global default toggles', async () => {
    // Step 1 — turn Sync Price OFF (keep Sync Name ON) and close.
    const dialog = await openManage();
    await setToggle(dialog, 'Sync Price', false);
    await setToggle(dialog, 'Sync Name', true);
    await closeDialog();

    // Step 2 — open "Push sync now"; the confirm dialog lists the global-default attributes.
    await catering.getByRole('button', { name: /Push sync now/i }).first().click();
    const dlg = catering.getByRole('dialog').first();
    await expect(dlg).toBeVisible({ timeout: 10000 });
    await expect(dlg.getByText(/Push sync now\?/i)).toBeVisible({ timeout: 10000 });
    await expect(dlg.getByText(/Menu item attributes/i)).toBeVisible({ timeout: 10000 });

    // Step 3 — the dialog reflects the toggles: an ON attribute (Name) is listed, and the
    // OFF attribute (Price) shows the "will not be synced (globally off)" notice.
    await expect(dlg.getByText('Name', { exact: true }).first()).toBeVisible({ timeout: 10000 });
    await expect(dlg.getByText(/Price will not be synced \(globally off\)/i)).toBeVisible({ timeout: 10000 });

    // Step 4 — Cancel (do NOT run the sync).
    await dlg.getByRole('button', { name: /^Cancel$/i }).first().click();
    await closeDialog();

    // Step 5 — restore Sync Price ON.
    const restore = await openManage();
    await setToggle(restore, 'Sync Price', true);
    await closeDialog();
  });
});
