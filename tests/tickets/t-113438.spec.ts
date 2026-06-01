// Test Link: https://dev.azure.com/Cybersoft-Technologies-Inc/PrimeroEdge%20Classic/_workitems/edit/113438

import { test, expect, Page } from '@playwright/test';
import {
  loginToK12Catering,
  navigateK12CateringMenu,
  scrollUntilVisible,
  getDistrictName,
} from '../../utils/helpers';
import { getK12CateringLoginUrl } from '../../utils/baseUrl';
import { resetCustomerPasswordFromAccounts } from '../../utils/accountFlow';

test.use({ storageState: { cookies: [], origins: [] } });

// ─── Constants ──────────────────────────────────────────────────────────────

const RANDOM_SUFFIX = Math.floor(1000 + Math.random() * 9000);
const RENAMED_MENU_ITEM = `AutoRenamed ${RANDOM_SUFFIX}`;

// User performing the test (used to verify "Triggered by" in Sync Log)
// TODO: confirm this matches the QA test user
const SYNC_TRIGGERED_BY = 'Sabih Siddiqui';

// ─── Generic helpers ───────────────────────────────────────────────────────

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

async function ensureInK12CateringApp(page: Page): Promise<void> {
  await page.keyboard.press('Escape').catch(() => undefined);

  const sidebar = page.locator('aside[aria-label="Main navigation"]');
  if (await sidebar.isVisible({ timeout: 2000 }).catch(() => false)) {
    return;
  }

  // PrimeroEdge launcher page — click the K12 token link to re-enter
  const launcherLink = page.locator('a[href*="/login?token="]').first();
  if (await launcherLink.isVisible({ timeout: 3000 }).catch(() => false)) {
    await launcherLink.click();
    await page.waitForLoadState('domcontentloaded');
  }

  await expect(sidebar).toBeVisible({ timeout: 30000 });
}

async function clickSidebarItem(page: Page, name: string): Promise<void> {
  await ensureInK12CateringApp(page);
  const sidebar = page.locator('aside[aria-label="Main navigation"]');
  const item = sidebar.getByLabel(`Navigate to ${name}`);
  await expect(item).toBeVisible({ timeout: 10000 });
  await item.click();
  await page.waitForLoadState('domcontentloaded');
}

async function safeNavigate(
  page: Page,
  menuItem: Parameters<typeof navigateK12CateringMenu>[1],
): Promise<void> {
  await ensureInK12CateringApp(page);
  await navigateK12CateringMenu(page, menuItem);
  await page.waitForLoadState('domcontentloaded');
  await ensureInK12CateringApp(page);
}

async function dismissAnyModal(page: Page): Promise<void> {
  await page.keyboard.press('Escape').catch(() => undefined);
  await page
    .locator('div.fixed.inset-0')
    .first()
    .waitFor({ state: 'hidden', timeout: 3000 })
    .catch(() => undefined);
}

async function switchDistrict(page: Page, districtName: string): Promise<void> {
  const switchBtn = page
    .getByRole('button', { name: /Switch district/i })
    .first();
  await expect(switchBtn).toBeVisible({ timeout: 10000 });
  await switchBtn.click();
  await page.waitForLoadState('domcontentloaded');

  const option = page
    .getByText(new RegExp(escapeRegExp(districtName), 'i'))
    .first();
  await expect(option).toBeVisible({ timeout: 10000 });
  await option.click();
  await page.waitForTimeout(500);

  // Wait for the bottom action bar (Switch District button) to render —
  // it only appears once a district is selected.
  const confirmBtn = page
    .getByRole('button', { name: /^Switch District$/i })
    .last();
  await expect(confirmBtn).toBeVisible({ timeout: 10000 });
  await confirmBtn.click();

  // Success can be signalled by either the "District Switched" toast OR the
  // dialog closing — accept whichever comes first (the toast can disappear
  // before our assertion catches it).
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
}

// ─── Districts → District Group section ────────────────────────────────────

async function waitForDistrictsPageReady(page: Page): Promise<void> {
  await expect(
    page.getByRole('heading', { name: /District Management/i }).first(),
  ).toBeVisible({ timeout: 15000 });

  // Let the page finish loading any list/widgets (spinners under Districts /
  // Environments / Groups panels)
  await page
    .locator('[role="status"], .animate-spin, svg.animate-spin')
    .first()
    .waitFor({ state: 'hidden', timeout: 15000 })
    .catch(() => undefined);
  await page.waitForTimeout(1500);
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

async function closeOpenDialog(page: Page): Promise<void> {
  // Try several flavors of close: aria-labelled X, an inner Close button,
  // pressing Escape. Repeat until no dialog remains visible.
  for (let attempt = 0; attempt < 4; attempt++) {
    const dialog = page.locator('[role="dialog"]').first();
    if (!(await dialog.isVisible({ timeout: 1000 }).catch(() => false))) {
      return;
    }

    const closeCandidates = [
      dialog.getByRole('button', { name: /^Close$|Close dialog|Dismiss/i }).first(),
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
    await dialog
      .waitFor({ state: 'hidden', timeout: 2000 })
      .catch(() => undefined);
  }
}

async function setPrimaryDistrict(
  page: Page,
  desired: string,
): Promise<void> {
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
  const differentOption =
    allOptions.find(
      (o) =>
        o.toLowerCase() !== desired.toLowerCase() &&
        o.toLowerCase() !== currentLabel.toLowerCase(),
    ) ??
    allOptions.find((o) => o.toLowerCase() !== desired.toLowerCase());

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

  // Now select the desired option (Mercer).
  await primaryDistrictControl.selectOption({ label: desired });

  // If the desired option matches the current primary, no save is needed —
  // close the dialog (warning is gone, nothing to confirm).
  if (desired.toLowerCase() === currentLabel.toLowerCase()) {
    const cancelBtn = page.getByRole('button', { name: /^Cancel$/i }).last();
    if (await cancelBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
      await cancelBtn.click();
    } else {
      await page.keyboard.press('Escape');
    }
    await page.waitForTimeout(500);
    return;
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
  await page.waitForTimeout(500);

  // Always set primary to Mercer so the rest of the test is predictable.
  // setPrimaryDistrict re-selects the option even when it's already current,
  // which still verifies the dropdown works.
  const chosen = getDistrictName(); // "Mercer County School District"
  await setPrimaryDistrict(page, chosen);

  return { chosen, previous };
}

// ─── Data Sync page ────────────────────────────────────────────────────────

async function goToDataSync(page: Page): Promise<void> {
  await dismissAnyModal(page);
  await ensureInK12CateringApp(page);
  await clickSidebarItem(page, 'Data Sync');
  // If the click didn't land (overlay/race), retry once
  const heading = page.getByRole('heading', { name: /Data Sync/i }).first();
  if (!(await heading.isVisible({ timeout: 5000 }).catch(() => false))) {
    await ensureInK12CateringApp(page);
    await clickSidebarItem(page, 'Data Sync');
  }
  await expect(heading).toBeVisible({ timeout: 15000 });
}

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
    await page.waitForTimeout(400);
  }

  await closeOpenDialog(page);
}

/**
 * Click "Push sync now", confirm in the dialog, and wait for the
 * "Sync complete — N items synced, M skipped" toast.
 */
async function runPushSyncNow(page: Page): Promise<void> {
  await scrollUntilVisible(page, {
    target: page.getByRole('button', { name: /Push sync now/i }).first(),
  }).catch(() => undefined);
  await page.getByRole('button', { name: /Push sync now/i }).first().click();

  await expect(
    page
      .locator('div')
      .filter({ hasText: /^Push sync now\?$/ })
      .first(),
  ).toBeVisible({ timeout: 10000 });

  await page
    .getByRole('button', { name: /Yes,?\s*Push Now/i })
    .first()
    .click();

  await expect(
    page
      .getByText(
        /Sync complete\s*[—–-]?\s*\d+\s*items?\s*synced,\s*\d+\s*skipped/i,
      )
      .first(),
  ).toBeVisible({ timeout: 90000 });
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

// ─── Test ──────────────────────────────────────────────────────────────────

test('Catering - Districts/Data Sync - Group, primary district, sync log and overrides', async ({
  page,
  browser,
}) => {
  test.setTimeout(10 * 60 * 1000);

  const catering = await loginToK12Catering(page);

  // ── Step 1-2: Districts → View Districts in this Group ──
  await openViewDistrictsInGroupDialog(catering);
  const groupDialog = catering.getByRole('dialog').first();
  await expect(groupDialog).toBeVisible({ timeout: 10000 });
  // Verify at least one district is listed inside the group dialog
  await expect(
    groupDialog.locator('li, tr, [role="listitem"]').first(),
  ).toBeVisible({ timeout: 10000 });

  await closeOpenDialog(catering);

  // ── Step 3: Edit group → toggle Primary District → save ──
  const { chosen: chosenPrimary, previous: previousPrimary } =
    await togglePrimaryDistrict(catering);

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

  // ── Step 5: Data Sync — verify top-level controls ──
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
  // (if needed) and wait for the dropdown to become enabled before using it.
  if (await frequencySelect.isDisabled().catch(() => false)) {
    await autoSyncToggle.click();
    await catering
      .getByText(/Auto-sync settings saved/i)
      .first()
      .waitFor({ state: 'visible', timeout: 10000 })
      .catch(() => {});
    await expect(frequencySelect).toBeEnabled({ timeout: 10000 });
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
  const targetDistricts = await getTargetDistrictsFromManageDialog(catering);
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

  // Toggle one item: enable/disable status text
  const firstItemRow = catering
    .locator('table tbody tr, [role="row"]')
    .first();
  await expect(firstItemRow).toBeVisible({ timeout: 10000 });

  const itemToggle = firstItemRow
    .getByRole('switch')
    .or(firstItemRow.getByRole('checkbox'))
    .first();
  if (await itemToggle.isVisible({ timeout: 3000 }).catch(() => false)) {
    const wasEnabled = await itemToggle.isChecked().catch(() => true);
    await itemToggle.click();
    const expectedStatus = wasEnabled ? /Disabled/i : /Synced/i;
    await expect(firstItemRow).toContainText(expectedStatus, {
      timeout: 10000,
    });
    // Toggle back to original state
    await itemToggle.click();
  }

  // Details opens Item Details dialog
  const detailsBtn = firstItemRow
    .getByRole('button', { name: /^Details$/i })
    .first();
  if (await detailsBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
    await detailsBtn.click();
    await expect(
      catering
        .getByRole('dialog')
        .getByRole('heading', { name: /Item Details/i })
        .first(),
    ).toBeVisible({ timeout: 10000 });
    await closeOpenDialog(catering);
  }

  // ── Step 7: Pick a target district + first menu item, then switch ──
  // Always switch to Berkeley as the target district. Mercer (home) is the
  // primary; Berkeley is the opted-in sibling we edit on.
  const homeDistrict = getDistrictName();
  void homeDistrict;
  const targetDistrict = 'Berkeley School District';
  expect(
    targetDistricts.some((d) => /Berkeley School District/i.test(d)),
    `Berkeley School District was not in target districts list: [${targetDistricts.join(', ')}]`,
  ).toBeTruthy();

  // Switch to the target district first — we capture the item title there
  // (after the switch) and edit it on the same district.
  await switchDistrict(catering, targetDistrict);

  // After a switch, give the post-switch toast / page reload time to settle
  // before navigating away — otherwise the sidebar click can race with the
  // page state and never actually land on Menu.
  await catering.waitForLoadState('networkidle').catch(() => undefined);
  await catering.waitForTimeout(1500);
  await ensureInK12CateringApp(catering);

  await safeNavigate(catering, 'Menu');
  await expect(
    catering.getByRole('heading', { name: /^Menu$/i }).first(),
  ).toBeVisible({ timeout: 15000 });
  await catering
    .getByText(/Loading Menu/i)
    .waitFor({ state: 'hidden', timeout: 30000 })
    .catch(() => undefined);

  // Switch the menu-name dropdown to "TheRealMenu" on the target district
  const menuSelect = catering.locator('#admin-menu-select');
  await expect(menuSelect).toBeVisible({ timeout: 15000 });
  await menuSelect.click();
  await catering
    .getByRole('option', { name: /RealMenu/i })
    .first()
    .click();
  await catering
    .getByText(/Loading Menu/i)
    .waitFor({ state: 'hidden', timeout: 15000 })
    .catch(() => {});
  await catering.waitForTimeout(800);

  // Capture the title of the first menu item on the target district from the
  // first card's Edit pencil aria-label (e.g. "Edit apple juice menu item").
  const firstTargetEditBtn = catering
    .locator('#main-content')
    .getByRole('button', { name: /^Edit\s+\S/i })
    .first();
  await expect(firstTargetEditBtn).toBeVisible({ timeout: 15000 });
  const firstTargetLabel =
    (await firstTargetEditBtn.getAttribute('aria-label')) ?? '';
  const firstTargetMatch = firstTargetLabel.match(
    /^Edit\s+(.+?)(?:\s+menu item)?$/i,
  );
  expect(
    firstTargetMatch,
    `Could not parse menu item name from aria-label: "${firstTargetLabel}"`,
  ).not.toBeNull();
  const originalMenuItemName = firstTargetMatch![1].trim();

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
  await switchDistrict(catering, getDistrictName());

  // After the switch, let the post-switch toast / page reload settle, then
  // ensure we're inside the K12 app before navigating to Data Sync.
  await catering.waitForLoadState('networkidle').catch(() => undefined);
  await catering.waitForTimeout(1500);
  await ensureInK12CateringApp(catering);

  // ── Step 8: Data Sync — find the renamed item, expect Overrides ──
  await goToDataSync(catering);

  // Pagination defaults to 20/page — click the control and select 100/page
  const paginationCombo2 = catering
    .getByRole('combobox', { name: /per page|page size|rows per page/i })
    .or(catering.getByRole('button', { name: /\d+\s*\/\s*page/i }))
    .or(catering.locator('select').filter({ hasText: /\d+\s*\/\s*page/i }))
    .first();
  await expect(paginationCombo2).toBeVisible({ timeout: 10000 });
  await paginationCombo2.click();
  // If it's a native <select>, selectOption works; otherwise use the option
  // that pops up after the click.
  const selected = await paginationCombo2
    .selectOption({ label: '100 / page' })
    .catch(() => null);
  if (!selected) {
    await paginationCombo2
      .selectOption({ label: '100/page' })
      .catch(async () => {
        await catering
          .getByRole('option', { name: /^\s*100\s*\/\s*page\s*$/i })
          .first()
          .click();
      });
  }
  await catering.waitForTimeout(800);

  // Search Data Sync by the ORIGINAL item name (not the renamed one) — the
  // home district still has the original name; the override flag indicates
  // the target district has a local change to that item.
  const syncSearch2 = catering
    .getByRole('textbox', { name: /Search( syncable| items)?/i })
    .first();
  await syncSearch2.fill(originalMenuItemName);
  await catering.waitForTimeout(800);

  const overrideRow = catering
    .locator('table tbody tr, [role="row"]')
    .filter({ hasText: new RegExp(escapeRegExp(originalMenuItemName), 'i') })
    .first();
  await expect(overrideRow).toBeVisible({ timeout: 15000 });

  // Overrides badge on that row — it's a styled <span>, not a button
  const overridesBadge = overrideRow
    .getByText(/^Overrides$/i)
    .first();
  await expect(overridesBadge).toBeVisible({ timeout: 10000 });

  // ── Step 8a: Opt the target district OUT via Manage → push sync →
  // verify Overrides badge disappears (no target opted in = no override) ──
  await toggleTargetDistrictOptIn(catering, targetDistrict, false);
  await runPushSyncNow(catering);
  await expect(syncSearch2).toBeVisible({ timeout: 10000 });
  await syncSearch2.fill('');
  await syncSearch2.fill(originalMenuItemName);
  await catering.waitForTimeout(800);
  await expect(overrideRow.getByText(/^Overrides$/i)).not.toBeVisible({
    timeout: 10000,
  });

  // ── Step 8b: Opt the target district back IN, push sync, verify the
  // Overrides badge is shown again ──
  await toggleTargetDistrictOptIn(catering, targetDistrict, true);
  await runPushSyncNow(catering);
  await syncSearch2.fill('');
  await syncSearch2.fill(originalMenuItemName);
  await catering.waitForTimeout(800);
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
    .getByText(/Sync complete\s*[—–-]?\s*\d+\s*items?\s*synced,\s*\d+\s*skipped/i)
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

  // ── Step 10: Switch back to target district & verify name restored ──
  await switchDistrict(catering, targetDistrict);

  // Let the post-switch toast / page reload settle, re-anchor the K12 app
  // before clicking the sidebar (otherwise the click can race the reload
  // and never actually land on Menu).
  await catering.waitForLoadState('networkidle').catch(() => undefined);
  await catering.waitForTimeout(1500);
  await ensureInK12CateringApp(catering);

  await safeNavigate(catering, 'Menu');
  await expect(
    catering.getByRole('heading', { name: /^Menu$/i }).first(),
  ).toBeVisible({ timeout: 15000 });
  await catering
    .getByText(/Loading Menu/i)
    .waitFor({ state: 'hidden', timeout: 30000 })
    .catch(() => undefined);

  const finalMenuSelect = catering.locator('#admin-menu-select');
  await expect(finalMenuSelect).toBeVisible({ timeout: 15000 });
  await finalMenuSelect.click();
  await catering
    .getByRole('option', { name: /RealMenu/i })
    .first()
    .click();
  await catering
    .getByText(/Loading Menu/i)
    .waitFor({ state: 'hidden', timeout: 15000 })
    .catch(() => {});
  await catering.waitForTimeout(800);

  // Search for the ORIGINAL item name on the target district — after the
  // reset + push sync, the renamed item should be back to its original name.
  const finalSearch = catering
    .getByRole('textbox', { name: /Search.*items?/i })
    .first();
  await finalSearch.fill(originalMenuItemName);
  await catering.waitForTimeout(800);

  await expect(
    catering
      .getByText(new RegExp(escapeRegExp(originalMenuItemName), 'i'))
      .first(),
  ).toBeVisible({ timeout: 15000 });
  await expect(
    catering.getByText(new RegExp(escapeRegExp(RENAMED_MENU_ITEM), 'i')),
  ).not.toBeVisible({ timeout: 5000 });

  // Restore Mercer as the active district at the end
  await switchDistrict(catering, getDistrictName());

  // Let the post-switch toast / page reload settle before we navigate the
  // sidebar — otherwise the next sidebar click (Accounts inside
  // resetCustomerPasswordFromAccounts) can race the toast overlay and never
  // actually land.
  await catering.waitForLoadState('networkidle').catch(() => undefined);
  await catering.waitForTimeout(1500);
  await ensureInK12CateringApp(catering);

  // ── Step 11: Verify non-admin/customer role cannot access Data Sync ──
  // First reset the customer's password from the admin session so the
  // upcoming customer login is guaranteed to succeed (Accounts → search by
  // email → Actions ⋯ → Change Password → "Password1!").
  const customerEmail = 'SabihQATesting@outlook.com';
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

    await customerPage.waitForLoadState('networkidle').catch(() => undefined);
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
