// Test Link: https://dev.azure.com/Cybersoft-Technologies-Inc/PrimeroEdge%20Classic/_workitems/edit/113438

import { test, expect, Page } from '@playwright/test';
import {
  loginToK12Catering,
  scrollUntilVisible,
  getDistrictName,
  getSecondaryDistrictName,
  getCustomerAccountEmail,
  isUatDirectLogin,
  escapeRegExp,
  setListPageSize,
  waitForListSettled,
  LIST_ROW_SELECTOR,
} from '../../utils/helpers';
// These used to be private copies in this file. They had drifted from the shared
// ones - the local ensureInK12CateringApp clicked the launcher link, which opens a
// new tab and strands this page - so use the shared versions.
import {
  ensureInK12CateringApp,
  clickSidebarItem,
  safeNavigate,
  dismissAnyModal,
  switchDistrict,
  closeOpenDialog,
  goToDataSync,
  runPushSyncNow,
} from '../../utils/dataSync';
import { getEnvVar } from '../../utils/env';
import { getK12CateringLoginUrl } from '../../utils/baseUrl';
import { resetCustomerPasswordFromAccounts } from '../../utils/accountFlow';

test.use({ storageState: { cookies: [], origins: [] } });

// ─── Constants ──────────────────────────────────────────────────────────────

// Timestamp, not Math.random(): two workers drawing the same number would rename
// each other's item and it would read as a sync bug.
const RENAMED_MENU_ITEM = `AutoRenamed ${`${Date.now()}`.slice(-6)}`;

// What the Sync Log shows under "Triggered By" - the display name behind
// PE_USERNAME. Env-driven so another QA user overrides it instead of editing this.
const SYNC_TRIGGERED_BY =
  getEnvVar('SYNC_TRIGGERED_BY', { required: false }) || 'Sabih Siddiqui';

// ─── Districts → District Group section ────────────────────────────────────

async function waitForDistrictsPageReady(page: Page): Promise<void> {
  await expect(
    page.getByRole('heading', { name: /District Management/i }).first(),
  ).toBeVisible({ timeout: 15000 });

  // Let the panels finish loading, then wait for the group panel's own button.
  await waitForListSettled(page);
  await page
    .getByRole('button', { name: /Edit (district )?group|View Districts/i })
    .first()
    .waitFor({ state: 'visible', timeout: 15000 })
    .catch(() => undefined);
}

async function openViewDistrictsInGroupDialog(page: Page): Promise<void> {
  await safeNavigate(page, 'Districts');
  await waitForDistrictsPageReady(page);

  // The right-hand "District Group" panel exposes a per-group action button.
  // The exact wording can vary ("View Districts in this Group", "View
  // Districts", or an aria-label like "View districts in <group name>").
  const viewBtn = page
    .getByRole('button', { name: /View Districts in this Group/i })
    .or(page.getByRole('button', { name: /View Districts/i }))
    .or(page.getByRole('button', { name: /View districts in/i }))
    .first();

  // The button might be lower on the page — scroll if needed
  await scrollUntilVisible(page, { target: viewBtn }).catch(() => undefined);

  if (!(await viewBtn.isVisible({ timeout: 3000 }).catch(() => false))) {
    throw new Error(
      'Could not find a "View Districts in this Group" button on the Districts page. ' +
        'Confirm at least one District Group exists for the test district.',
    );
  }

  await viewBtn.click();

  await expect(
    page
      .getByRole('dialog')
      .or(page.getByRole('heading', { name: /Districts in (this )?Group/i })),
  ).toBeVisible({ timeout: 10000 });
}

async function setPrimaryDistrict(
  page: Page,
  desired: string,
): Promise<string> {
  // App renders a curly apostrophe (Lee’s) where the env value has a straight
  // one (Lee's); compare/select apostrophe- and whitespace-insensitively.
  const normApos = (s: string) =>
    s.replace(/['‘’]/g, "'").replace(/\s+/g, ' ').trim().toLowerCase();
  await safeNavigate(page, 'Districts');

  const editGroupBtn = page
    .getByRole('button', { name: /Edit (district )?group/i })
    .first();
  await scrollUntilVisible(page, { target: editGroupBtn });
  await expect(editGroupBtn).toBeVisible({ timeout: 10000 });
  await editGroupBtn.click();

  const primaryDistrictControl = page
    .getByRole('combobox', { name: /Primary District/i })
    .or(page.getByLabel(/Primary District/i))
    .first();
  await expect(primaryDistrictControl).toBeVisible({ timeout: 10000 });

  // Read the current primary's label so we can pick a *different* option
  // first to trigger the warning, then switch to the desired one.
  const currentValue = (
    (await primaryDistrictControl.inputValue().catch(() => '')) ?? ''
  ).trim();
  const currentLabel = currentValue
    ? (
        await primaryDistrictControl
          .locator(`option[value="${currentValue.replace(/"/g, '\\"')}"]`)
          .first()
          .textContent()
          .catch(() => '')
      )?.trim() ?? ''
    : '';

  const allOptions = (
    await primaryDistrictControl.locator('option').allTextContents()
  )
    .map((o) => o.trim())
    .filter((o) => o && !/^select|^choose/i.test(o));
  // A non-current member to select first so the amber warning is triggered.
  const differentOption =
    allOptions.find(
      (o) =>
        normApos(o) !== normApos(desired) &&
        normApos(o) !== normApos(currentLabel),
    ) ??
    allOptions.find((o) => normApos(o) !== normApos(currentLabel));

  // Prefer the requested district if it's actually a member of the group being
  // edited; otherwise fall back to any real member. Group membership on UAT
  // varies (the requested district may live in a different group), and the
  // specific district is incidental to what this test verifies. Resolving to an
  // on-screen label also handles the straight-vs-curly apostrophe difference.
  const desiredOption =
    allOptions.find((o) => normApos(o) === normApos(desired)) ??
    differentOption ??
    desired;

  // Pick a different option first so the amber warning is triggered, then
  // assert it's visible.
  if (differentOption) {
    await primaryDistrictControl.selectOption({ label: differentOption });
    await expect(
      page.getByText(
        /Warning:\s*Changing the primary district will affect data sync for all districts in this group\.?/i,
      ),
    ).toBeVisible({ timeout: 10000 });
  }

  // Now select the desired option (resolved to its on-screen label).
  await primaryDistrictControl.selectOption({ label: desiredOption });

  // If the desired option matches the current primary, no save is needed —
  // close the dialog (warning is gone, nothing to confirm).
  if (normApos(desiredOption) === normApos(currentLabel)) {
    const cancelBtn = page.getByRole('button', { name: /^Cancel$/i }).last();
    if (await cancelBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
      await cancelBtn.click();
    } else {
      await page.keyboard.press('Escape');
    }
    await page
      .getByRole('dialog')
      .first()
      .waitFor({ state: 'hidden', timeout: 5000 })
      .catch(() => undefined);
    return desiredOption;
  }

  const saveBtn = page
    .getByRole('button', { name: /Save Changes|^Save$|^Update$/i })
    .last();
  await expect(saveBtn).toBeVisible({ timeout: 10000 });
  await saveBtn.click();

  // Confirmation dialog
  const changePrimaryHeading = page
    .getByRole('heading', { name: /Change Primary District/i })
    .first();
  if (
    await changePrimaryHeading.isVisible({ timeout: 5000 }).catch(() => false)
  ) {
    const continueBtn = page
      .getByRole('button', { name: /Continue/i })
      .or(
        page
          .locator('button')
          .filter({ hasText: /^\s*Continue\s*$/i }),
      )
      .last();
    await expect(continueBtn).toBeVisible({ timeout: 10000 });
    await continueBtn.click({ force: true });
    await expect(changePrimaryHeading).toBeHidden({ timeout: 10000 });
  }

  await expect(
    page.getByText(/updated|saved|success/i).first(),
  ).toBeVisible({ timeout: 15000 });

  return desiredOption;
}

/**
 * Open the Edit District Group dialog and ensure the Primary District is
 * "Mercer County School District" — re-pick it even when it's already
 * selected so the test always lands in a known state. Returns
 * { chosen, previous } where chosen is always Mercer.
 */
async function togglePrimaryDistrict(
  page: Page,
): Promise<{ chosen: string; previous: string }> {
  await safeNavigate(page, 'Districts');

  const editGroupBtn = page
    .getByRole('button', { name: /Edit (district )?group/i })
    .first();
  await scrollUntilVisible(page, { target: editGroupBtn });
  await expect(editGroupBtn).toBeVisible({ timeout: 10000 });
  await editGroupBtn.click();

  const primaryDistrictControl = page
    .getByRole('combobox', { name: /Primary District/i })
    .or(page.getByLabel(/Primary District/i))
    .first();
  await expect(primaryDistrictControl).toBeVisible({ timeout: 10000 });

  // Read the current primary's *label* (not its value attribute)
  const previousValue = (
    (await primaryDistrictControl.inputValue().catch(() => '')) ?? ''
  ).trim();
  const previous = previousValue
    ? (
        await primaryDistrictControl
          .locator(`option[value="${previousValue.replace(/"/g, '\\"')}"]`)
          .first()
          .textContent()
          .catch(() => '')
      )?.trim() ?? ''
    : '';

  // Cancel out of the dialog we opened just to read state
  const cancelBtn = page.getByRole('button', { name: /^Cancel$/i }).last();
  if (await cancelBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
    await cancelBtn.click();
  } else {
    await page.keyboard.press('Escape');
  }
  await page
    .getByRole('dialog')
    .first()
    .waitFor({ state: 'hidden', timeout: 5000 })
    .catch(() => undefined);

  // Set the group's primary to the data-sync district so the rest of the test
  // is predictable. Data Sync is per-district: on UAT only the secondary
  // (Alief ISD) is a working data-sync primary, so use it there; on QA the home
  // district is the data-sync source. setPrimaryDistrict re-selects the option
  // even when it's already current (still verifies the dropdown + warning) and
  // returns the actual on-screen label so downstream regex checks match.
  const dataSyncDistrict = isUatDirectLogin()
    ? getSecondaryDistrictName()
    : getDistrictName();
  const chosen = await setPrimaryDistrict(page, dataSyncDistrict);

  return { chosen, previous };
}

// ─── Data Sync page ────────────────────────────────────────────────────────

/**
 * Open the Data Sync "Target districts" Manage dialog, toggle the given
 * district's opt-in switch to the desired state (on/off), then close.
 */
async function toggleTargetDistrictOptIn(
  page: Page,
  districtName: string,
  desiredOn: boolean,
): Promise<void> {
  const manageBtn = page
    .getByRole('button', { name: /^Manage$/i })
    .or(page.getByRole('link', { name: /^Manage$/i }))
    .first();
  await scrollUntilVisible(page, { target: manageBtn }).catch(() => undefined);
  await expect(manageBtn).toBeVisible({ timeout: 10000 });
  await manageBtn.click();

  const dialog = page.getByRole('dialog').first();
  await expect(dialog).toBeVisible({ timeout: 10000 });

  // The toggle is a <button role="switch"> with an aria-label that flips
  // between "Opt out <District> for data sync" (when currently on) and
  // "Opt in <District> for data sync" (when currently off). Match either.
  const toggle = dialog
    .getByRole('switch', {
      name: new RegExp(
        `Opt (in|out) ${escapeRegExp(districtName)} for data sync`,
        'i',
      ),
    })
    .or(
      dialog.locator(
        `button[role="switch"][aria-label*="${districtName.replace(
          /"/g,
          '\\"',
        )}"]`,
      ),
    )
    .first();
  await expect(toggle).toBeVisible({ timeout: 10000 });

  // aria-checked = "true" when opted in, "false" when opted out
  const isOn =
    (await toggle.getAttribute('aria-checked').catch(() => null)) === 'true';
  if (isOn !== desiredOn) {
    await toggle.click();
    // The attribute flipping confirms the opt-in saved.
    await expect(toggle).toHaveAttribute('aria-checked', String(desiredOn), {
      timeout: 8000,
    });
  }

  await closeOpenDialog(page);
}

async function getTargetDistrictsFromManageDialog(
  page: Page,
): Promise<string[]> {
  // The "Manage" trigger sits under the "Target districts" header — it can
  // be a link or a button depending on the build
  const manageBtn = page
    .getByRole('button', { name: /^Manage$/i })
    .or(page.getByRole('link', { name: /^Manage$/i }))
    .first();
  await scrollUntilVisible(page, { target: manageBtn }).catch(() => undefined);
  await expect(manageBtn).toBeVisible({ timeout: 10000 });
  await manageBtn.click();

  const dialog = page.getByRole('dialog').first();
  await expect(dialog).toBeVisible({ timeout: 10000 });

  // If not all districts are opted in, "Opt in all" is enabled — click it and confirm
  const optInAllBtn = dialog.getByRole('button', { name: /opt\s*in\s*all/i }).first();
  const optInAllDisabled = await optInAllBtn.isDisabled().catch(() => true);
  if (!optInAllDisabled) {
    await optInAllBtn.click();
    const confirmDialog = page.getByRole('dialog').last();
    await expect(confirmDialog).toBeVisible({ timeout: 10000 });
    await confirmDialog
      .getByRole('button', { name: /yes,?\s*opt\s*in\s*all/i })
      .first()
      .click();
    await expect(optInAllBtn).toBeDisabled({ timeout: 15000 });
  }

  // The dialog renders rows like:
  //   "Berkeley School District   Primary (source)"
  //   "Mercer County School District   Opted in"
  // Grab all visible text nodes and pull the "<name> District<...>" prefix
  const rawTexts = await dialog
    .locator('div')
    .evaluateAll((els) =>
      Array.from(
        new Set(
          els
            .map((el) => (el.textContent ?? '').replace(/\s+/g, ' ').trim())
            .filter(Boolean),
        ),
      ),
    );

  const districtNames = Array.from(
    new Set(
      rawTexts
        .map((t) => {
          const m = t.match(
            /^([A-Za-z][\w'.\- ]*?\s+District(?:\s*-\s*\w+)?)/,
          );
          return m ? m[1].trim() : null;
        })
        .filter((n): n is string => !!n),
    ),
  );

  await closeOpenDialog(page);
  return districtNames;
}

// Clean up leftover local overrides from a prior interrupted run (which renamed a
// target item to "AutoRenamed ..." and died before its reset step). Name-agnostic:
// uses the home district's Data Sync "Local Overrides" filter and resets each row,
// so the target's items start from a synced baseline. Best-effort; never throws.
async function resetAllLocalOverrides(page: Page): Promise<void> {
  let resetAny = false;
  try {
    for (let i = 0; i < 10; i++) {
      await goToDataSync(page);
      const filterBtn = page
        .getByRole('button', { name: /^Local Overrides$/i })
        .first();
      if (!(await filterBtn.isVisible({ timeout: 8000 }).catch(() => false))) break;
      await filterBtn.click();
      await waitForListSettled(page);

      const row = page
        .locator(LIST_ROW_SELECTOR)
        .filter({ has: page.getByText(/^Overrides$/i) })
        .first();
      if (!(await row.isVisible({ timeout: 5000 }).catch(() => false))) break; // none left

      const detailsBtn = row.getByRole('button', { name: /^Details$/i }).first();
      if (!(await detailsBtn.isVisible({ timeout: 3000 }).catch(() => false))) break;
      await detailsBtn.click();

      const resetBtn = page
        .getByRole('dialog')
        .first()
        .getByRole('button', { name: /Reset Local Overrides/i })
        .first();
      if (!(await resetBtn.isVisible({ timeout: 5000 }).catch(() => false))) {
        await closeOpenDialog(page, { required: false });
        break;
      }
      await resetBtn.click();
      const resetDlg = page
        .getByRole('dialog')
        .filter({ has: page.getByRole('heading', { name: /Reset Local Overrides/i }) })
        .first();
      await expect(resetDlg).toBeVisible({ timeout: 10000 });
      await resetDlg
        .getByRole('button', { name: /Reset Overrides|^Reset$|^Confirm$/i })
        .last()
        .click();
      await page
        .getByText(/Local overrides reset/i)
        .first()
        .waitFor({ state: 'visible', timeout: 15000 })
        .catch(() => {});
      await closeOpenDialog(page, { required: false });
      resetAny = true;
    }

    // "Reset Local Overrides" only clears the flag so sync may overwrite again —
    // the target's actual value (e.g. a renamed item) reverts to the home value
    // only on the next push sync. Run one so the target items truly go back to
    // their synced names (otherwise the "first item" still reads "AutoRenamed …").
    if (resetAny) {
      await goToDataSync(page);
      await runPushSyncNow(page);
    }
  } catch {
    // best-effort cleanup — don't fail the test on teardown
  }
}

// ─── Test ──────────────────────────────────────────────────────────────────

test('Catering - Districts/Data Sync - Group, primary district, sync log and overrides', async ({
  page,
  browser,
}) => {
  test.setTimeout(10 * 60 * 1000);

  const catering = await loginToK12Catering(page);

  // Produced in one step and used in a later one; each test.step is its own closure.
  let chosenPrimary = '';
  let previousPrimary = '';
  let targetDistricts: string[] = [];
  let homeDistrict = '';
  let targetDistrict = '';
  let originalMenuItemName = '';

  await test.step('Step 1-2 — Districts: View Districts in this Group', async () => {
    // ── Step 1-2: Districts → View Districts in this Group ──
    await openViewDistrictsInGroupDialog(catering);
    const groupDialog = catering.getByRole('dialog').first();
    await expect(groupDialog).toBeVisible({ timeout: 10000 });
    // Verify at least one district is listed inside the group dialog
    await expect(
      groupDialog.locator('li, tr, [role="listitem"]').first(),
    ).toBeVisible({ timeout: 10000 });

    await closeOpenDialog(catering);
  });

  await test.step('Step 3 — Edit group: change the Primary District and save', async () => {
    // ── Step 3: Edit group → toggle Primary District → save ──
    ({ chosen: chosenPrimary, previous: previousPrimary } =
      await togglePrimaryDistrict(catering));
  });

  await test.step('Step 4 — Group view shows the new Primary district', async () => {
    // ── Step 4: Re-open the group view and verify Primary label is on it ──
    await openViewDistrictsInGroupDialog(catering);
    const groupDialog2 = catering.getByRole('dialog').first();
    const primaryRow = groupDialog2
      .locator('li, tr, [role="listitem"]')
      .or(
        groupDialog2
          .locator('div')
          .filter({ hasText: new RegExp(escapeRegExp(chosenPrimary), 'i') }),
      )
      .filter({ hasText: new RegExp(escapeRegExp(chosenPrimary), 'i') })
      .first();
    await expect(primaryRow).toBeVisible({ timeout: 10000 });
    await expect(primaryRow).toContainText(/Primary/i);
    await closeOpenDialog(catering);

    // Note: previousPrimary captured for traceability; we intentionally don't
    // restore it here because doing so requires re-opening the same group dialog
    // before the previous save fully settles, and sometimes a different group
    // dialog opens. The override flow below is tolerant of unsynced state.
    void previousPrimary;
  });

  await test.step('Step 5 — Data Sync: header, auto-sync, frequency, targets, sync log', async () => {
    // ── Step 5: Data Sync — verify top-level controls ──
    // Data Sync only exists when the active district is a data-sync primary. On
    // UAT switch into the primary we just set (Alief ISD) so the sidebar item is
    // present and the sub-header shows that district.
    if (isUatDirectLogin()) {
      await switchDistrict(catering, chosenPrimary);
    }
    await goToDataSync(catering);

    // Verify the Data Sync sub-header reads:
    //   "Push shared catalog from <Primary District> (primary) to opted-in districts"
    // and the primary district name matches whatever we just set above.
    await expect(
      catering.getByText(
        new RegExp(
          `Push shared catalog from\\s+${escapeRegExp(chosenPrimary)}\\s*\\(primary\\)\\s+to opted-in districts`,
          'i',
        ),
      ),
    ).toBeVisible({ timeout: 10000 });

    // Auto-sync toggle (label uses a hyphen in the UI)
    const autoSyncToggle = catering
      .getByRole('switch', { name: /Auto[\s-]?sync/i })
      .or(catering.getByRole('checkbox', { name: /Auto[\s-]?sync/i }))
      .or(catering.getByLabel(/Auto[\s-]?sync/i))
      .first();
    await expect(autoSyncToggle).toBeVisible({ timeout: 10000 });

    // Sync frequency dropdown — verify both day-based and weekly options
    // produce the right scheduled-time text below the dropdown
    const frequencySelect = catering
      .getByRole('combobox', { name: /Sync\s*frequency/i })
      .or(catering.getByLabel(/Sync\s*frequency/i))
      .first();
    await expect(frequencySelect).toBeVisible({ timeout: 10000 });

    // The frequency dropdown is disabled while Auto-sync is off. Enable Auto-sync
    // (if needed) and wait for it to become enabled. The PrimeroEdge launcher
    // (token refresh) can fire here on a long session — recover via goToDataSync
    // (re-auths + returns to Data Sync) and retry rather than failing.
    if (await frequencySelect.isDisabled().catch(() => false)) {
      await autoSyncToggle.click();
      await catering
        .getByText(/Auto-sync settings saved/i)
        .first()
        .waitFor({ state: 'visible', timeout: 10000 })
        .catch(() => {});
      await expect(async () => {
        const launcher = catering.locator('a[href*="/login?token="]').first();
        if (await launcher.isVisible({ timeout: 1000 }).catch(() => false)) {
          await goToDataSync(catering);
        }
        expect(await frequencySelect.isEnabled().catch(() => false)).toBeTruthy();
      }).toPass({ timeout: 40000, intervals: [3000, 5000, 8000] });
    }

    const frequencyOptions = (
      await frequencySelect.locator('option').allTextContents()
    ).map((o) => o.trim());

    if (frequencyOptions.some((o) => /weekly/i.test(o))) {
      const weeklyLabel =
        frequencyOptions.find((o) => /weekly/i.test(o)) ?? 'Weekly';
      await frequencySelect.selectOption({ label: weeklyLabel });
      await expect(
        catering
          .getByText(
            /\d{1,2}:\d{2}\s*(AM|PM)\s*[A-Z]{2,4}\s*(Sunday|Monday|Tuesday|Wednesday|Thursday|Friday|Saturday)/i,
          )
          .first(),
      ).toBeVisible({ timeout: 10000 });
    }

    // The "daily" option is sometimes labelled Daily, Nightly, etc — pick any
    // option that produces a "<time> <tz> daily" sub-text
    const dailyCandidate =
      frequencyOptions.find((o) => /daily|nightly/i.test(o)) ??
      frequencyOptions.find((o) => o && !/weekly/i.test(o));
    if (dailyCandidate) {
      await frequencySelect.selectOption({ label: dailyCandidate });
      await expect(
        catering
          .getByText(/\d{1,2}:\d{2}\s*(AM|PM)\s*[A-Z]{2,4}\s*daily/i)
          .first(),
      ).toBeVisible({ timeout: 10000 });
    }

    // Target Districts → Manage dialog shows districts
    targetDistricts = await getTargetDistrictsFromManageDialog(catering);
    expect(targetDistricts.length).toBeGreaterThan(0);

    // Last Sync Completed format: Month Date, Year, Time
    // (After we just toggled the primary district above, Last sync may show "—"
    // because no sync has run for the new primary yet — accept that case.)
    const lastSyncRegion = catering
      .locator(
        'xpath=//*[contains(normalize-space(.),"Last sync completed") or contains(normalize-space(.),"Last Sync Completed")][1]',
      )
      .first();
    if (await lastSyncRegion.isVisible({ timeout: 5000 }).catch(() => false)) {
      const lastSyncText = (await lastSyncRegion.innerText().catch(() => ''))
        .replace(/\s+/g, ' ')
        .trim();
      const hasNoSyncYet = /^Last sync completed\s*[—–-]?\s*$/i.test(lastSyncText)
        || /—|–|never|no sync/i.test(lastSyncText);
      if (!hasNoSyncYet) {
        expect(
          lastSyncText,
          `Last sync completed: ${lastSyncText}`,
        ).toMatch(
          /(January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2},\s+\d{4}[,\s]+\d{1,2}:\d{2}/i,
        );
      }
    }

    // View sync log → opens dialog → close
    await catering.getByRole('button', { name: /View sync log/i }).first().click();
    await expect(
      catering
        .getByRole('dialog')
        .getByRole('heading', { name: /Sync Log/i })
        .first(),
    ).toBeVisible({ timeout: 10000 });
    await closeOpenDialog(catering);

    // Push sync now → opens confirmation dialog → click Cancel (the actual
    // sync is exercised later in the flow). The dialog uses a "Push sync now?"
    // confirmation block with Cancel / Yes,Push Now buttons.
    await catering.getByRole('button', { name: /Push sync now/i }).first().click();
    await expect(
      catering
        .locator('div')
        .filter({ hasText: /^Push sync now\?$/ })
        .first(),
    ).toBeVisible({ timeout: 10000 });
    await catering.getByRole('button', { name: /^Cancel$/i }).first().click();
    await expect(
      catering
        .locator('div')
        .filter({ hasText: /^Push sync now\?$/ })
        .first(),
    ).toBeHidden({ timeout: 10000 });

    // Local-overrides explanatory label (case-insensitive, slight word variants)
    await expect(
      catering.getByText(
        /Local overrides in a target district prevent that record from being updated by data sync for that district\. Use Reset [Ll]ocal [Oo]verrides on an item to allow sync to overwrite it again\./i,
      ),
    ).toBeVisible({ timeout: 10000 });
  });

  await test.step('Step 6 — Syncable items: filters, pagination, row toggle and details', async () => {
    // ── Step 6: Syncable items section ──
    const syncableHeading = catering
      .getByText(/Syncable items/i)
      .first();
    await scrollUntilVisible(catering, { target: syncableHeading }).catch(
      () => undefined,
    );
    await expect(syncableHeading).toBeVisible({ timeout: 10000 });

    // Total count rendered next to heading: "Syncable items — 128 items"
    await expect(
      catering.getByText(/\d+\s*items/i).first(),
    ).toBeVisible({ timeout: 10000 });

    // Search field — placeholder "Search items..." in the screenshot
    const syncSearch = catering
      .getByRole('textbox', { name: /Search/i })
      .or(catering.getByPlaceholder(/Search items/i))
      .first();
    await expect(syncSearch).toBeVisible({ timeout: 10000 });

    // All types dropdown — it's a native <select aria-label="Filter by item
    // type">. Verify it's visible and that "Holiday" is one of its options
    // (read directly from the select; no need to open the native popup).
    const allTypes = catering
      .getByRole('combobox', { name: /Filter by item type|All types|Type/i })
      .or(catering.locator('select[aria-label*="item type" i]'))
      .first();
    await expect(allTypes).toBeVisible({ timeout: 10000 });
    const allTypesOptions = (
      await allTypes.locator('option').allTextContents()
    ).map((o) => o.trim());
    expect(
      allTypesOptions.some((o) => /^Holiday$/i.test(o)),
      `Expected "Holiday" in All types options. Got: [${allTypesOptions.join(', ')}]`,
    ).toBeTruthy();

    // All statuses dropdown
    const allStatus = catering
      .getByRole('combobox', { name: /All statuses|All status|Status/i })
      .or(catering.getByRole('button', { name: /All statuses/i }))
      .first();
    await expect(allStatus).toBeVisible({ timeout: 10000 });

    // Pagination control — current value text is "20 / page"
    const paginationCombo = catering
      .getByRole('combobox', { name: /per page|page size|rows per page/i })
      .or(catering.getByRole('button', { name: /\d+\s*\/\s*page/i }))
      .or(catering.locator('select').filter({ hasText: /\d+\s*\/\s*page/i }))
      .first();
    await expect(paginationCombo).toBeVisible({ timeout: 10000 });

    // Toggle one item, then open its details. Both were `if (isVisible)` guards,
    // so whenever the session dropped here - several minutes into one PrimeroEdge
    // session, which happens often - the checks quietly did nothing and the test
    // still went green.
    //
    // Locator factories, not fixed locators, so a retry re-resolves after a
    // relaunch. Filtered on the Details button so this is a real item row: an
    // unfiltered .first() can land on the header row, which has no controls.
    const itemRow = () =>
      catering
        .locator(LIST_ROW_SELECTOR)
        .filter({ has: catering.getByRole('button', { name: /^Details$/i }) })
        .first();
    const itemToggle = () =>
      itemRow().getByRole('switch').or(itemRow().getByRole('checkbox')).first();

    await expect(async () => {
      await closeOpenDialog(catering, { required: false });

      if (!(await itemToggle().isVisible({ timeout: 3000 }).catch(() => false))) {
        await goToDataSync(catering).catch(() => undefined);
      }
      await expect(itemToggle()).toBeVisible({ timeout: 10000 });

      // Only the disable direction is reported by the status column. This used to
      // assert "Synced" when the row started disabled, which cannot pass -
      // re-enabling does not restore that until a sync runs. It went unnoticed
      // because the item is normally enabled, until a run died between the two
      // clicks and left it disabled.
      //
      // So: make sure it is enabled, disable it (column must say "Disabled"), then
      // put it back and check the switch itself rather than the lagging column.
      // That also repairs an item a previous run left half-toggled.
      if (!(await itemToggle().isChecked().catch(() => false))) {
        await itemToggle().click();
        await expect(itemToggle()).toBeChecked({ timeout: 10000 });
      }
      await itemToggle().click();
      await expect(itemToggle()).not.toBeChecked({ timeout: 10000 });
      await expect(itemRow()).toContainText(/Disabled/i, { timeout: 10000 });
      await itemToggle().click();
      await expect(itemToggle()).toBeChecked({ timeout: 10000 });

      await itemRow().getByRole('button', { name: /^Details$/i }).first().click();
      // Assert the dialog itself rather than a heading named "Item Details": the
      // dialog carries no such heading, so this could never pass, and it burned the
      // full 180s toPass budget every run looking for it. Step 12 below opens the
      // very same dialog and checks getByRole('dialog') — match that.
      await expect(catering.getByRole('dialog').first()).toBeVisible({ timeout: 10000 });
      await closeOpenDialog(catering);
    }).toPass({ timeout: 180000, intervals: [2000, 5000, 8000] });
  });

  await test.step('Step 7 — Rename a menu item on the target district', async () => {
    // ── Step 7: Pick a target district + first menu item, then switch ──
    // Always switch to Berkeley as the target district. Mercer (home) is the
    // primary; Berkeley is the opted-in sibling we edit on.
    // Home = the data-sync primary/source; target = the opted-in sibling we edit
    // overrides on. The Lees group on UAT is Alief ISD (primary) + Lees (sibling);
    // on QA it's Mercer (home) + Berkeley (target).
    homeDistrict = isUatDirectLogin()
      ? getSecondaryDistrictName()
      : getDistrictName();
    targetDistrict = isUatDirectLogin() ? 'Lees' : 'Berkeley School District';
    expect(
      targetDistricts.length,
      `No target districts parsed from the Manage dialog: [${targetDistricts.join(', ')}]`,
    ).toBeGreaterThan(0);

    // Clean any leftover local overrides from a prior interrupted run BEFORE we
    // create ours — otherwise the target's first menu item still reads a stale
    // "AutoRenamed ..." name (a previous run died before its reset step), and the
    // later Data Sync search (by the home name) never finds the row.
    await resetAllLocalOverrides(catering);

    // Switch to the target district first — we capture the item title there
    // (after the switch) and edit it on the same district.
    await switchDistrict(catering, targetDistrict);

    // switchDistrict already waits for the header and re-anchors the app.
    await safeNavigate(catering, 'Menu');
    await expect(
      catering.getByRole('heading', { name: /^Menu$/i }).first(),
    ).toBeVisible({ timeout: 15000 });
    await catering
      .getByText(/Loading Menu/i)
      .waitFor({ state: 'hidden', timeout: 30000 })
      .catch(() => undefined);

    // Switch the menu-name dropdown to "TheRealMenu" on the target district — only
    // if the selector exists. Some target districts (e.g. Lees on UAT) have a
    // single menu and render no selector; in that case the current menu is used.
    const menuSelect = catering.locator('#admin-menu-select');
    if (await menuSelect.isVisible({ timeout: 8000 }).catch(() => false)) {
      await menuSelect.click();
      const realMenuOption = catering.getByRole('option', { name: /RealMenu/i }).first();
      if (await realMenuOption.isVisible({ timeout: 5000 }).catch(() => false)) {
        await realMenuOption.click();
        await catering
          .getByText(/Loading Menu/i)
          .waitFor({ state: 'hidden', timeout: 15000 })
          .catch(() => {});
      }
    }

    // Pick the target-district menu item to rename, from the cards' Edit-pencil
    // aria-labels (e.g. "Edit apple juice menu item"). IMPORTANT: skip any item
    // whose name is itself a leftover from a prior run — a rename that a failed
    // run never restored (e.g. "AutoRenamed 8144", "AutoSync 144264"). Those are
    // target-LOCAL names with no matching item in the home district's shared
    // catalog, so the home Data Sync view can never show an Overrides row for
    // them. Choosing a genuine shared item (Cereal, Spaghetti, …) is what makes
    // the override appear; a successful run then restores it, breaking the
    // rename-leftover accumulation cycle.
    const targetEditBtns = catering
      .locator('#main-content')
      .getByRole('button', { name: /^Edit\s+\S/i });
    await expect(targetEditBtns.first()).toBeVisible({ timeout: 15000 });
    const targetEditLabels = await targetEditBtns.evaluateAll((els) =>
      els.map((e) => e.getAttribute('aria-label') || ''),
    );
    // No \b after the prefixes: t-117617 names its items "AutoSyncAI <stamp>", and
    // "AutoSync\b" does NOT match that (the next char, "A", is a word char). Such an
    // item was therefore treated as a genuine shared item, and since it is really a
    // target-local leftover the home Data Sync view can never show an Overrides row
    // for it — the whole 90s override lookup below timed out. Match any AutoRenamed*
    // / AutoSync* prefix so every generated leftover is skipped.
    const LEFTOVER_ITEM_RE = /^Edit\s+(?:AutoRenamed|AutoSync)/i;
    let chosenIdx = targetEditLabels.findIndex(
      (l) => /^Edit\s+\S/i.test(l) && !LEFTOVER_ITEM_RE.test(l),
    );
    if (chosenIdx < 0) chosenIdx = 0; // all items are leftovers — use the first
    const firstTargetEditBtn = targetEditBtns.nth(chosenIdx);
    const firstTargetLabel = targetEditLabels[chosenIdx] ?? '';
    const firstTargetMatch = firstTargetLabel.match(
      /^Edit\s+(.+?)(?:\s+menu item)?$/i,
    );
    expect(
      firstTargetMatch,
      `Could not parse menu item name from aria-label: "${firstTargetLabel}"`,
    ).not.toBeNull();
    originalMenuItemName = firstTargetMatch![1].trim();

    // Click the Edit pencil for that item, rename it, save
    await firstTargetEditBtn.click();

    const nameInput = catering
      .getByRole('textbox', { name: /Menu Item Name|Item Name|^Name$/i })
      .first();
    await expect(nameInput).toBeVisible({ timeout: 10000 });
    await nameInput.fill('');
    await nameInput.fill(RENAMED_MENU_ITEM);

    await catering
      .getByRole('button', { name: /Update Menu Item|^Update$|^Save$/i })
      .last()
      .click();
    await expect(
      catering.getByText(/updated|saved|success/i).first(),
    ).toBeVisible({ timeout: 10000 });

    // Switch back to the home district (Mercer)
    await switchDistrict(catering, homeDistrict);
  });

  await test.step('Step 8 — Overrides badge appears, clears on opt-out, and resets', async () => {
    // ── Step 8: Data Sync — find the renamed item, expect Overrides ──
    // Search Data Sync by the ORIGINAL item name (not the renamed one) — the home
    // district still has the original name; the override flag indicates the target
    // district has a local change to that item.
    const overrideRow = catering
      .locator(LIST_ROW_SELECTOR)
      .filter({ hasText: new RegExp(escapeRegExp(originalMenuItemName), 'i') })
      .first();
    const syncSearch2 = catering
      .getByRole('textbox', { name: /Search( syncable| items)?/i })
      .first();

    // The PrimeroEdge launcher (token refresh) can kick us to the relaunch page
    // mid-flow, so re-enter Data Sync (goToDataSync re-auths), re-apply 100/page +
    // the search, and re-find the row — retrying until it actually appears.
    await expect(async () => {
      await goToDataSync(catering);

      // Pagination defaults to 20/page — set 100/page.
      await setListPageSize(catering, 100);

      if (await syncSearch2.isVisible({ timeout: 5000 }).catch(() => false)) {
        await syncSearch2.fill('');
        await syncSearch2.fill(originalMenuItemName);
        await waitForListSettled(catering);
      }

      await expect(overrideRow).toBeVisible({ timeout: 8000 });
    }).toPass({ timeout: 90000, intervals: [2000, 4000, 6000] });

    // Overrides badge on that row — it's a styled <span>, not a button
    const overridesBadge = overrideRow
      .getByText(/^Overrides$/i)
      .first();
    await expect(overridesBadge).toBeVisible({ timeout: 10000 });

    // ── Step 8a: Opt the target district OUT via Manage → push sync →
    // verify Overrides badge disappears (no target opted in = no override).
    // This only works when the group has another opted-in target: with a single
    // target (e.g. Lees on UAT), opting it out leaves 0 opted in, push sync is
    // disabled, and the override can't be cleared — so skip the check there. ──
    await toggleTargetDistrictOptIn(catering, targetDistrict, false);
    // ensureTargetOptedIn:false, or the helper opts the district back in and
    // undoes the opt-out we just made.
    const pushedWithTargetOut = await runPushSyncNow(catering, { ensureTargetOptedIn: false });
    if (pushedWithTargetOut) {
      await expect(syncSearch2).toBeVisible({ timeout: 10000 });
      await syncSearch2.fill('');
      await syncSearch2.fill(originalMenuItemName);
      await waitForListSettled(catering);
      await expect(overrideRow.getByText(/^Overrides$/i)).not.toBeVisible({
        timeout: 10000,
      });
    }

    // ── Step 8b: Opt the target district back IN, push sync, verify the
    // Overrides badge is shown again ──
    await toggleTargetDistrictOptIn(catering, targetDistrict, true);
    await runPushSyncNow(catering);
    await syncSearch2.fill('');
    await syncSearch2.fill(originalMenuItemName);
    await waitForListSettled(catering);
    await expect(overrideRow.getByText(/^Overrides$/i)).toBeVisible({
      timeout: 15000,
    });

    // Open Item Details
    await overrideRow.getByRole('button', { name: /^Details$/i }).first().click();
    const itemDetailsDialog = catering.getByRole('dialog').first();
    await expect(itemDetailsDialog).toBeVisible({ timeout: 10000 });
    // The dialog renders these as two separate elements: a "Local overrides"
    // section header and an "Overrides detected in 1 target district." line
    // (with the count in a nested span). Verify both independently.
    await expect(
      itemDetailsDialog.getByText(/^Local overrides$/i).first(),
    ).toBeVisible({ timeout: 10000 });
    await expect(
      itemDetailsDialog.getByText(
        /Overrides detected in\s+1\s+target district/i,
      ),
    ).toBeVisible({ timeout: 10000 });

    const resetLocalOverridesBtn = itemDetailsDialog
      .getByRole('button', { name: /Reset Local Overrides/i })
      .first();
    await expect(resetLocalOverridesBtn).toBeVisible({ timeout: 10000 });
    await resetLocalOverridesBtn.click();

    const resetDialog = catering
      .getByRole('dialog')
      .filter({ has: catering.getByRole('heading', { name: /Reset Local Overrides/i }) })
      .first();
    await expect(resetDialog).toBeVisible({ timeout: 10000 });

    // The dialog has an "Opted-in target districts" section listing the
    // districts where the override exists — verify the target we edited is
    // shown there (could be Berkeley or Mercer depending on which is primary).
    await expect(resetDialog).toContainText(/Opted-?in target districts?/i);
    await expect(resetDialog).toContainText(
      new RegExp(escapeRegExp(targetDistrict), 'i'),
    );

    await resetDialog
      .getByRole('button', { name: /Reset Overrides|^Reset$|^Confirm$/i })
      .last()
      .click();

    await expect(
      catering.getByText(/Local overrides reset \(1 row updated\)/i),
    ).toBeVisible({ timeout: 15000 });

    await closeOpenDialog(catering);
    await expect(
      overrideRow.getByText(/^Overrides$/i),
    ).not.toBeVisible({ timeout: 10000 });
  });

  await test.step('Step 9 — Push Sync Now and verify the Sync Log entry', async () => {
    // ── Step 9: Push Sync Now ──
    await scrollUntilVisible(catering, {
      target: catering.getByRole('button', { name: /Push Sync Now/i }).first(),
    });
    await catering
      .getByRole('button', { name: /Push Sync Now/i })
      .first()
      .click();
    const pushDialog = catering.getByRole('dialog').first();
    await pushDialog
      .getByRole('button', { name: /Yes,? Push Now/i })
      .first()
      .click();

    const syncCompleteText = await catering
      .getByText(/Sync complete\s*[.,;:—–-]?\s*\d+\s*items?\s*synced,\s*\d+\s*skipped/i)
      .first()
      .textContent({ timeout: 60000 });
    expect(syncCompleteText, 'Sync complete message').toBeTruthy();
    const syncCompleteCanonical = (syncCompleteText ?? '').trim();

    // Open Sync Log → verify top entry
    await catering.getByRole('button', { name: /View Sync Log/i }).first().click();
    const syncLogDialog = catering
      .getByRole('dialog')
      .filter({ has: catering.getByRole('heading', { name: /Sync Log/i }) })
      .first();
    await expect(syncLogDialog).toBeVisible({ timeout: 10000 });

    // The Sync Log table's first <tr> is the header row
    // ("StartedTriggered ByStatusSyncedSkippedDurationNotes"). Scope to the
    // tbody so we get the first actual data row.
    const topEntry = syncLogDialog
      .locator('tbody tr, li, [role="row"]:not(:has(th)), article')
      .first();
    await expect(topEntry).toBeVisible({ timeout: 10000 });

    // The toast says "Sync complete — 89 items synced, 0 skipped." but the
    // top Sync Log row is a table row with columns
    //   Started | Triggered By | Status | Synced | Skipped | Duration | Notes
    // So we verify the row's individual cells contain the same Synced and
    // Skipped numbers, plus Sabih Siddiqui and today's date.
    const countsMatch = syncCompleteCanonical.match(
      /(\d+)\s*items?\s*synced,\s*(\d+)\s*skipped/i,
    );
    if (countsMatch) {
      const syncedCount = countsMatch[1];
      const skippedCount = countsMatch[2];
      const cells = topEntry.locator('td');
      if ((await cells.count()) >= 5) {
        // Started | Triggered By | Status | Synced | Skipped | ...
        await expect(cells.nth(3)).toContainText(
          new RegExp(`^\\s*${syncedCount}\\s*$`),
        );
        await expect(cells.nth(4)).toContainText(
          new RegExp(`^\\s*${skippedCount}\\s*$`),
        );
      } else {
        // Non-table layout — fall back to "row contains both numbers"
        await expect(topEntry).toContainText(new RegExp(`\\b${syncedCount}\\b`));
        await expect(topEntry).toContainText(new RegExp(`\\b${skippedCount}\\b`));
      }
    }
    await expect(topEntry).toContainText(
      new RegExp(escapeRegExp(SYNC_TRIGGERED_BY), 'i'),
    );
    // Accept both full and abbreviated month names — the Sync Log renders dates
    // like "Jun 01, 2026 11:13 AM" (abbreviated), not "June 01, 2026".
    await expect(topEntry).toContainText(
      /(?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:t(?:ember)?)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\s+\d{1,2},\s+\d{4}[,\s]+\d{1,2}:\d{2}/i,
    );

    await closeOpenDialog(catering);
  });

  await test.step('Step 10 — Item name is restored on the target district', async () => {
    // ── Step 10: Switch back to target district & verify name restored ──
    await switchDistrict(catering, targetDistrict);

    await safeNavigate(catering, 'Menu');
    await expect(
      catering.getByRole('heading', { name: /^Menu$/i }).first(),
    ).toBeVisible({ timeout: 15000 });
    await catering
      .getByText(/Loading Menu/i)
      .waitFor({ state: 'hidden', timeout: 30000 })
      .catch(() => undefined);

    // Select "TheRealMenu" again if the selector exists (single-menu target
    // districts like Lees on UAT render none — the current menu is used).
    const finalMenuSelect = catering.locator('#admin-menu-select');
    if (await finalMenuSelect.isVisible({ timeout: 8000 }).catch(() => false)) {
      await finalMenuSelect.click();
      const realMenuOption = catering.getByRole('option', { name: /RealMenu/i }).first();
      if (await realMenuOption.isVisible({ timeout: 5000 }).catch(() => false)) {
        await realMenuOption.click();
        await catering
          .getByText(/Loading Menu/i)
          .waitFor({ state: 'hidden', timeout: 15000 })
          .catch(() => {});
      }
    }

    // Search for the ORIGINAL item name on the target district — after the
    // reset + push sync, the renamed item should be back to its original name.
    const finalSearch = catering
      .getByRole('textbox', { name: /Search.*items?/i })
      .first();
    await finalSearch.fill(originalMenuItemName);
    await waitForListSettled(catering);

    await expect(
      catering
        .getByText(new RegExp(escapeRegExp(originalMenuItemName), 'i'))
        .first(),
    ).toBeVisible({ timeout: 15000 });
    await expect(
      catering.getByText(new RegExp(escapeRegExp(RENAMED_MENU_ITEM), 'i')),
    ).not.toBeVisible({ timeout: 5000 });

    // Restore Mercer as the active district at the end
    await switchDistrict(catering, homeDistrict);
  });

  await test.step('Step 11 — A customer account cannot reach Data Sync', async () => {
    // ── Step 11: Verify non-admin/customer role cannot access Data Sync ──
    // First reset the customer's password from the admin session so the
    // upcoming customer login is guaranteed to succeed (Accounts → search by
    // email → Actions ⋯ → Change Password → "Password1!").
    const customerEmail = getCustomerAccountEmail();
    const customerPassword = 'Password1!';
    await resetCustomerPasswordFromAccounts(
      catering,
      customerEmail,
      customerPassword,
    );

    // Now open a fresh browser context (no shared auth) and log in as the
    // customer, then assert the Data Sync sidebar item is not present.
    const customerContext = await browser.newContext();
    const customerPage = await customerContext.newPage();
    try {
      await customerPage.goto(
        getK12CateringLoginUrl(),
        { waitUntil: 'domcontentloaded' },
      );

      await customerPage
        .getByRole('textbox', { name: /Email/i })
        .fill(customerEmail);
      await customerPage
        .getByRole('textbox', { name: /Password/i })
        .fill(customerPassword);
      await customerPage.getByRole('button', { name: /Sign in/i }).click();

      // The URL leaving /login is the sign-in signal.
      await expect(customerPage).not.toHaveURL(/login/, { timeout: 15000 });

      const customerSidebar = customerPage.locator(
        'aside[aria-label="Main navigation"]',
      );
      await expect(customerSidebar).toBeVisible({ timeout: 30000 });

      // The Data Sync sidebar item must not exist for non-admin users
      await expect(
        customerSidebar.getByLabel('Navigate to Data Sync'),
      ).toHaveCount(0);
    } finally {
      await customerContext.close();
    }
  });
});
