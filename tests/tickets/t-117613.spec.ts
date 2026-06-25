// Test Link: https://dev.azure.com/Cybersoft-Technologies-Inc/PrimeroEdge%20Classic/_workitems/edit/117644
// T-117613 — A newly added multi-tenant district appears immediately in the
// Primary District dropdown of the District Group it was added to.

import { test, expect, Page } from '@playwright/test';
import {
  loginToK12Catering,
  navigateK12CateringMenu,
  scrollUntilVisible,
} from '../../utils/helpers';
import { getEnvVar } from '../../utils/env';

test.use({ storageState: { cookies: [], origins: [] } });

const ENV_LABEL =
  getEnvVar('ENVIRONMENT_LABEL', { required: false }) || 'QA (PrimeroEdge)';

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

async function goToDistricts(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Go to home page' }).click();
  await page.waitForLoadState('domcontentloaded');
  await navigateK12CateringMenu(page, 'Districts');
  await page.waitForLoadState('domcontentloaded');
  await expect(
    page.getByRole('heading', { name: /District Management/i }).first(),
  ).toBeVisible({ timeout: 15000 });
}

async function deleteDistrictByName(page: Page, name: string): Promise<void> {
  await page.keyboard.press('Escape').catch(() => {});
  await goToDistricts(page);

  const search = page.getByRole('textbox', { name: /Search districts/i });
  await expect(search).toBeVisible({ timeout: 10000 });
  await search.fill(name);
  await page.waitForTimeout(800);

  const deleteBtn = page.getByRole('button', {
    name: new RegExp(`Delete district ${escapeRegExp(name)}`, 'i'),
  });
  if (!(await deleteBtn.isVisible({ timeout: 5000 }).catch(() => false))) return;
  await deleteBtn.click();

  const confirmBtn = page
    .getByRole('button', { name: /Confirm|Yes|Delete/i })
    .last();
  if (await confirmBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
    await confirmBtn.click();
  }
  await page
    .getByText(/deleted|removed.*successfully|success/i)
    .first()
    .waitFor({ state: 'visible', timeout: 10000 })
    .catch(() => {});
}

test('Catering - Districts - Newly added district appears immediately in the District Group Primary District dropdown', async ({
  page,
}) => {
  test.setTimeout(3 * 60 * 1000);

  const districtName = `Sabih Auto District ${Date.now()}`;
  let districtCreated = false;

  const catering = await loginToK12Catering(page, { navigateTo: 'Districts' });
  await catering.waitForLoadState('domcontentloaded');
  await expect(
    catering.getByRole('heading', { name: /District Management/i }).first(),
  ).toBeVisible({ timeout: 15000 });

  try {
    // ── Add District ──────────────────────────────────────────────────────
    await catering.getByRole('button', { name: /Add new district/i }).click();

    await catering.locator('#add-district-name').fill(districtName);

    // Multi-Tenant District = Yes. The radio is a visually-hidden custom input,
    // so check it with force.
    await catering.getByRole('radio', { name: 'Yes' }).first().check({ force: true });

    // The District Group select is disabled until Multi-Tenant is enabled.
    const groupSelect = catering.locator('#add-district-group');
    await expect(groupSelect).toBeEnabled({ timeout: 10000 });
    // Pick an existing group dynamically — group data on UAT changes, so a
    // hardcoded name (e.g. "DBurksGroup1") goes stale. The specific group is
    // incidental to what this test verifies.
    const groupName = (await groupSelect.locator('option').allTextContents())
      .map((o) => o.trim())
      .find((o) => o && !/^select|^choose/i.test(o));
    expect(groupName, 'Expected at least one District Group option').toBeTruthy();
    await groupSelect.selectOption({ label: groupName as string });

    await catering
      .locator('#add-environment-select')
      .selectOption({ label: ENV_LABEL });
    await catering.locator('#add-region-id').fill('1234');
    // First real timezone option (index 0 is the "Select timezone…" placeholder).
    await catering.locator('#add-timezone-select').selectOption({ index: 1 });

    await catering.getByRole('button', { name: /Add District/i }).last().click();
    await expect(
      catering
        .getByText(/district.*created|created.*successfully|success/i)
        .first(),
    ).toBeVisible({ timeout: 15000 });
    districtCreated = true;

    // ── Edit the District Group the district was added to ─────────────────
    const editGroupBtn = catering
      .getByRole('button', {
        name: new RegExp(`Edit .*${escapeRegExp(groupName as string)}`, 'i'),
      })
      .first();
    await scrollUntilVisible(catering, { target: editGroupBtn }).catch(() => {});
    await expect(editGroupBtn).toBeVisible({ timeout: 10000 });
    await editGroupBtn.click();

    const dialog = catering.getByRole('dialog').first();
    await expect(dialog).toBeVisible({ timeout: 10000 });
    await expect(dialog.locator('#district-group-name-input')).toHaveValue(
      groupName as string,
      { timeout: 10000 },
    );

    // ── Primary District dropdown lists the newly added district ──────────
    const primarySelect = dialog.locator('#district-group-primary-select');
    await expect(primarySelect).toBeVisible({ timeout: 10000 });

    await expect
      .poll(
        async () =>
          (await primarySelect.locator('option').allTextContents()).map((o) =>
            o.trim(),
          ),
        { timeout: 10000 },
      )
      .toContain(districtName);

    // Close the group dialog before cleanup.
    const cancelBtn = dialog.getByRole('button', { name: /^Cancel$/i }).last();
    if (await cancelBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
      await cancelBtn.click();
    } else {
      await catering.keyboard.press('Escape');
    }
  } finally {
    // Cleanup: remove the district created by this run so it doesn't accumulate.
    if (districtCreated) {
      await deleteDistrictByName(catering, districtName).catch(() => {});
    }
  }
});
